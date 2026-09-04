# Decisions

One paragraph per decision, why it was made, as the PRD (Section 16.1) asked for.

## Payment execution: pluggable interface, RazorpayX live today, Perflo behind it

Perflo KYC didn't clear despite following up over several days, and there was no
point stalling the whole build on that. `worker/src/payment-executor.ts` defines
one interface; `payment-executor-perflo.ts` and `payment-executor-razorpay.ts`
are two implementations of it. `payment-executor-select.ts` picks RazorpayX only
when its three env vars are set — unset, Perflo is the default. Everything
upstream (classify, extract, resolve, verify, decide) never sees which one is
running. As of 4 Sep, Perflo is connected (see below) and is now the live path.

## Perflo connected under a teammate's account, not personal KYC

Personal KYC is still pending. A teammate (Abhinav) gave explicit permission and
the OTP to connect his own Perflo account so the CLI integration could be tested
for real rather than staying an untested guess. This is a stopgap, not the
intended end state — the PRD requires the app to read back the connected
account's email and refuse to run if it isn't the owner. Real auto-pay against a
teammate's money should not run unattended; only manual, confirmed test payments
were run this way.

## First real Perflo payment call: response shape was also a guess, and was wrong

4 Sep 2026: ran a real `beneficiary pay` against a deliberately-fake test
account (placeholder IFSC/account number, so nothing would actually reach a
real person). Real response: `{"ok":true,"status":"timeout","moved":true,
"confirmed":false,"paymentId":"...","txHash":"0x..."}` — fields are top-level,
not nested under `data` as `perflo-cli.ts` guessed from the CLI's help text.
`tx status` on that hash afterward showed `"status":"failed"` — the fake
account was correctly rejected, no money reached anywhere. Fixed
`classifyPerfloStdout` to read top-level fields and to treat `confirmed:false`
as `PerfloUnknownOutcomeError` even when a `txHash` is present — a reference
existing doesn't mean the payment landed, only `tx status`/`activity` can
confirm that, which is exactly what the reconciler is for. Both affected unit
tests (`perflo-cli.test.ts`) updated to the real shape.

## The Perflo CLI had renamed its commands since the PRD was written

The PRD (26 Aug) documents `perflo recipient add` / `perflo grant enable` /
`perflo recipient pay`. The installed CLI (`@perflo/cli@6.1.0`) uses
`beneficiary` and `policy` instead — confirmed directly against `--help` output
once a real account was connected on 4 Sep. `worker/src/perflo-cli.ts` was
calling the old, now-nonexistent command and had never been run against a live
account before, so this was never caught earlier. Fixed to call
`beneficiary pay`.

## Perflo's India beneficiary schema has no UPI-by-VPA option

`perflo beneficiary schemas --country IN` returns only `bank.in.inr` (IFSC +
account number) — no UPI schema exists in the connected account. The PRD's test
plan assumes paying a VPA directly (e.g. `riya@okaxis`). This is an open
question for Perflo, not something fixable from this side; documented here so
it isn't mistaken for a bug in this codebase. `payee-approval-deps.ts` still
stores payment methods generically (UPI or NEFT) at the database layer, so once
Perflo exposes a UPI rail (or the answer is "pay through NEFT with resolved bank
details instead"), no schema change is needed here.

## LLM is boxed into classify/extract only, everything else is code

Per the PRD's own architecture: the classifier and extractor take no tools and
return structured JSON only; the verifier's checks (auth alignment, lookalike
domains, injection scanning, changed-details detection) are deterministic code,
not an LLM judgment call; the policy engine and payment executor are plain code
paths an LLM can never reach. This is the actual safety property of the system,
not a nice-to-have — it means a prompt injection anywhere in an email, PDF, or
page can, at worst, cause a misclassification, never a payment.

## Exact-match payee resolution is the single hard gate, not a score

`payee-resolver.ts` treats sender identity + payment-method hash as the only
path to auto-pay eligibility (mirrors FR-16). A new sender, a new payment
method, or any mismatch between the two routes to `needs_approval` regardless of
how convincing everything else looks. This was kept as a hard boolean rather
than folding it into the verifier's soft score, because a scored system can be
tuned into paying a changed-bank-details attack if the weights drift — the PRD
calls this out as the single control that kills most business email compromise
on its own, and it shouldn't be adjustable by a threshold.

## Auto-pay is gated by two independent switches plus every other guardrail

`AUTO_PAY_MODE` (deployment-wide) and a per-payee opt-in toggle both have to be
on, on top of the policy engine's own `auto_pay` decision, before a payment
executes. Two switches instead of one so a single flipped env var can't turn on
unattended spending for every payee at once — a payee has to be individually
opted in even after the feature itself is enabled.

## Idempotency and locking live at three separate layers

A unique `idempotencyKey` on `payment_intent`, a row-level claim
(`claimPaymentIntent`, `SELECT ... FOR UPDATE`-style) so only one worker can
move an intent from `pending` to `claimed`, and a per-payee lock so two intents
for the same payee never execute concurrently. These are three different
failure modes (duplicate intent creation, two workers racing the same intent,
two intents for one payee racing each other) and each needed its own control —
collapsing them into one check was tried informally during design and found to
miss the "same payee, two different invoices" case.

## DEMO_MODE exists to test the pipeline without needing arbitrary real senders

`DEMO_MODE=true` relaxes payee resolution to allow any sender (see
`level1-pipeline.ts`), used only for seeding realistic-looking test scenarios
through `demo:inbox`/`demo:payees`. It never touches the payment step itself —
`demo:payees` explicitly never calls Perflo, its recipient/grant IDs are local
placeholders. This was necessary because testing "does the verifier catch a
lookalike domain" realistically needs a range of sender addresses that a single
real test inbox can't produce on its own.

## Payee approval doesn't call Perflo yet — deliberately stubbed

`payee-approval-deps.ts`'s `createPerfloRecipient`/`enablePerfloGrant` generate
a local nickname and grant ID instead of calling the CLI. This let the Payees
UI, review routing, and the whole approval flow get built and demoed before any
Perflo account was connected. Now that Perflo is connected (see above), this is
the next thing that should be made real — it needs `beneficiary add` /
`policy enable`, using the corrected command names.

## No login/auth built yet

The PRD's approval flow (Section 10.2) is a signed, single-use email link →
login → approval page. This build is queue-only with no auth and no outbound
approval emails — deprioritized in favor of getting the pipeline (classify →
extract → resolve → verify → decide → pay) solid first, since that's what
Section 16.3 says is evaluated first. Known gap, not an oversight.

## No x402 verification — blocked by the same Perflo access issue, not skipped separately

Section 8.3's checks (`verify_email`, `browse_web`, `search_web`, `make_call`)
are Perflo's own marketplace/MCP tools, not a separate provider. They were
unreachable for the same reason payments were: no connected, KYC'd account.
Only the free/deterministic checks in Section 8.2 exist. This is one root cause
with two consequences, not two independent gaps, and is worth testing now that
an account is connected.
