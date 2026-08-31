# Perflo AP Agent

An accounts-payable agent that watches a Gmail inbox for invoices, verifies who's actually asking to be paid before trusting anything in the email, and pays through guardrails the owner set up in advance — automatically when every check passes, otherwise held for a manual click.

The goal is explainable, safe payment processing: no LLM ever touches money, every decision is traceable, and a payee only gets paid automatically if their exact registered rail matches what's on file.

## Architecture

```text
Gmail ──▶ ingest ──▶ classify ──▶ extract ──▶ resolve payee ──▶ verify ──▶ policy engine ──▶ execute payment
        (Composio)   (LLM, no    (LLM, no    (code: exact     (auth,      (deterministic    (Perflo or
                      tools)      tools)      rail match       lookalike   code, never       RazorpayX —
                                              only)             domains,    an LLM)           swappable)
                                                                 injection
                                                                 detection,
                                                                 duplicates)
                                                                              │
                                                              ┌───────────────┼────────────────┐
                                                              ▼                                ▼
                                                       auto_pay: pays now              needs_approval / quarantine:
                                                       through the configured           held in the review queue
                                                       payment executor                 for a manual decision
```

**Payment execution is a swappable interface** (`worker/src/payment-executor.ts`), not hard-coded to one provider. Two adapters exist: **Perflo** (wired but inert — KYC/account access hasn't cleared yet) and **RazorpayX test-mode** (live today). Which one runs is chosen by which environment variables are set; nothing upstream of it — classification, extraction, resolution, verification, the policy decision — knows or cares which provider it's talking to.

**No LLM is ever in the path that moves money.** The classifier and extractor have zero tools. The policy engine that decides `auto_pay` / `needs_approval` / `quarantine` / `ignore` is plain deterministic code. The only thing that ever calls a payment provider is the executor, after the policy engine says so or a human clicks "Confirm & pay."

Full pipeline detail, the data model, and the threat-model-to-control mapping live in [`docs/ARCHITECTURE_AND_PIPELINE_SPEC.md`](docs/ARCHITECTURE_AND_PIPELINE_SPEC.md). The original product spec is in [`docs/PRD_PERFLO_AP_AGENT_V0.md`](docs/PRD_PERFLO_AP_AGENT_V0.md).

## Guardrails

- **Exact-match payee resolution** — auto-pay only if the sender's registered rail (UPI ID or bank account) matches exactly. A changed rail, an unknown sender, or a known rail from the wrong sender all fall back to manual review, never a guess.
- **Sender authentication** — DMARC/SPF/DKIM alignment with the visible From domain.
- **Lookalike-domain and prompt-injection detection** — a spoofed sender domain or an email trying to instruct the agent directly both route to quarantine.
- **Duplicate detection** — the same invoice (by payee, reference, and amount) never pays twice.
- **No-double-payment guarantees** — one payment intent per logical payment (idempotency key), a single-writer claim so two processes can't both pay the same invoice, one in-flight payment per recipient at a time, and a reconciliation poller that resolves stuck/unknown outcomes without ever re-paying. Verified live, not just unit-tested: real sandbox payouts sent, manually advanced through RazorpayX's Test Mode dashboard, and correctly picked up by the reconciler.
- **Auto-pay is off by default**, gated by two independent switches that must both be on: a deployment-wide `AUTO_PAY_MODE=on` env var, and a per-payee toggle on the Payees page — on top of every check above.

## Current status

- Full pipeline live: ingest, classify, extract, resolve, verify, policy, execute, reconcile.
- Payment execution through RazorpayX test-mode today; Perflo wired in behind the same interface for the moment its access clears.
- Auto-pay, exact payee/rail matching, and the no-double-payment guarantees are all live-verified with real sandbox payouts, not just unit tests.
- `pnpm typecheck` and `pnpm build` are clean. `pnpm test` passes, with 4 known pre-existing, unrelated local-fixture failures documented in `tests/README.md`.
- **No login/auth on the app** — deliberate for now, not an oversight. Payment execution runs through one shared RazorpayX test-mode account, so a per-user login would just mean every tester needs their own funded sandbox account to see anything work. Anyone with the deployed URL can currently view every invoice and manually trigger a real (sandbox) payout — add real auth or a host-level password gate before sharing this beyond trusted testers.
- **Not built yet**: the paid (x402) verification layer (link-checking, sender-deliverability checks, phone callback), and formal `EDGE_CASES.md`/`DECISIONS.md` writeups.

## Run locally

```bash
pnpm install
docker compose up -d
pnpm --dir packages/db exec prisma migrate deploy
pnpm test
pnpm typecheck
pnpm dev
```

Classification and extraction are deterministic (rule-based) by default. LLM calls are opt-in — set these in `.env` to use them:

```text
CLASSIFIER_MODE=llm
EXTRACTOR_MODE=llm
```

Route payments through RazorpayX test-mode instead of Perflo by setting `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_ACCOUNT_NUMBER`; unset, Perflo stays the default (inert until connected). Set `AUTO_PAY_MODE=on` and turn on a payee's auto-pay toggle to let a matching invoice pay automatically — see `.env.example` for what each variable does before touching this outside a fully understood test environment.

Run the local seeded demo inbox, without Gmail or money movement:

```bash
pnpm demo:inbox --list
pnpm demo:inbox --reseed
pnpm demo:payees --reseed
```

`--reset` only removes the namespaced `demo-*` rows it created; it never touches real inbox data, and `demo:payees` never calls Perflo — its recipient/grant ids are local placeholders until Perflo is actually connected.

Keep API keys only in the local environment. Never commit `.env` or paste real credentials into an AI prompt.

## Next work

1. **Perflo isn't connected yet** — KYC/account access is still pending on that side; RazorpayX fills the payment-execution role until it clears.
2. **The x402 paid verification layer** (link-checking, sender-deliverability, phone callback) isn't built — only the free/deterministic verifier checks exist today.
3. **Real auth** before this goes beyond trusted testers with a shared link.
4. A dedicated Gmail test mailbox for ingestion validation, and a demo video walking through the guardrails.
