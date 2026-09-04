# Edge cases

Every edge case considered, how it's handled, and whether it's actually tested —
as the PRD (Section 16.1) asked for. Mapped against the PRD's own threat table
(Section 8.1) and test plan (Section 15) where they overlap, plus a few not in
the PRD.

## Phishing / verification

| Edge case | Handled how | Tested |
|---|---|---|
| Display-name spoof (real name, wrong address) | Verifier hard-fails when name matches a known payee but address doesn't | Yes — `verifier.test.ts` |
| Lookalike sender domain/handle | Verifier hard-fails | Yes — `verifier.test.ts` |
| Compromised real mailbox, changed bank/UPI details | `payee-resolver.ts` treats any detail mismatch as `details_changed`, routes to `needs_approval`, never auto-pays | Yes — `payee-resolver.test.ts` |
| Reply-To hijack (From real, Reply-To attacker) | Verifier flags Reply-To mismatch combined with a payment-method mismatch | Yes — `verifier.test.ts` |
| Thread hijack (attacker replies into real thread with new details) | Same `details_changed` path as any changed-details case — thread continuity doesn't override it | Handled by the same code path as above; no thread-specific fixture yet |
| Invoice link to a page with attacker's own details | Verifier hard-fails when final link domain conflicts with the approved sender domain | Yes — `verifier.test.ts` |
| PDF from a real payee with edited bank details | Same `details_changed` path; no PDF-vs-prior-PDF comparison (PRD marks this a stretch goal) | Detail-mismatch path tested; PDF-specific stretch not built |
| Prompt injection in email body | Classifier prompt keeps untrusted content in a delimited block; injection-flagged messages hard-fail in the verifier | Yes — `classifier-prompt.test.ts`, `verifier.test.ts` |
| Prompt injection in PDF (hidden/white text) | Same extraction pipeline treats PDF text as untrusted content; not verified against an actual hidden-text PDF fixture | Not directly tested — no `.eml`/PDF fixture with white-on-white text exists yet |
| Amount/currency ambiguity (₹500 vs $500, no symbol) | Extractor never guesses currency; ambiguous currency forces low confidence, blocking auto-pay | Yes — `extractor-payment-details.test.ts` covers amount/date ambiguity; explicit currency-ambiguity fixture not present |
| Urgency / pressure phrasing ("pay today or else") | Not implemented as a standalone signal | Not handled — PRD marks this soft-flag-only, but no code exists for it at all yet |
| VPA resolves to a mismatched account-holder name | Not implemented — Perflo's UPI payout name-return behavior was never confirmed (Perflo access blocked until 4 Sep) | Not handled, not tested |
| Fake "approve this payment" phishing email to the owner | Not exploitable in practice only because no approval-email flow exists yet at all | N/A — whole feature not built |
| Attacker sends owner ₹1 first to build "history" | `payee-resolver.ts` requires an *approved* payee record, not just message history, so this doesn't create eligibility on its own | Implicit in the resolver's design; no dedicated fixture |

## No double payment (PRD Section 9.3, evaluated first per Section 16.3)

