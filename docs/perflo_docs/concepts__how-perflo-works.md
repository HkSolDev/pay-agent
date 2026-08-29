> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# How Perflo works

> Self-custody, session permissions, and public venues. What Perflo can and cannot do with your money, and where the trade-offs are.

Perflo looks like a banking app, but it is built differently underneath. Understanding three ideas explains almost everything about how the product behaves.

## 1. Your account is self-custodial

When you sign up, Perflo provisions a smart account on public blockchains. You control it. Perflo does not hold your assets in an omnibus company wallet, and it cannot move your money by itself. If you ever want to verify a balance or a transaction, you can look up your own address on a public block explorer.

**Related:** [Create your account](/getting-started/create-account) · [Security](/reference/security)

## 2. Actions run under permissions you grant

Anything Perflo does for you requires permission first, whether that's executing a trade you tapped, running an automation you set, or letting your AI agent spend within a budget. You grant these as sessions: narrow, expiring permissions with hard limits attached. A session for agent spending, for example, carries caps per hour, day, and month, a list of allowed recipients, and an expiry date. Perflo checks the limits before anything is approved. For actions on your own wealth, the limits are enforced by the account itself; for an agent's pay-per-use spending, every payment is checked against your rules before it is signed. Either way, money can never leave your account without you.

Two things never happen under a session:

* Withdrawals to external addresses always require a fresh confirmation from you.
* No session can raise its own limits. Only you can.

You can view and revoke every active permission in settings at any time.

**Related:** [Guardrails](/concepts/guardrails) · [Connect an agent](/agents/connect)

## 3. Everything routes to public venues

Perflo runs no exchange, holds no order book, and never takes the other side of your trade. Each feature maps to an established public venue:

| Feature                     | Venue               |
| --------------------------- | ------------------- |
| Futures trading             | Hyperliquid         |
| Prediction markets          | Polymarket          |
| Yield                       | Morpho vaults       |
| Agent pay-per-call payments | x402 protocol       |
| Card spending               | Mastercard network  |
| Bank transfers and payouts  | Local banking rails |

Prices, rates, and liquidity come from those venues. Perflo handles the execution and the safety checks, and shows you one clean balance across all of it.

## What this design costs you

Self-custody and public venues are a trade, and it helps to see both sides of it:

* **No deposit insurance.** Your balance is not a bank deposit. [Cash](/money/cash) explains what protects it instead: your own account, verifiable holdings, and issuer reserves.
* **Market conditions are real.** Rates, spreads, and liquidity come from public venues; Perflo passes them through rather than smoothing them over. See [Fees and limits](/concepts/fees-and-limits).
* **What you get back:** Perflo can never lend out your balance, freeze it for its own reasons, or fail with your money on its books. And everything is checkable, so you never have to take our word for anything.

## What Perflo is not

* **Not an exchange.** No order book, never your counterparty.
* **Not a bank.** A compliant money platform with an MSB registration; banking services run on regulated partner rails.
* **Not a custodian.** Your account is yours; Perflo operates services around it under permissions you can revoke.

## No gas, ever

All network fees are sponsored. You never hold ETH or any other gas token, and you never see a gas prompt. What you see before confirming is the full cost of the action.

<Note>
  Want the exact chains and token contracts behind your balance? See [Networks and contracts](/reference/networks-and-contracts).
</Note>
