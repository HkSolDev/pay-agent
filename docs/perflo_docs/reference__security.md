> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Security

> How your account is protected, what Perflo can and cannot do, common scams to refuse, and how to report issues.

## The custody model

Your assets sit in a smart account that you control. There is no seed phrase to lose or leak; keys are created and protected inside secure infrastructure that Perflo cannot read. Perflo cannot move your money on its own. Everything that moves funds runs under a permission you granted, and every permission has limits and an expiry.

Two protections are absolute:

* **Withdrawals to external addresses always require a fresh confirmation from you.** No session, automation, or agent can approve one.
* **No permission can raise its own limits.** Only you can change limits, from a signed-in session.

## Sessions and revocation

Every connected app, automation, and agent appears in settings with the exact permissions it holds. You can revoke any of them instantly, and agent spending has a dedicated kill switch that stops everything at once. Sessions expire on their own if you do nothing.

Agent-specific threats (manipulated assistants, misbehaving services, runaway loops) get their own page: [Agent security](/agents/security) covers the full threat model.

## Account access

* Sign-in is by email one-time code. Codes are single-use and short-lived.
* Perflo staff never ask for your code, never ask you to install remote-access software, and never send deposit addresses in messages.
* Review active devices and sessions in settings and sign out anything you do not recognize.

## Verifying instead of trusting

Because everything settles on public blockchains, you never have to take Perflo's word for your balance:

* Look up your account address on a public explorer to verify holdings and history.
* Cross-check every token contract on [Networks and contracts](/reference/networks-and-contracts).
* Trading venues (Hyperliquid, Polymarket, Morpho) are public protocols with published contracts and audits.

## Common scams to refuse

* Anyone asking for your one-time code. Always a scam.
* "Support" contacting you first on Telegram, WhatsApp, or X. Perflo support works through the app and official channels only.
* A token contract sent in a chat that does not match this documentation.
* Pressure to act urgently. Real security issues are handled by freezing, which you can do yourself in one tap.

## If something looks wrong on your account

1. **Freeze first.** Cards freeze in one tap; the kill switch stops all agent spending instantly.
2. **Check your activity feed.** Every action on your account is there, labeled with what performed it.
3. **Revoke** any session or connection you don't recognize in settings.
4. **Then contact support** at [support@perflo.ai](mailto:support@perflo.ai) with the activity-feed entries. Support will never ask for your one-time code.

## Reporting a vulnerability

Found a vulnerability or something suspicious? Contact [security@perflo.ai](mailto:security@perflo.ai). Please do not test exploits against other users' accounts.
