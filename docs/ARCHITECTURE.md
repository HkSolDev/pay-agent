# Perflo AP Agent — System Architecture & Data Flow

This document provides the authoritative architectural specification and Mermaid diagrams representing the **current, real implementation** of the Perflo Accounts Payable (AP) Agent codebase. The older [`ARCHITECTURE_AND_PIPELINE_SPEC.md`](./ARCHITECTURE_AND_PIPELINE_SPEC.md) remains useful as a product/specification reference, but this file is the source for the architecture that exists in code now.

---

## 1. High-Level System Topology

```mermaid
flowchart TB
    subgraph External["External Services & APIs"]
        GMAIL["Gmail / Composio OAuth\n(Incoming invoices via polling)"]
        OPENAI["OpenAI API\n(gpt-5-mini / LLM Triage)"]
        RAZORPAY["RazorpayX Sandbox\n(Contact -> Fund Account -> Payout)"]
        PERFLO_CLI["Perflo CLI / Agent\n(Fallback Payout Engine)"]
    end

    subgraph Storage["Persistence Layer (PostgreSQL)"]
        DB[("PostgreSQL\n(Prisma ORM)")]
    end

    subgraph Backend["Worker Background Process (worker/src)"]
        SYNC["Ingest & Sync Loop\n(10-min overlap window, paused check)"]
        INGEST["Email ingestion\n(MIME, PDF, junk filter, dedupe)"]
        L1_PIPE["Level 1 AI Pipeline\n(Deterministic + LLM Fallback)"]
        PAY_RESOLVE["Payee Resolver\n(AES-GCM Decryption + HMAC Match)"]
        POLICY["Policy Engine\n(Guardrails & Confidence Checks)"]
        REEVAL["Policy Re-evaluation\n(read stored evidence + live runtime state)"]
        RESUME["Resume Auto-Pay\n(explicit pause-only action)"]
        AUTO_RUNNER["Auto-Pay Runner\n(Atomic Claim + Execution)"]
        EXECUTE["Shared Payment Execution\n(claim -> provider -> outcome)"]
        RECONCILE["Payment Reconciler\n(Background Poller for In-Flight Payouts)"]
    end

    subgraph Frontend["Next.js Web Application (app/app)"]
        QUEUE_UI["Payment Queue Dashboard\n(KPI Cards, Filter Tabs, Organic UI)"]
        DRAWER_UI["Review Drawer\n(Audit Evidence, Auth Headers, Actions)"]
        PAYEES_UI["Payees & Rails Management\n(Encrypted Rails, Caps, Auto-Pay Toggle)"]
        ACTIONS["Server Actions (app/app/actions.ts)\n(Prepare, Confirm & Pay, Sync, Pause, Re-evaluate, Resume)"]
    end

    %% Connections
    GMAIL <-->|Poll / Fetch Messages| SYNC
    SYNC --> INGEST
    INGEST --> DB
    DB --> L1_PIPE
    L1_PIPE <-->|Structured JSON Triage| OPENAI
    L1_PIPE <-->|Load Active Encrypted Rails| PAY_RESOLVE
    PAY_RESOLVE --> POLICY
    POLICY -->|decision = auto_pay| AUTO_RUNNER
    AUTO_RUNNER --> EXECUTE
    EXECUTE -->|Provider request| RAZORPAY
    EXECUTE -.->|Alternative Engine| PERFLO_CLI

    POLICY -->|decision = needs_approval / quarantine / ignore| DB
    AUTO_RUNNER --> DB
    SYNC --> DB
    RECONCILE <-->|Check in-flight status| RAZORPAY
    RECONCILE --> DB

    DB <--> QUEUE_UI
    DB <--> DRAWER_UI
    DB <--> PAYEES_UI
    QUEUE_UI --> ACTIONS
    DRAWER_UI --> ACTIONS
    ACTIONS --> DB
    ACTIONS -->|Manual Confirm & Pay| EXECUTE
    ACTIONS --> REEVAL
    ACTIONS --> RESUME
    REEVAL --> POLICY
    RESUME --> REEVAL
    RESUME --> AUTO_RUNNER
```

The `Global pause is enabled` text is a runtime policy blocker recorded during the last evaluation, not a permanent property of the invoice. The dashboard reads `AUTO_PAY_MODE` live on each render; **Re-evaluate policy** refreshes an existing invoice without paying it; **Resume auto-pay** is the only explicit action that can act on invoices previously blocked solely by the global pause.

## 2. Runtime controls and queue state

