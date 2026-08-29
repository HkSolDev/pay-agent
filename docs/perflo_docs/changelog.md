> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Changelog

> Product and documentation changes, newest first, with notice periods for anything that breaks.

## How we communicate changes

* Everything notable lands here, newest first: new features, changed behavior, and anything deprecated or removed.
* Breaking changes get notice before they happen. If a change affects how you or your agents work (a limit, a connector behavior, a supported currency or network), the entry says what changes, when, and what to do about it.
* Anything that needs action from you comes with a migration guide. The entry links to a page that walks through it.

<Update label="August 2026" description="Card-account withdrawals can be submitted">
  **`POST /v1/card-account/withdrawals` starts a card-account withdrawal and returns a `202` operation.** The request names the customer's card, a United States dollar amount, and an asset from the deposit address's `accepted_assets`. The amount must be exactly representable in whole cents and must be no more than `9007199254740991` cents. How it is spelled does not change what is accepted: `10.25`, `10.250`, and `1.025E+1` are one value. Repeat the same amount spelling under the same `Idempotency-Key`. The exponent spelling `1.025E+1` canonicalizes to plain `10.25`, while the trailing-zero spelling `10.250` remains distinct from `10.25`. It takes the new confirmation action `card_withdrawal.create` and produces the new operation kind `card_withdrawal`.

  A definitively accepted operation rests at `submitted` and carries the withdrawal identifier as `external_reference`. Match that identifier to `id` in `GET /v1/card-account/withdrawals` to read the withdrawal's open status, transaction hash, and completion. The route answers `202` whether or not card withdrawals are available: when they are not, the operation reaches `failed` with `failure_code: "card_withdrawal_unavailable"`, which is a definitive refusal. Branch on `failure_code`, not on the response status.

  No existing operation or field is renamed.
</Update>

<Update label="August 2026" description="Card profiles, funding, identity verification, and single-card reads are available">
  **Eight synchronous card operations now cover the card account and individual card metadata.** `GET /v1/cards/{card_id}` reads one card, and `PATCH /v1/cards/{card_id}` changes or clears its private label. `GET /v1/card-account` reads the profile, Know Your Customer (KYC) state, deposit balance, and lifetime deposited total.

  The card account also exposes its full customer-only funding address, unpaginated deposit and withdrawal lists, the current KYC state, and hosted KYC-session creation. The funding address states its primary asset as `asset`. Deposits answer an object carrying the rows, their credited total, and the `card_id` they belong to; withdrawals answer a bare array whose rows each name their own card. Deposit and withdrawal statuses are open strings. No existing operation or field is renamed.

  **`POST /v1/cards` trims the private label and is at most 80 characters after the trim; a blank label becomes null.** This changes an operation that already existed. The label stored for a request carrying surrounding spaces, or a label of nothing but spaces, is no longer what was sent, and the idempotency and confirmation hashes taken over the body move with it, so two spellings that used to replay as two requests now replay as one. Send the label already trimmed and nothing changes.
</Update>

<Update label="August 2026" description="Amount strings are spelled one way on every operation">
  **Every amount string is written out in full, never in exponent notation.** An amount below a millionth reads as `0.0000001` rather than `1E-7`.

  **How many decimal places it carries depends on where the amount comes from.** An amount answered from a stored record — a mandate cap, a remaining allowance, a card balance, a purchase price, a withdrawal amount — reads at its own scale, with the places the record adds dropped: `12.500000000000000000` reads as `12.5`. An amount Perflo states in the same request is published exactly as stated, trailing zeros included: `12.50` stays `12.50`.

  **One spelling is the exception.** Writing an amount out in full is bounded, so a value carrying more redundant zeros than that bound admits reads at its own scale rather than as it arrived. The bound is wide enough that no amount inside the published limit reaches it; what it catches is padding rather than precision.

  This covers every operation that carries an amount, including ones that existed before, so a serialized amount string on an existing operation can change byte for byte. The values are unchanged and no field is renamed. Parse an amount as a decimal and nothing about it moves; compare amount strings byte for byte and update the expected spelling.

  **The same limit binds on what you send.** An amount carries at most 20 digits before the decimal point and at most 18 after it — 38 in total at the full-scale corner — and one carrying more is refused with `422` rather than accepted and rounded when it is stored. The limit counts the value rather than the spelling it is written in: redundant trailing zeros carry nothing and are ignored, so `1.000000000000000000000` is one digit and no decimal places. Round an amount to at most 18 decimal places before sending it.
</Update>