| Edge case | Handled how | Tested |
|---|---|---|
| Same Gmail message ingested twice | `gmail_message_id` unique constraint at the DB layer | Assumed from schema constraint; not exercised by an ingest-replay test specifically |
| Two workers claiming the same intent | `claimPaymentIntent` row-level claim — only one succeeds | Yes — `payment-claim.test.ts` ("only one of two concurrent claims... succeeds") |
| Same payee, two invoices at once | Per-payee serialization lock | Yes — `payee-serialization.test.ts` |
| Same invoice number resent | Duplicate detector marks it `duplicate`, never paid | Yes — `duplicate-detector.test.ts` |
| Same (payee, amount) within days, no invoice number | Duplicate detector flags for review | Yes — `duplicate-detector.test.ts` ("different amount with same reference... requires approval") |
| Worker crash mid-payment (between provider call and DB write) | Intent stays `claimed`/`unknown_outcome`; reconciler resolves it from provider activity, never retries blindly | Yes — `payment-reconcile.test.ts` covers stuck/still-processing/failed outcomes; a real `kill -9` crash test (PRD's T-21) hasn't been run |
| Retry creates a second intent | `claimPaymentIntent` re-claim path only applies to the same row, never creates a new one | Yes — `payment-claim.test.ts` ("re-claims a failed intent") |
| A reminder email creates a second payable | Not explicitly tested against a reminder-classification fixture | Classifier has a `reminder` label; no test confirms it links back to the original rather than creating a new invoice |

## Extraction and payee resolution

| Edge case | Handled how | Tested |
|---|---|---|
| Invalid UPI VPA / malformed IFSC | Rejected at extraction, no payment method manufactured | Yes — `extractor-payment-details.test.ts`, `payment-method-validation.test.ts` |
| Both UPI and bank details present in one invoice | Extractor keeps both; policy requires the owner to choose rather than picking automatically | Yes — `extractor-payment-details.test.ts` |
| Known VPA from an unapproved sender | Resolver marks `unknown_sender`, not auto-payable | Yes — `payee-resolver.test.ts` |
| Same identity+method belonging to two different payee records | Resolver reports a conflict rather than silently picking one | Yes — `payee-resolver.test.ts` |
| Newsletter that mentions a dollar amount | Junk filter still routes it to `ignored`, not treated as an invoice | Yes — `junk-filter.test.ts` |
| Genuine invoice that happens to mention a past payment | Junk filter doesn't discard it | Yes — `junk-filter.test.ts` |
| Ambiguous/ill-formed date on an invoice | Extractor refuses to guess; no fallback reference without a trustworthy date | Yes — `extractor-payment-details.test.ts` |

## Payment routing (specific to this build, not in the original PRD)

| Edge case | Handled how | Tested |
|---|---|---|
| Perflo CLI command names changing between the PRD and the live CLI | Found by running the real CLI's `--help` on 4 Sep once an account was connected; `perflo-cli.ts` updated to match (`recipient`→`beneficiary`) | Confirmed manually against the live CLI; not covered by an automated test since it depends on an external binary |
| Perflo's India schema having no UPI rail, only bank/IFSC | Documented as an open question for Perflo (`DECISIONS.md`); payee storage stays rail-agnostic so no schema migration is needed once resolved | N/A — external dependency, not a code path to test |
| RazorpayX and Perflo producing different reference/receipt shapes | `payment-executor-adapter.ts` normalizes both into one legacy result shape before the rest of the pipeline sees it | Yes — `payment-executor-adapter.test.ts` |

## Payout economics (found live, 4 Sep 2026, not in the original PRD)

| Edge case | Handled how | Tested |
|---|---|---|
| Small invoice amount vs. flat payout fee | Not handled in code at all — the connected account's INR payout rail charges a flat ~₹100 fee per transfer regardless of amount. A ₹200 test payment only delivered ₹99.20. Nothing in the policy engine currently checks whether an invoice amount is even worth paying given the fee — it would happily auto-pay a ₹50 invoice and lose ₹50+ to fees | Confirmed live (real ₹200 payment, real bank receipt) — no automated test exists, and no minimum-viable-amount check exists in `policy-engine.ts` |

This is a real gap worth closing before auto-pay runs on genuinely small
invoices: the policy engine should probably refuse (or at least flag) a
payment whose fee would consume most of its value, similar in spirit to
FR-19's other auto-pay gates.

## Known gaps, not edge cases handled poorly — just not built

- x402 paid verification (email deliverability, headless-browser link opening, phone callback) — blocked on the same Perflo access issue as payments; only became reachable on 4 Sep, not yet used.
- Login/auth and outbound approval emails — queue is open, no signed-link approval flow exists.
- Recurring-invoice detection (PRD FR: mark next expected, flag missing/extra in a month) — not built.
- Grant/policy expiry warnings and auto-drop-to-needs-approval on expiry — not built (no live grant exists yet to test against).
- A real `kill -9` crash-recovery test (PRD's T-21) — the code path exists (see the crash row above) but hasn't been exercised as an actual process-kill test.
