> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Provision a partner wallet

> Prove control of an existing embedded wallet and permanently bind the Privy user to a fresh Perflo wallet.

**Goal:** a permanent partner link with `linked: true` and a Perflo wallet address for the signed-in Privy user.

Provisioning uses a 120-second challenge and an Ethereum Improvement Proposal 191 (EIP-191) wallet proof. Rebuild the signed text locally, confirm it matches Perflo's response byte for byte, and only then ask the user's existing wallet to sign.

## Prerequisites

* Completed [partner request authentication](/developers/partner-wallets/authentication).
* A current Privy access token for the signed-in user.
* Privy identity tokens enabled for your application.
* Exactly one embedded Ethereum wallet in the user's Privy identity token.
* Your registered partner name, web origin, and Perflo Privy App ID.

## 1. Read the current link

Sign and send `POST /partner/v1/link/status` with an empty JSON object:

```json theme={null}
{}
```

An unlinked user returns:

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "linked": false,
  "recoveryFactors": [],
  "walletAddress": null
}
```

Continue only when `linked` is `false`. If it is `true`, use the current binding. A linked response can carry `walletAddress: null` when the bound wallet is unavailable, but that state does not permit another wallet to replace it.

## 2. Mint a provisioning challenge

Sign and send `POST /partner/v1/provision/challenge` with exactly `{}`. Perflo returns one live challenge per subject, so concurrent requests converge on the same nonce until it expires.

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "expiresAt": "2026-08-20T12:02:00.000Z",
  "message": "Connect your Perflo wallet to Acme Pay\n\nThis proves you control the Acme Pay wallet and creates a separate Perflo wallet for this account.\nIt does not send a transaction, move funds, give Acme Pay the Perflo signing key, or approve later actions.\n\nAcme Pay: https://app.acme.com\nPerflo: https://api.perflo.ai\nPerflo App ID: cm0perfloappid0000000000\nRequest nonce: UvImZaYMEtKJGF2VDuiBNgkWb2sRPReNbA_TkB_yOaE",
  "nonce": "UvImZaYMEtKJGF2VDuiBNgkWb2sRPReNbA_TkB_yOaE"
}
```

Require the returned `appASubject` to match the bearer user's Privy decentralized identifier (DID). Stop at `expiresAt`; an expired challenge must be replaced.

## 3. Rebuild and compare the challenge text

The response's `message` is a convenience, not signing authority. Construct these exact nine lines with line feed characters, two blank lines, no carriage returns, and no trailing newline:

```typescript theme={null}
function buildProvisionChallenge(nonce: string): string {
  return [
    `Connect your Perflo wallet to ${partnerName}`,
    '',
    `This proves you control the ${partnerName} wallet and creates a separate Perflo wallet for this account.`,
    `It does not send a transaction, move funds, give ${partnerName} the Perflo signing key, or approve later actions.`,
    '',
    `${partnerName}: ${registeredPartnerOrigin}`,
    'Perflo: https://api.perflo.ai',
    `Perflo App ID: ${perfloPrivyAppId}`,
    `Request nonce: ${nonce}`,
  ].join('\n');
}
```

Compare `buildProvisionChallenge(nonce)` with `message` using exact string equality. Stop if they differ.

The registered partner name is signed material. It must be 1 to 40 characters using letters, digits, spaces, and `. , & ' ( ) -`; it cannot have leading, trailing, or doubled spaces, and it cannot equal `Perflo`, `Perflo App ID`, or `Request nonce`.

The partner name, registered origin, and Perflo Privy App ID all affect the signed bytes. Coordinate any registration change with Perflo before changing the values used by your application.

## 4. Sign with the attested partner wallet

Obtain a fresh Privy identity token immediately before signing. Use the embedded Ethereum wallet attested by that token to produce an EIP-191 `personal_sign` signature over the locally rebuilt message.

Before requesting either token or signature, snapshot the current `appASubject`, Privy session when present, embedded-wallet object, and wallet address. After every awaited token or wallet operation, require all four values to remain current. Discard the completion if the user logs out, the subject or session changes, or Privy replaces the wallet object or address.

Keep these three values together for confirmation:

* `nonce`: the challenge nonce.
* `signature`: the EIP-191 proof over the exact nine-line message.
* `walletAddress`: the existing embedded wallet that produced the proof.

The identity token must describe the same user as the access token. When it includes a `sid`, both tokens must describe the same session.

## 5. Confirm the proof and create the binding

Immediately before sending, recheck the subject, session, wallet object, and wallet address captured in step 4. Never let a signature completed under an earlier browser identity confirm a later user's binding.

Sign and send `POST /partner/v1/provision/confirm`. Add the same user's identity token as `Privy-Id-Token`, and send exactly these body keys:

```json theme={null}
{
  "nonce": "UvImZaYMEtKJGF2VDuiBNgkWb2sRPReNbA_TkB_yOaE",
  "signature": "0x123456789012345678901234567890123456789012345678901234567890123412345678901234567890123456789012345678901234567890123456789012341b",
  "walletAddress": "0x1234567890123456789012345678901234567890"
}
```

A successful confirmation returns the permanent link:

```json theme={null}
{
  "appASubject": "did:privy:clz9k1abc4defghijklmnop",
  "linked": true,
  "recoveryFactors": ["wallet"],
  "walletAddress": "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"
}
```

The response address is the new Perflo wallet, not the existing wallet that produced the proof. A fresh wallet starts with `wallet` as its recovery factor; `passkey` can appear later.

Confirmation is idempotent and safe to retry. An existing link returns its live status, and an existing provisioning operation resumes without asking for another proof.

## 6. Verify the authoritative status

Read `POST /partner/v1/link/status` again with the same user's bearer token. Require all of these conditions before enabling message signing:

* `appASubject` matches the signed-in Privy user.
* `linked` is `true`.
* `walletAddress` is a valid non-null Ethereum address.
* `recoveryFactors` is an array with no more than 16 entries.

Do not take link state from browser messages or a cached confirmation response when a fresh status read is available.

## If something goes wrong

* `401 signature_invalid`: rebuild the challenge, compare it with the response again, and retry the proof before `expiresAt`. The failed proof does not consume the challenge.
* `401 unauthorized`: refresh the Privy credentials, then check partner request signing. Credential failures are deliberately indistinguishable.
* `403 challenge_expired`: mint a new challenge and obtain a new wallet signature.
* `409 provisioning_recovery_required`: stop retrying and contact `support@perflo.ai`. Include the partner ID, `appASubject`, and timestamps, but never include tokens or the partner secret.
* `502 provisioning_failed`: retry the same confirmation body while its authorization remains recoverable. Do not mint parallel proofs for another wallet.
* `linked: true` with `walletAddress: null`: the permanent binding exists but its wallet is unavailable. Contact support rather than attempting to rebind.

## Where to go next

Continue with [sign a message](/developers/partner-wallets/sign-messages), or check the [partner wallet endpoint reference](/developers/partner-wallets/reference).

<Warning>
  Provisioning is permanent and first writer wins. There is no unbind or rebind endpoint, so verify the signed-in Privy user and attested embedded wallet before confirmation.
</Warning>