```mermaid
flowchart TD
    ENV["Runtime configuration\nAUTO_PAY_MODE / DEMO_MODE"] --> POLICY["Policy evaluation"]
    ENV --> BADGE["Live queue badge\nAuto-pay: live or globally paused"]
    SYNC_PAUSE["IngestCheckpoint.paused"] --> POLL["Worker Gmail poll"]
    SYNC["Sync now"] --> ONESHOT["sync-once-cli.ts"]
    ONESHOT --> POLL

    STORED["Stored Email evidence\nclassification, extraction, resolution,\nverification, duplicate result"] --> REEVAL["Re-evaluate policy"]
    ENV --> REEVAL
    PAYEE["Current payee grant + auto-pay toggle"] --> REEVAL
    REEVAL --> UPDATED["Persist fresh policyDecision\nand policyReasons"]

    UPDATED --> RESUME["Resume auto-pay\nexplicit user action"]
    ENV --> RESUME
    PAYEE --> RESUME
    RESUME --> EXEC["Same idempotent\nauto-pay executor"]
```

These controls are intentionally separate:

- `AUTO_PAY_MODE` controls automatic money movement and is off unless explicitly set to `on`.
- `DEMO_MODE` only permits a local demo sender to match an already-registered rail; it does not enable payment.
- `IngestCheckpoint.paused` controls whether the worker fetches new Gmail messages; reconciliation can still run.
- Re-evaluation refreshes policy state but never executes a payout.

---

## 3. Ingestion & Level-1 Pipeline Data Flow

```mermaid
flowchart TD
    START(["Incoming Gmail Message"]) --> INGEST["Ingest & MIME Parser\n(worker/src/ingest.ts, mime.ts)"]

    INGEST --> PDF_CHECK{"Has PDF Attachment?"}
    PDF_CHECK -- Yes --> PDF_PARSE["PDF Text Extractor\n(worker/src/pdf-extract.ts via pdf-parse)"]
    PDF_PARSE --> APPEND_TEXT["Append Extracted PDF Text to Body"]
    PDF_CHECK -- No --> JUNK_CHECK
    APPEND_TEXT --> JUNK_CHECK

    JUNK_CHECK{"Junk Filter\n(worker/src/junk-filter.ts)"}
    JUNK_CHECK -- Calendar / Newsletter / Receipt --> IGNORE_LABEL["Decision: ignore\n(Visible in queue as Other/All)"]
    JUNK_CHECK -- Invoice Candidate --> CLASSIFIER["6-Way Classifier\n(LLM / Rule-Based)"]

    CLASSIFIER --> INJ_CHECK{"Prompt Injection\nDetected?"}
    INJ_CHECK -- Yes --> QUARANTINE_INJ["Decision: quarantine\n(Prompt-injection attempt detected)"]
    INJ_CHECK -- No --> EXTRACTOR["Field Extractor\n(Payee, Amount, Currency, Ref, Rail, Dates)"]

    EXTRACTOR --> RESOLVER["Payee Resolver\n(worker/src/payee-resolver.ts)"]
    RESOLVER <-->|"Load Active Rails (AES-GCM)"| PAYEE_STORE[("Approved Payees Store")]

    RESOLVER --> VERIFIER["Verifier & BEC Checks\n(SPF, DKIM, DMARC, Domain Typosquatting)"]
    VERIFIER --> DUP_CHECK["Duplicate Detector\n(Fingerprint: Payee + Ref + Amount)"]
    DUP_CHECK --> POLICY_ENGINE["Policy Engine\n(worker/src/policy-engine.ts)"]

    POLICY_ENGINE --> DECISION{"Policy Decision Gate"}

    DECISION -- "Hard Fail / Injection / Phishing" --> QUARANTINE["quarantine\n(Hard security alert in UI)"]
    DECISION -- "Duplicate / Replayed" --> IGNORE["ignore\n(Suppressed from payouts)"]
    DECISION -- "Missing Field / Confidence < 90% / Over Cap / Manual" --> NEEDS_APP["needs_approval\n(Enters Owner Approval Queue)"]
    DECISION -- "Required confidence >= 90% + exact rail + caps OK + both auto-pay switches ON" --> AUTO_PAY["auto_pay\n(Automated Execution)"]

    AUTO_PAY --> EXECUTE_AUTO["runAutoPayIfEligible()\n(worker/src/auto-pay-runner.ts)"]
    EXECUTE_AUTO --> RAZORPAY_OUT["RazorpayX Payout API"]

    style START fill:#f9f4ed,stroke:#645c50
    style QUARANTINE fill:#2e2b25,stroke:#ffc6a5,color:#ffc6a5
    style IGNORE fill:#eee7db,stroke:#82796a
    style NEEDS_APP fill:#fff2eb,stroke:#c67139,color:#643312
    style AUTO_PAY fill:#f0fae1,stroke:#7a8a5e,color:#272e1b
```

---

## 4. Payee & Encrypted Rail Architecture

Payees are modeled with a **1-to-Many relational structure** supporting multiple sender email addresses and multiple encrypted payment rails (both UPI and Bank/NEFT) per vendor.