<Update label="August 2026" description="Beneficiaries can be found and relabeled synchronously">
  **Beneficiary metadata includes three additional synchronous operations.** `GET /v1/beneficiaries/address-countries` lists the countries accepted in beneficiary address fields. `GET /v1/beneficiaries/by-nickname/{nickname}` returns the complete beneficiary projection for an exact private label. `PATCH /v1/beneficiaries/{beneficiary_id}` trims, changes, or clears that label without creating an operation; duplicate labels answer `409 beneficiary_nickname_taken`.

  No existing operation or field is renamed. `POST /v1/beneficiaries` and `PATCH /v1/beneficiaries/{beneficiary_id}` bound `nickname` at 80 characters after trimming.
</Update>

<Update label="August 2026" description="Identity verification can use a customer-specific HTTPS page">
  **Hosted identity verification uses the HTTPS page Perflo states for the customer.** The URL check requires no embedded credentials and a host of at least two ASCII labels of letters, digits and inner hyphens, none of them `localhost`, none beginning `xn--`, and a final label that is neither all digits nor `0x` hex. It does not verify ownership, name resolution, or reachability. The Perflo verification page remains the fallback.
</Update>

<Update label="August 2026" description="Every agent's authority can be stopped in one call">
  **One call now ends every agent's authority on an account.** `POST /v1/mandates/revoke-all` revokes every active pairing and opens one mandate revocation for each mandate that still holds authority, answering `202` with the batch, one operation for each revocation, and the revoked pairing identifiers. It takes the new confirmation action `mandate.revoke_all` over `{}` and produces the new operation kind `mandate_revoke_all`.

  A mandate already revoked, awaiting approval, refused at approval, awaiting revocation, or holding no exact authority opens no revocation. Neither does a service-purchase mandate past its expiry, whose expiry already ended its authority. Any pairing it has is still cut. Within the replay window `GET /v1/identity` publishes, an equal replay under the same idempotency key returns the same batch, so a mandate created after the first call is not covered by it. Past that window an equal replay is no longer guaranteed the same batch, and the batch may still answer for as long as it is retained, so never reuse the key to re-run a revoke-all: read the mandates and their operations to reconcile, and open any new revoke-all with a fresh confirmation intent and a fresh idempotency key.

  Nothing is renamed and no existing name moves.
</Update>

<Update label="August 2026" description="Beneficiary grants can be revoked through the API">
  **A grant made directly on a Perflo account can now be revoked without opening the Perflo app.** `POST /v1/mandates/beneficiary-grants/{grant_id}/revoke` ends one grant and answers `202` with the operation that tracks it. It takes the new confirmation action `beneficiary_grant.revoke` over `{"grant_id":"grant_id"}` and produces the new operation kind `beneficiary_grant_revoke`. Only grants returned by `GET /v1/mandates/beneficiary-grants` can be revoked this way; a mandate's own grant is revoked with the mandate through `POST /v1/mandates/{mandate_id}/revoke`.

  The operation that tracks a mandate revocation names the mandate by `resource_id`.

  Nothing is renamed and no existing name moves.
</Update>

<Update label="August 2026" description="The beneficiary-grant surface, nineteen published names, and a connection status">
  **Automatic-payment grants made directly on a Perflo account are now published as beneficiary grants**, using the same word as the rest of the API. `GET /v1/mandates/provider-grants` becomes `GET /v1/mandates/beneficiary-grants`, and `POST /v1/mandates/provider-grants/{grant_id}/payments` becomes `POST /v1/mandates/beneficiary-grants/{grant_id}/payments`. `ProviderGrantView` and `ProviderGrantPaymentCreate` become `BeneficiaryGrantView` and `BeneficiaryGrantPaymentCreate`; the confirmation action `provider_grant.spend` becomes `beneficiary_grant.spend`; the operation kind `provider_grant_payment` becomes `beneficiary_grant_payment`.

  Four further changes land with it, none aliased:

  * `OperationView.upstream_reference` is now `external_reference`.
  * `PurchaseView.price_cap_enforcement` reads `at_charge` or `preflight` instead of `upstream` or `local`. The values now say when the ceiling binds: `at_charge` applies it to the charge itself, `preflight` checks the price immediately before and after.
  * Sixteen problem codes are renamed. They reach you as `code` on a problem document and as `OperationView.failure_code`, both of which you match on:

  | Was                                        | Is                                                                                                                                                                     |
  | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `provider_authorization_required`          | `account_authorization_required`                                                                                                                                       |
  | `provider_grant_destination_mismatch`      | `beneficiary_grant_destination_mismatch`                                                                                                                               |
  | `provider_grant_inactive`                  | `beneficiary_grant_inactive`                                                                                                                                           |
  | `provider_grant_exhausted`                 | `beneficiary_grant_exhausted`                                                                                                                                          |
  | `provider_grant_amount_exceeded`           | `beneficiary_grant_amount_exceeded`                                                                                                                                    |
  | `provider_grant_context_invalid`           | `beneficiary_grant_context_invalid`                                                                                                                                    |
  | `beneficiary_provider_context_missing`     | `beneficiary_context_missing`                                                                                                                                          |
  | `beneficiary_provider_context_invalid`     | `beneficiary_context_invalid`                                                                                                                                          |
  | `beneficiary_provider_context_unavailable` | `beneficiary_context_unavailable`                                                                                                                                      |
  | `provider_connection_changed`              | `perflo_connection_superseded` (a new code, not the existing `perflo_connection_changed`, which stays and means the connection moved while your request was in flight) |
  | `provider_transport_error`                 | `perflo_transport_error`                                                                                                                                               |
  | `provider_evidence_collision`              | `evidence_collision`                                                                                                                                                   |
  | `provider_dispatch_failed`                 | `dispatch_failed`                                                                                                                                                      |
  | `provider_transaction_failed`              | `transaction_failed`                                                                                                                                                   |
  | `mandate_provider_mismatch`                | `mandate_grant_mismatch`                                                                                                                                               |
  | `identity_provider_unavailable`            | `signin_verification_unavailable`                                                                                                                                      |

  * `PerfloConnectionView.status` and `OnboardingView.perflo_connection` no longer carry `operator_action_required`. A link that needs attention reads `reconnect_required`, and one with nothing to reconnect to reads `not_connected`.

  The list above is the whole migration: update code that reads the old names or matches the old values, and take the new types from TypeScript SDK `0.1.0-beta.11`. This lands without a notice period because no integrator is pinned to the old names yet; breaking changes after general availability follow the notice policy at the top of this page. The grant surface is documented on [agent mandates](/developers/guides/agent-mandates).
