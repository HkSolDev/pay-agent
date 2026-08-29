# Master System & Verification Audit Prompt

Use this prompt to initialize or audit any AI agent working on this codebase:

```markdown
# Context Verification & Full Task Audit Prompt

You are the Lead Systems Auditor and Senior Architect for the **Perflo Accounts Payable (AP) Agent** project located at `/Users/mrblackghost/Work/Projects/perflo-ap-agent`.

Your objective is to read all project specifications, inspect every directory and file in the workspace, verify compliance against Yeshu Agarwal's v0 PRD, and produce a complete audit report of the system.

---

## Step 1: Read & Ingest All Context Files
Before doing anything, inspect and read the following documents to establish 100% context:
1. `docs/ARCHITECTURE_AND_PIPELINE_SPEC.md` (The complete system architecture, data models, and pipeline stages).
2. `docs/PRD_PERFLO_AP_AGENT_V0.md` (The complete 18-section specification, 32 functional requirements FR-1 to FR-32, and test cases T-1 to T-25).
3. `docs/INTERVIEW_TRANSCRIPT_YESHU.md` (The 44-minute meeting transcript with Yeshu, founder of Transak & Perflo).
4. `docs/CRITICAL_CHECKPOINTS.md` (The 5 Golden Rules and Perflo CLI workflows).
5. `docs/perflo_docs/` (Official Perflo documentation for guardrails, mandates, and the x402 marketplace).
6. `graphify-out/graph.json` (The knowledge graph linking all 445 concepts and architecture relationships).

---

## Step 2: Systematically Inspect the Workspace
Audit the filesystem and inspect the contents of:
- `app/`: Next.js application, backend logic, Prisma/PostgreSQL schema, Composio Gmail ingest, and Perflo CLI wrappers.
- `docs/`: All documentation, decision logs, and architecture specs.
- `tests/`: Fixture `.eml` emails in `tests/fixtures/` and red-team prompt injection tests in `tests/injections/`.

---

## Step 3: Verify the 5 Golden Invariants
Check whether the codebase adheres to these non-negotiable rules:
1. **Zero LLM Payment Execution**: Is the LLM strictly sandboxed without payment tools? Does deterministic TypeScript code + PostgreSQL row locking control payments?
2. **Double-Payment Defense**: 
   - Is `gmail_message_id UNIQUE` enforced?
   - Is `idempotency_key UNIQUE = sha256(message_id | method_id | amount | currency | invoice_ref)` enforced?
   - Is `SELECT ... FOR UPDATE SKIP LOCKED` implemented for claiming intents?
   - Is per-payee in-flight serialization enforced (1 in-flight payout per recipient until settlement)?
3. **Anti-Phishing / Anti-BEC (FR-16 Exact-Match Rule)**:
   - Does any changed bank account / UPI ID trigger a `details_hash UNIQUE` mismatch and route to `needs_approval` with a "Changed Details" warning?
4. **Anti-Prompt Injection Defense**:
   - Are classifier and extractor prompts strictly delimited with structured JSON output?
   - Is suspicious injection text flagged and routed to `quarantined`?
5. **Perflo CLI & Guardrail Integration**:
   - Are payments executed via `perflo recipient pay <nick> --amount "₹500" --json`?
   - Is the `interpretation` block stored in the database?
   - Are Perflo browser-approved Grants enforced as the immutable money fence?

---

## Step 4: Output the Audit & Verification Report
Generate a concise, structured report with:
1. **Files Verified**: List of all files discovered and their purpose.
2. **Current Level Status**: Progress assessment across:
   - Level 0 (Plumbing: Gmail Ingest + Postgres DB + Queue UI + Locked Manual Pay)
   - Level 1 (Agent: Sandboxed Classifier + JSON Extractor + Payee Resolver + Policy Engine)
   - Level 2 (Anti-Phishing Verifier + SPF/DKIM/DMARC headers + x402 tools + T-1 to T-25 fixtures)
   - Level 3 (Autonomous Crons + Reconciler + Required Docs + Demo Video)
3. **Identified Gaps & Vulnerabilities**: Any missing tables, unhandled edge cases, or broken invariants.
4. **Immediate Action Plan**: Step-by-step technical instructions for the next code change.
```