```mermaid
erDiagram
    Payee ||--o{ PayeeIdentity : "has sender emails (1:N)"
    Payee ||--o{ PayeePaymentMethod : "has payment rails (1:N)"
    Email ||--o| PaymentIntent : "unique email_id (1:1)"
    PayeePaymentMethod ||--o| PayeePaymentMethod : "replacedByMethodId (versioned)"

    Payee {
        string id PK
        string name "e.g. Test Auto-Pay Vendor"
        string recipientNickname "e.g. test-auto-pay-vendor-f8ccf1"
        boolean grantApproved "true once grant approved"
        string status "pending | approved | revoked"
        string grantPerPaymentCapInr "e.g. 1000.00"
        string grantTotalCapInr "e.g. 5000.00"
        int grantMaxPayments "e.g. 5"
        datetime grantExpiresAt "e.g. 2027-12-31"
        boolean autoPayEnabled "per-payee auto-pay toggle"
        datetime createdAt
        datetime approvedAt
    }

    PayeeIdentity {
        string id PK
        string payeeId FK
        string senderAddr UK "e.g. autopaytest@vendor.example"
        datetime approvedAt
    }

    PayeePaymentMethod {
        string id PK
        string payeeId FK
        string rail "upi | bank_neft"
        bytes encryptedPayload "AES-256-GCM encrypted payload"
        string lookupHash UK "HMAC-SHA256 blind index"
        string status "active | replaced | revoked"
        datetime createdAt
        datetime approvedAt
        datetime replacedAt
        datetime revokedAt
        string replacedByMethodId "Self-FK to new rail"
    }

    Email {
        string id PK
        string gmailMessageId UK
        string gmailThreadId
        string fromAddr
        string subject
        string bodyText
        json extractionSummary
        string extractionBackend "llm | deterministic"
        string resolvedPayeeId
        json payeeResolution
        json verificationResult
        json duplicateResult
        string policyDecision "auto_pay | needs_approval | quarantine | ignore"
        string[] policyReasons
        string reviewStatus "pending | approved | rejected | not_an_invoice"
    }

    PaymentIntent {
        string id PK
        string emailId FK "unique constraint"
        string recipientNickname
        string amount
        string currency "INR | USD"
        string idempotencyKey UK
        enum status "pending | claimed | paid | failed | unknown_outcome"
        string paymentReference "Razorpay payout ID (pout_...)"
        string lastError
        datetime claimedAt
        datetime paidAt
}
```

`PaymentIntent` intentionally has no Prisma `payeeId` foreign key in the current v0 schema. It stores the resolved `recipientNickname`, while the server-side executor looks up the current approved payee and rail before sending. The payee-to-payment relationship in the runtime flow is therefore logical, not a relational foreign key.

---

## 5. Payment Execution & State Machine

Every payout adheres to a deterministic state machine whether initiated automatically or manually.

```mermaid
stateDiagram-v2
    [*] --> Idle: Email Ingested (needs_approval)
    [*] --> AutoClaim: Policy Engine returns auto_pay (AUTO_PAY_MODE=on)

    state ManualGate {
        Idle --> Preparing: Owner clicks "Prepare payment"
        Preparing --> Pending: Server loads DB-resolved payee and extracted amount
        Preparing --> Idle: Owner cancels
        Pending --> Claimed: Owner clicks "Confirm & pay"
    }

    state AutoGate {
        AutoClaim --> Claimed: Atomic claim with resolved payee & amount
    }

    Claimed --> Paid: RazorpayX Payout Success (pout_...)
    Claimed --> Failed: Definite Rejection (Bad IFSC / Validation Error)
    Claimed --> UnknownOutcome: Network Timeout / Ambiguous State

    Failed --> Claimed: Owner clicks "Retry"

    state Reconciliation {
        UnknownOutcome --> Paid: Reconciler Poller confirms payout succeeded
        UnknownOutcome --> Failed: Reconciler Poller confirms payout rejected
    }

    Paid --> [*]
```

---

## 6. Security & Isolation Invariants

1. **No Blind Auto-Pay**:
   - Auto-pay is gated by **two independent switches**: a deployment-wide environment variable (`AUTO_PAY_MODE=on`) AND a per-payee toggle (`Payee.autoPayEnabled=true`).
   - Requires 100% pass on all 5 primary confidence scores ($\ge 0.90$), exact payee resolution, aligned sender auth, verifier score $\ge 80$, and grant cap compliance.
2. **Encrypted Rail Storage**:
   - Plaintext VPAs and bank accounts are never stored directly in database columns. They are encrypted with `AES-256-GCM` using `PAYEE_ENCRYPTION_KEY` and indexed with `HMAC-SHA256` using `PAYEE_HASH_KEY`.
3. **No Editable Payout Target**:
   - Payment execution binds directly to the verified database entity (`resolvedPayeeId` and approved rail) and extractor amount, never to free-form text inputs.
4. **Idempotent Payouts**:
   - Every `PaymentIntent` mints a cryptographically random `idempotencyKey` preserved across retries, preventing double-payouts.
5. **Background Process Isolation**:
   - Background email sync and payment reconciliation run in a separate worker process, keeping the Next.js web application bundle free of runtime SDK conflicts.