</Update>

<Update label="August 2026" description="Accounts move to Base; cash is USDC">
  **Perflo accounts now run on Base, and your cash balance is held in USDC.** The app still shows one clean dollar balance, and network fees stay sponsored. There is nothing to install, approve, or move yourself.

  What changed for accounts on Base:

  * **Cash is USDC.** USDT is no longer held. If you send USDT to your deposit address it is converted to USDC for you on arrival, so an in-flight transfer is never lost.
  * **Your deposit address is on Base.** Always copy it from inside the app; the app shows the network to send on.
  * **Earn** runs on a curated shortlist of public Morpho USDC vaults on Base, each named in the app and listed on [Networks and contracts](/reference/networks-and-contracts).
  * **Buying assets and borrowing are not available.** Both remain documented for accounts opened before the move, under Ethereum accounts (legacy).
  * **Futures, prediction markets, cards, payouts, and agent spending are unchanged.**

  Accounts opened before the move stay on Ethereum, and nothing about those positions changed. [Assets](/money/assets) and [Borrow](/money/borrow) describe what they can still do. The contracts behind both are on [Networks and contracts](/reference/networks-and-contracts).
</Update>

<Update label="August 2026" description="Bank identifiers publish in full under new field names">
  **A customer's own account number, IBAN, beneficiary or grant destination, and linked-account identifier are returned in full** on the routes that customer's own token can reach. The fields that carry them are renamed, with no alias for the old names: `BankDetails.account_number_masked` and `iban_masked` are now `account_number` and `iban`; `BeneficiaryView.destination_masked` and `ProviderGrantView.destination_masked` are now `destination`; `PerfloConnectionView.account_hint` is now `account_identifier`; `OnboardingView.perflo_account_hint` is now `perflo_account_identifier`. The list above is the whole migration: update code that reads the old names, and take the new types from TypeScript SDK `0.1.0-beta.10`. This lands without a notice period because no integrator is pinned to the old names yet; breaking changes after general availability follow the notice policy at the top of this page. The fields are documented on [accounts and KYC](/developers/guides/accounts-kyc) and [connect a Perflo login](/developers/get-started/connect-perflo).
</Update>

<Update label="August 2026" description="Disconnecting Perflo keeps account authority">
  **The provider binding is now fixed per account.** Reconnecting after a credential rejection, an out-of-band device revocation, or an explicit disconnect reuses the same binding, so mandates, agent pairings, beneficiaries, cards, quotes, and webhook subscriptions survive every reconnect flow.

  `DELETE /v1/perflo-connections/current` no longer requires revoking active mandates first. It now only refuses while an operation holds unsettled provider authority, and it erases the stored credential instead of deleting the link record. If the customer wants an agent's standing authority stopped, revoke the mandate before disconnecting: revoking a beneficiary-payment mandate needs the credential the disconnect erases, so `POST /v1/mandates/{mandate_id}/revoke` answers `409 account_authorization_required` once the account is disconnected. See [connect a Perflo login](/developers/get-started/connect-perflo).
