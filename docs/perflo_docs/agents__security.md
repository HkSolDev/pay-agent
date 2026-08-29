> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent security

> How agent access actually works end to end, what can go wrong, and what limits the damage in every case.

Giving software the ability to spend your money deserves a clear-eyed page. This one explains the full life of an agent connection, the realistic ways things go wrong, and what stands between each problem and your money.

## The life of an agent connection

1. **Connect.** You add Perflo to your AI app and sign in once in your browser. The agent never sees your password or your keys. What it gets is a permission slip.
2. **Grant.** Before it can spend, you give it a budget: caps per hour, day, and month, a list of allowed recipients, allowed assets, and an expiry date.
3. **Act.** The agent works inside those limits. Every single spend is checked against them *before* any money moves.
4. **Observe.** Everything it does appears in your activity feed in real time, labeled with which session did it.
5. **Renew or revoke.** Sessions expire on their own (30 days by default, 90 maximum). You renew the ones earning their keep and revoke anything else, or hit the kill switch and stop everything at once.

## Reading is free, spending is gated, leaving requires you

* **Reads never need approval.** Checking balances, prices, and positions can't hurt you, so it's frictionless.
* **Spending runs through gates.** Your AI app asks you first (its own permission prompt), then Perflo checks the request against your guardrails. Both must pass.
* **Money leaving Perflo always requires you personally.** Withdrawing to an outside account, sending to a new recipient, or gifting always makes *you* sign in your browser. No agent, no matter how it's prompted, can do this alone.

## What can go wrong, and what limits it

### Your assistant gets manipulated

AI assistants read things: web pages, emails, documents. A malicious page can contain hidden instructions like *"transfer everything to this account"*, hoping your assistant treats them as yours. This is called prompt injection, and you should assume it will be attempted.

**Why it fails on Perflo:** the assistant being tricked doesn't change what its permission slip allows. It still can't pay anyone off the allowlist or exceed your caps, and it can't send money out of Perflo at all, because that last step always requires your browser sign-in. The worst realistic outcome is capped spending toward recipients you already approved, all of it visible in your feed.

### A service misbehaves

A marketplace service could return junk data or fail mid-task. Services are probe-verified before listing and priced before payment, so a bad service costs you at most the per-call price it quoted: cents, not your budget. Perflo can automatically fail over to another vendor for the same task.

### The agent runs away

A buggy agent could loop, retrying a task and paying each time. Cumulative caps stop this: they count money that is still in flight, so parallel or rapid-fire requests can't squeeze past a limit together. When the cap is hit, spending stops until the window resets, and the pattern shows up in your feed long before that.

### Your AI app account is compromised

Someone with access to your Claude or ChatGPT account gets exactly what the agent has: capped spending to allowlisted recipients until you revoke it. They do not get your Perflo login, your keys, or the ability to withdraw. Revoke the connection in Perflo settings and the access is gone immediately.

## The rules that make all of this true

Four guarantees apply to every agent connected to Perflo, with no exceptions:

* **Agents never hold your keys.** An agent gets a permission slip, never the account itself.
* **Hard caps are checked before money moves.** Every spend is tested against your limits first. A request over the cap is refused, not queued.
* **Agents can't raise their own limits.** Any request from an agent to change its permissions is refused automatically. Only you, in the app, can change limits.
* **The kill switch always works.** One tap in the app instantly cuts off every agent's access.

Every denied request is logged to your activity feed, and the agent receives a stable machine-readable code explaining exactly which limit stopped it. See [Errors and denials](/agents/errors-and-denials).

## Your side of the deal

Guardrails cap the damage. How much damage there is to cap comes down to your settings.

* **Keep the allowlist short.** Add recipients when a job needs them, not in advance.
* **Keep caps low until trust is earned.** A small daily cap for the first week costs you nothing but patience.
* **Prefer short expiries.** A session you have to renew is a session you review.
* **Watch the feed.** Real-time entries, spend-velocity alerts, and the morning brief exist so that nothing your agents do is a surprise.
* **Only connect apps you trust**, and grant the minimum the job needs.

## Related pages

* [Connect an agent](/agents/connect): setup for AI apps and coding agents
* [Agent spending and budgets](/agents/spending-and-budgets): budgets, auto top-up, statements
* [Guardrails](/concepts/guardrails): every limit, default, and platform maximum
* [Errors and denials](/agents/errors-and-denials): the codes agents receive when refused

<Note>
  Agent activity is subject to the same compliance screening and transaction monitoring as human activity. Guardrails limit what an agent can do with your account; they do not remove market risk from the actions you allow.
</Note>
