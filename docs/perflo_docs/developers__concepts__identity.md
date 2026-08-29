> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Identity model

> Understand customer Perflo tokens and mandate-scoped pairing tokens.

Every public authenticated request resolves to one immutable principal: customer or agent. The principal determines which routes can be called and which identity is attributed to each operation.

## Customer

A customer principal comes from a verified Perflo EdDSA access token. The gateway validates its signature, issuer, audience, subject, wallet claim, and issue time. Customer integrations must hold this token server-side because it is authority over the customer's Perflo account. Browser exposure turns script execution into financial authority.

The customer token does not become the gateway's linked device credential. Work on the customer's account uses a separate gateway device linked through `/v1/perflo-connections`; the API never returns that device's stored credential.

## Agent

An agent principal comes from an opaque `pfa_` token. It names one pairing and one mandate. The gateway derives scopes from the mandate kind rather than trusting caller-provided claims:

| Mandate kind          | Scopes                                                 |
| --------------------- | ------------------------------------------------------ |
| `service_purchase`    | `services:read`, `purchases:read`, `purchases:execute` |
| `beneficiary_payment` | `mandates:read`, `mandates:execute`                    |

The agent's self-asserted display name is always unverified. A customer can revoke one pairing without changing other mandates. The token's maximum age forces a refresh checkpoint but does not rotate or shorten the copied token's authority; active revocation remains essential.

## Confirmation is not identity

A confirmation intent binds a normalized action and payload to one use. Customer-token freshness is measured from the token's `iat` claim. Refreshing a customer token can therefore satisfy the freshness check; this is not an independent multifactor-authentication ceremony. Integrators must not describe it as one.
