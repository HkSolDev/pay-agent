> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Perflo Finance API

> Connect a Perflo account and integrate money movement, mandates, cards, and live service purchases through one API.

Perflo Finance API is a server integration over Perflo's money rails. Your backend authorizes a customer device, connects the gateway to the same Perflo login, and then calls one API for account data, transfers, cards, spending, agent mandates, service purchases, and webhooks.

The public gateway is `https://api-gateway.perflo.ai`. The API reference in these docs is generated from the same contract the service runs. Its required-field examples are non-interactive starting points, so customer credentials and one-time secrets never enter a browser playground or a documentation proxy. Apply the caller-specific requirements in the task guides before sending them.

<Note>
  If you only want an existing AI assistant to use a Perflo account, you do not need this API. Add the Perflo connector instead: see [Connect an agent](/agents/connect). This tab is for building your own server integration.
</Note>

## Use the correct API surface

| Surface                 | Credential                                                                                                                     | Use it for                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `/cli/*`                | None for device start, device poll, token refresh, and sign poll; customer token for device list, token revoke, and sign start | Provision and maintain a customer's Perflo token and relay signing approvals            |
| `/v1/*` customer routes | Customer Perflo token                                                                                                          | Onboarding, KYC, accounts, transfers, mandates, cards, spending, and customer purchases |
| `/v1/*` agent routes    | Gateway `pfa_` token                                                                                                           | Actions allowed by one active customer mandate                                          |
| Webhook receiver        | Per-subscription HMAC secret                                                                                                   | Verify operation events sent by the gateway                                             |

Operator endpoints are internal and are not part of this external API.

## Start in this order

1. [Authorize a customer device](/developers/get-started/authorize-device) to obtain and safely store the customer's Perflo access and refresh tokens.
2. [Connect the customer's Perflo login](/developers/get-started/connect-perflo) so gateway routes can operate on the same account.
3. [Make the quickstart calls](/developers/get-started/quickstart) to verify identity, onboarding state, capabilities, and accounts.
4. [Use the TypeScript software development kit (SDK)](/developers/get-started/typescript-sdk) to make typed calls from a Node.js backend.
5. Read [confirmation and idempotency](/developers/concepts/confirmation-idempotency) before sending a financial mutation.
6. Subscribe to [signed operation webhooks](/developers/guides/webhooks), or poll operations until they settle.

## Choose a task guide

<CardGroup cols={2}>
  <Card title="Accounts and KYC" icon="user-check" href="/developers/guides/accounts-kyc">
    Read onboarding, verification, deposit accounts, display currency, and activity.
  </Card>

  <Card title="Beneficiaries and transfers" icon="money-bill-transfer" href="/developers/guides/beneficiaries-transfers">
    Build a payout form, create a beneficiary, quote a transfer, and complete approval.
  </Card>

  <Card title="Manage cards and card funding" icon="credit-card" href="/developers/guides/cards">
    Read and fund the card account, issue and relabel a card, and manage its lifecycle.
  </Card>

  <Card title="Spending funds" icon="wallet" href="/developers/guides/spending">
    Read held funds and withdraw a specified amount or all available funds.
  </Card>

  <Card title="Agent mandates" icon="user-shield" href="/developers/guides/agent-mandates">
    Delegate bounded payment or service authority through a revocable pairing.
  </Card>

  <Card title="Service purchases" icon="cart-shopping" href="/developers/guides/service-purchases">
    Discover, quote, buy, and follow live service purchases.
  </Card>
</CardGroup>

The **API reference** tab contains every published operation and schema, grouped by contract tag. Use it for exact fields, constraints, response codes, and generated request examples. Use these guides for the order in which to call those endpoints. Two reference pages cover the cross-cutting rules: [currencies and money](/developers/reference/currencies) for amount handling, and the [glossary](/developers/reference/glossary) for the identity, device, operation, and mandate terms these guides assume.

## Respect the authority boundary

The gateway never returns its stored device credential or card PAN or CVV. A customer's own account number, IBAN, beneficiary destination, linked-account identifier, and card-account deposit address publish in full on the routes only that customer's own token can reach. Customer tokens stay on your server. Agents receive only a `pfa_` token derived from one active mandate.

Every mandate bound is rechecked immediately before submission: the active pairing, the mandate itself, the current connection, the amount and count limits, the destination, and the exact grant being spent. Reserved capacity is taken atomically, so two concurrent executions cannot both spend the same headroom. A request over a cap is refused rather than queued.

<Note>
  The seven `/cli/*` endpoints are proxied by this gateway: device start, device poll, token refresh, device list, token revoke, sign start, and sign poll. The relay stores none of the relayed token or signing payloads.
</Note>
