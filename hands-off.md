# Perflo AP Agent — Hands-off Handoff

Last verified: 2026-08-30 11:10 IST  
Branch: `level1-classifier-llm`  
Latest commit: `c189131` (`UI: show confidence for every extracted field`)

## Current outcome

Level 0 is complete and Level 1 is implemented in **review-only/dry-run mode**. The project has been independently checked against the current code, PRD, architecture spec, and Yeshu interview notes.

The latest verification ran against local Postgres:

- `pnpm test`: **177/177 passing** across 29 test files
- `pnpm typecheck`: clean
- Prisma: **8 migrations applied; database up to date**
- Git worktree: clean
- No automatic payment is enabled
- No successful real payment has been proven because Perflo KYC is still pending

KYC is an external dependency, not a reason to stop development. Continue building and demonstrating the review flow without connecting the Perflo agent screen or moving real money.

## Architecture decisions

The money boundary is deterministic:

```text
Gmail/Composio
  → MIME body + PDF text extraction
  → cheap deterministic junk filter
  → classifier (rule-based by default; LLM opt-in, no tools)
  → payment-detail extractor (deterministic by default; LLM opt-in, strict JSON)
  → exact approved-payee resolver
  → deterministic verifier
  → duplicate detector
  → deterministic policy engine
  → review queue
  → manual Perflo payment only
```

The classifier and extractor can read untrusted email data but have no tools, no browser, and no payment permission. Their JSON is validated again by backend code. Prompt injection, malformed output, network failure, and extractor timeout fall back safely.

Payment identifiers follow one validation boundary. Ordinary addresses such as `billing@gmail.com` are not accepted as UPI VPAs. Approved payee rails are encrypted with AES-GCM and looked up with a keyed HMAC; the derived email review summary stores only rail type/count, not raw rail details.

Level 1 writes a reviewable result to the email row: extraction summary, backend used, payee resolution, verification result, duplicate result, policy decision, reasons, and processing time. It never calls the automatic-pay executor. Missing, uncertain, new, or changed information becomes `needs_approval`; injection or hard verifier failures become `quarantine`; obvious non-payables become `ignore`.

## What is complete

- Gmail ingestion, MIME parsing, HTML/plaintext/multipart handling, and restart-safe checkpoint.
- PDF attachment fetch and text extraction with attachment count/size limits.
- Deterministic junk pre-filter for newsletters, calendar messages, and known receipts.
- Six-way classifier: invoice, payment request, reminder, receipt, statement, unrelated.
- Classifier prompt-injection protection, including escaped delimiters, Unicode smuggling, role directives, and exfiltration wording.
- Deterministic extractor for payee, amount/currency, invoice reference, issue/due dates, UPI, and bank details.
- LLM extractor with strict structured output validation and timeout fallback.
- Approved payee model, encrypted payment-method storage, shared rail validation, and real Postgres loader.
- Payee resolver for exact sender/rail matches, new payees, changed details, unknown senders, conflicts, and multiple rails.
- Verifier for authentication alignment, reply-to mismatch, lookalike domains, link mismatch, injection, and rail mismatch.
- Duplicate detector, policy engine, per-payee in-process serialization, and safe auto-pay gate. These are not active payment execution paths yet.
- Queue UI now displays pay amount, invoice reference, field confidence, verifier score, authentication state, rail type, warning, duplicate status, and policy reason.
- Small commits for validation, LLM extraction, encrypted payee loading, pipeline persistence, and UI.

## Exact next task

Build the **Queue row review drawer**, in English, without changing payment execution.

When the owner selects a row, show:

1. Original email text safely rendered; no remote images and no clickable links.
2. PDF attachment names, extraction success/failure, and extracted text status.
3. Payee, amount, currency, invoice reference, issue date, due date, payment rail type, and every field confidence.
4. Verifier evidence: authentication, reply-to, sender/domain, link, injection, and changed-rail checks.
5. Duplicate result and the original email reference when available.
6. Full policy decision and all reasons, not just the first reason.
7. Timeline: received, classified, extracted, verified, reviewed, and manually paid if applicable.
8. Clear owner actions: approve for review, reject, mark not an invoice, or retry processing. Do not add automatic approval or arbitrary recipient payment.

Write UI tests or pure rendering tests first. Test these demo fixtures: English invoice, multi-line PDF invoice, German PDF text, newsletter with a price, prompt injection, changed UPI, bank details, and duplicate invoice. German/scanned/unsupported-currency content must remain reviewable when fields cannot be extracted; never guess.

## Work that can proceed while KYC is pending

- Add the row drawer and safe email/PDF display.
- Add demo fixtures and a seeded local demo mode that uses no Gmail or money.
- Run classifier/extractor in review-only mode and compare deterministic versus LLM results.
- Add Sync Now and the global Pause control.
- Add full database-backed approval persistence and owner approval screens.
- Add red-team `.eml` fixtures and CI coverage for injection, changed rails, German/multiline PDFs, and duplicate invoices.
- Add OCR/image-only PDF detection that routes to review.
- Add event/audit timeline storage.
- Document the supported-currency boundary: current structured extraction is INR/USD; unsupported currencies require review.

## Work blocked or gated by KYC/Perflo access

After KYC clears, connect/login to Perflo, verify the connected account identity, and make one small manual payment. Confirm it in Perflo Activity and test the error/retry path. Do not enable auto-pay immediately.

Before any automatic payment, finish:

- Perflo recipient/grant approval UI and real grant persistence.
- Reconciliation for a crash after Perflo accepts a payment but before the database update.
- Global Pause and Sync Now behavior.
- Shared database/distributed lock if more than one worker will run.
- Persistent duplicate/content-hash checks and Gmail labels.
- x402/browser link verification and rail-level account-name verification.
- T-7 through T-25 real or reproducible acceptance tests, with no payment in the red-team cases.

## Do not do

- Do not connect the Perflo “Connect an agent” screen merely to continue Level 1; it is not required for this review-only work.
- Do not put API keys in chat, prompts, commits, or screenshots.
- Do not treat an LLM confidence score as authorization.
- Do not display or copy raw bank/UPI details into derived review JSON.
- Do not enable `AUTO_PAY_MODE` or make a real payment until the reconciliation and approval controls are proven.

## Handoff commands

```bash
pnpm test
pnpm typecheck
pnpm --dir packages/db exec prisma migrate status
git log --oneline -8
```

The PRD remains the desired end state. This handoff records what the code actually does today so another AI must verify the repository before extending it.
