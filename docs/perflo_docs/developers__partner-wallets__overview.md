> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Partner wallet API

> Provision a Perflo wallet for an existing Privy user and request one text-message signature at a time.

Use the partner wallet API when your application already signs users in with Privy and needs a separate Perflo wallet for each user. You prove control of the user's existing embedded wallet once, then request a signature over one text message at a time.

<Note>
  The partner wallet API returns Ethereum Improvement Proposal 191 (EIP-191) `personal_sign` signatures over caller-selected text. A relying service can attach consequences to a valid signature, so treat message selection as authority rather than harmless text.
</Note>

## Choose the Perflo surface that matches your integration

Perflo exposes two developer surfaces with different credentials and purposes:

| Surface                                    | Base URL                        | Use it for                                                                                        |
| ------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------- |
| Partner wallet API                         | `https://api.perflo.ai`         | Provision a separate Perflo wallet for an existing Privy user and request text-message signatures |
| [Perflo Finance API](/developers/overview) | `https://api-gateway.perflo.ai` | Accounts, identity checks, cards, transfers, agent mandates, service purchases, and webhooks      |

Partner wallet requests do not use Finance API customer or agent credentials. The four backend requests use a Privy user token and backend-held partner signing secret. The signing frame validates a single-use handoff nonce instead.

## Register the partner integration

Registration binds your credentials and browser origin before the first request. Send Perflo these values through the agreed secure onboarding channel:

* Your registered partner display name.
* Your Privy App ID.
* The exact web origin that will frame Perflo.

Perflo returns the API origin `https://api.perflo.ai`, the Perflo Privy App ID, your partner ID, the current key version, and the signing secret with its fingerprint.

Enable identity tokens in your Privy application. No Privy app secret crosses between applications; the partner signing secret is a separate backend credential issued for this API. Contact `support@perflo.ai` to start registration or correct a registered name, App ID, or origin.

The registered name, origin, and Perflo Privy App ID are signed into every provisioning challenge. Change them only after Perflo confirms the matching registration.

## Provision once, then sign messages

The integration has two phases:

1. **Provisioning:** mint a 120-second challenge, have the user's existing embedded wallet sign its exact nine-line text, and confirm the proof. Perflo creates a fresh wallet and permanently binds it to that partner user.
2. **Message signing:** bind one `personal_sign` message to a 60-second handoff, load the Perflo signing page in an iframe, and receive the automatic signature at your registered origin.

`POST /partner/v1/link/status` reads the binding before, during, or after either phase.

## Treat the binding as permanent

The first valid confirmation for a partner subject wins. Concurrent confirmations converge on the same Perflo user, and later confirmations return the current link status.

There is no unbind or rebind endpoint. Do not treat provisioning as an account-selection screen or retry it with another wallet after a link exists.

## Keep each credential in its intended boundary

Four routes run from your backend and combine a [partner request signature](/developers/partner-wallets/authentication) with the signed-in user's Privy access token. Provisioning confirmation also carries the user's Privy identity token.

The iframe URL exposes only a single-use handoff nonce to your parent page. The cross-origin Perflo frame resolves the bound message and wallet itself. The partner signing secret never enters browser code, neither Privy token enters the iframe URL, and Perflo never returns the wallet key.

<CardGroup cols={2}>
  <Card title="Authenticate requests" icon="key" href="/developers/partner-wallets/authentication">
    Create the exact HMAC signature, bind it to a Privy user token, and rotate keys.
  </Card>

  <Card title="Provision a wallet" icon="link" href="/developers/partner-wallets/provisioning">
    Rebuild the challenge, verify the user's wallet proof, and create the permanent binding.
  </Card>

  <Card title="Sign a message" icon="signature" href="/developers/partner-wallets/sign-messages">
    Mint a handoff, embed the signing page, and validate the returned signature.
  </Card>

  <Card title="Read the endpoint reference" icon="file-code" href="/developers/partner-wallets/reference">
    Check exact request keys, response fields, errors, limits, and nonce consumption.
  </Card>
</CardGroup>