</Update>

<Update label="August 2026" description="CLI signing endpoints now relay through the gateway">
  **`/cli/sign/start` and `/cli/sign/poll` are proxied through the gateway**, completing the seven `/cli/*` relays. Sign start takes the customer bearer token; sign poll is public, with the session ID as the capability. Sign start answers with the signing session and the customer's approval URL. Sign poll answers with the approval status and, once it completes, a transaction result carrying `txHash` and a transaction status of `submitted`, `processing`, `executing`, `success`, or `failed`. Neither response carries a credential. Update code that called `https://api.perfolio.ai` directly for signing, and see [authentication and token lifecycle](/developers/concepts/authentication) for the full table.
</Update>

<Update label="August 2026" description="SDK live API exercise">
  The SDK repository now includes a [live TypeScript exercise](/developers/get-started/live-api-exercise) that connects a customer account, capability-gates production reads, and journals every opt-in financial mutation before submission.
</Update>

<Update label="August 2026" description="TypeScript SDK 0.1.0-beta.9">
  **Generated result errors now cover every runtime failure honestly.** The non-throwing `error` field is `unknown`; use the new `isProblemDetails` guard before reading a problem code, detail, or retry hint.

  Throw mode raises a raw decode error without attaching the HTTP response. Keep the default non-throwing mode when recovery logic needs response metadata.
</Update>

<Update label="August 2026" description="TypeScript SDK 0.1.0-beta.8">
  **Generated operations now reject malformed success bodies.** They decode their declared successful response as JSON even when a server sends an incorrect content type. Empty or malformed non-`204` bodies return a decode error with the HTTP response instead of fabricated successful data.

  `204` responses still return undefined data, and a JSON `null` remains null. For a malformed response to a financial mutation, preserve the original idempotency controls and reconcile before another write.
</Update>

<Update label="August 2026" description="TypeScript SDK 0.1.0-beta.7">
  **Generated SDK results now match their TypeScript declarations.** Generated operations always return field-style results, while `throwOnError` remains available per call. Shared result configuration can no longer change the shape or throwing behavior behind a generated return type.

  The new [TypeScript SDK reference](/developers/reference/typescript-sdk) lists the complete client and all 59 generated operations.
</Update>

<Update label="August 2026" description="TypeScript SDK 0.1.0-beta.6">
  **Authenticated SDK requests now run in Cloudflare Workers.** Upgrade to `0.1.0-beta.6` if you use the SDK in a Worker. Earlier previews configured a redirect mode that the Workers runtime rejected before dispatch.

  The client still never follows redirects. It returns redirects as non-ok results and continues to attach `Authorization` only to authenticated operations.
</Update>

<Update label="August 2026" description="TypeScript SDK 0.1.0-beta.5">
  **Agent token refresh and mutation recovery added.** The SDK can refresh mandate-scoped agent tokens explicitly or once after an authenticated `401`. Automatic retries preserve the original request body and idempotency controls.

  The new `isSubmissionUncertain` and `isDefinitiveNoOperation` helpers identify whether a failed financial mutation is safe to replace or must be reconciled.
</Update>

<Update label="August 2026" description="Developer docs">
  **Developer platform and API reference added.** Building on Perflo now has documentation in the same place as the product docs, in two new tabs:

  * **Developer platform** covers the server integration end to end: [authorizing a customer device](/developers/get-started/authorize-device), [connecting a Perflo login](/developers/get-started/connect-perflo), the [TypeScript SDK guide](/developers/get-started/typescript-sdk), its complete [method reference](/developers/reference/typescript-sdk), and task guides for accounts, transfers, cards, spending, [agent mandates](/developers/guides/agent-mandates), [service purchases](/developers/guides/service-purchases), and [webhooks](/developers/guides/webhooks).
  * **API reference** publishes every operation and schema, generated from the same contract the gateway runs.

  Nothing changed for app users. The Guides tab holds exactly the pages it held before.
</Update>

<Update label="July 2026" description="Docs relaunch">
  **Documentation relaunched.** These docs were rebuilt end to end around user journeys:

  * A [Quickstart](/quickstart) that takes you from sign-up to funded account in about ten minutes.
  * Troubleshooting pages for [getting started](/getting-started/troubleshooting), [cards and payouts](/cards-banking/troubleshooting), and [agents](/agents/troubleshooting), placed next to the workflows they cover.
  * A complete [agent errors and denials reference](/agents/errors-and-denials) with every machine-readable denial code, plus a dedicated [agent security](/agents/security) page on the full operational loop.
  * The pay-per-call [service marketplace](/agents/services) got its own page.
</Update>
