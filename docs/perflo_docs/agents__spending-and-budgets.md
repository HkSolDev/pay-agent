> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent spending and budgets

> How agents pay per call, how budgets with hard caps work, statements, and the kill switch.

export const marketplaceSize = "hundreds of verified pay-per-call services, with new ones added weekly";

**Goal:** an agent that can spend, inside a budget it cannot exceed and that you can revoke at any time. You need a [connected agent](/agents/connect) first.

## How agents pay for things

Agents on Perflo pay for third-party services per call using an open standard called x402. A service quotes a price per request, and the agent pays exactly that, instantly, from your balance. (Settlement happens in digital dollars, USDC, on the Base network, with Tempo as a second rail; your agent handles all of it.) There are no subscriptions and no API keys, and you never leave a card on file with dozens of vendors. Your agent pays cents for exactly what it uses.

## The service marketplace

Perflo curates a marketplace of {marketplaceSize} that an agent can use out of the box: web search, deep research, email sending, image and video generation, phone calls, and a large catalog of data and automation services. Services are probe-verified before listing, and your agent can also describe a task in plain language and let Perflo pick the best vendor, with automatic failover if one fails. Browse the categories on [The service marketplace](/agents/services).

## Budgets

A budget is a guardrail session: an agent spending allowance, kept separate from your wealth (your cash, assets, savings, and positions), which an agent can never withdraw or send out. Every allowance you grant carries:

* a **per-call price cap**: the most a single service call is allowed to charge,
* a **confirm-first threshold**: charges above a limit you set come back to you for explicit approval before the agent can pay,
* **cumulative caps** per hour, per day, and per month,
* a **recipient allowlist and marketplace gate**: payments go only to verified marketplace services, optionally narrowed to a list of specific recipients (up to 64); an unknown destination is refused outright,
* **one currency** for the session, and
* an **expiry date** (30 days default, 90 maximum).

Every payment is checked against the budget before it is approved. Cumulative caps also count money still in flight, so concurrent requests cannot race past a cap together, and a denied payment is final, with no retries and no rerouting. When a payment is denied, the agent gets a stable machine-readable code and the denial shows up in your activity feed; every code is documented on [Errors and denials](/agents/errors-and-denials). For how these rules are enforced and where your wealth's limits live, see [Guardrails](/concepts/guardrails).

## Budgets never refill themselves

A budget is a hard ceiling, not a target that keeps topping itself up. When a cap is reached, spending stops. It never quietly pulls more from your balance to keep going. Raising a budget is always a deliberate change you make yourself; nothing an agent does can refill or extend it.

## The kill switch

Say "stop agent spending" to your assistant, tap the switch in the app, or revoke the session in settings. All agent spending stops immediately and everywhere, even in the middle of a task, and stays stopped until you re-enable it. Nothing pending survives it. Re-enabling is covered in [Agent troubleshooting](/agents/troubleshooting).

## Statements

Agent spending is itemized like a card statement: which service, which agent session, what price, when. Monthly statements make reconciliation straightforward for businesses.

## If something goes wrong

* **The agent reports a denial:** match the code on [Errors and denials](/agents/errors-and-denials). Most fixes are one setting in the app.
* **The agent stopped mid-task:** it usually hit an expiry, a cap, or the kill switch. See [Agent troubleshooting](/agents/troubleshooting).

<Tip>
  A good starter budget: a small daily cap, five allowlisted services, 30-day expiry. Expand once you have watched a week of activity.
</Tip>

<Note>
  Marketplace services are operated by third parties, and agent spending is real spending. Budgets cap how much can go out, not whether a paid result is useful. Agent activity is screened and monitored exactly like human activity.
</Note>
