> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Guardrails

> Hard limits, allowlists, expiry, and a kill switch. How Perflo keeps automated money movement safe.

Guardrails are the safety layer that makes automation and AI agents safe to use with real money. Every automated actor on your account, whether a simple rule you wrote or a full AI agent, operates inside them.

## Two surfaces of your money

Your money on Perflo lives in one account, but an agent reaches it through two separate permission surfaces. The difference between them is the heart of how guardrails keep you safe.

* **Your wealth**: your cash, assets, savings, and open positions. An agent can *manage* this within the rules you set: buy, sell, move money into savings, adjust a position. It can never take money *out*. Withdrawing to a bank or an outside address, or sending a gift, is not part of what an agent is allowed to do. Those always come back to you to approve in your own browser. It is not that the agent is politely asked to leave them alone; the permission it holds simply does not include them.
* **An agent spending allowance**: a small, capped budget for the pay-per-use services an agent needs to do its work. This is a separate guardrail session with its own hard limits, and it is the only pool an agent can ever spend down on its own.

Keeping these apart means the worst an agent can do, even if it misbehaves or is misused, is spend its allowance on services you already approved. Your wealth stays exactly where it is.

## What the agent spending allowance limits

The allowance is a guardrail session: a set of rules Perflo checks before any payment is made. It covers every layer of a pay-per-use charge.

* **Per-call price cap.** Every service call carries a maximum price the agent commits to up front. If the service tries to charge more, the payment is refused before any money moves.
* **Confirm-first threshold.** Any charge above a limit you set has to come back to you first: the agent must show you the cost and get your explicit go-ahead before it can pay.
* **Cumulative caps.** A running total per hour, per day, and per month. When a window's cap is reached, spending in that window stops until it resets.
* **Recipient allowlist and marketplace gate.** Payments only go to verified marketplace services. On top of that, you can pin spending to a list of specific recipients (up to 64). A service that isn't on the marketplace is refused outright. An agent cannot pay an unknown destination.
* **One currency per allowance.** Each session spends a single digital dollar, USDC, settled on the Base network with Tempo as a second rail. Your agent handles the mechanics; you just see dollars.
* **Expiry.** Every allowance expires on its own (30 days by default, 90 days at most), and only you can renew it.

Perflo evaluates every single spend against these rules before any approval exists. If a request fails the check, it is denied and logged, and your agent receives a clear machine-readable error instead of your money. Every code is documented on [Errors and denials](/agents/errors-and-denials).

## How the two surfaces are enforced

The two surfaces are protected in two different ways, and both are stronger than a promise.

* **Your wealth runs on a permission installed on your account itself.** When you turn on automated actions (buying, selling, savings, trading), you install a permission that lists exactly which actions are allowed. That list lives with your account and is checked wherever the action settles, so even Perflo's own servers cannot step outside it. Withdrawing and gifting are simply not on the list, which is why they can never happen automatically. (This is what "on-chain" means here: the rules travel with your money, not with our servers.)
* **The agent spending allowance is checked by Perflo's guardrail engine before any payment is signed.** Every pay-per-use charge passes the full rule check first (price cap, cumulative caps, allowlist, currency, expiry), and only a charge that clears every rule is ever signed. Sensitive actions are never signable by an agent at all: a request to withdraw or send a gift doesn't get checked and declined, it bounces straight to your browser for you to approve yourself.

## Per-area limits

On top of session caps, every area of Perflo has its own rulebook that agents must operate inside. Two things are true of every rule:

* **They apply to agents, not to you.** Anything you do yourself in the app is never blocked by an agent limit.
* **Adjustable rules have a platform maximum.** You can raise a limit up to that ceiling, but no one can set it higher. Not you, and certainly not an agent.

The tables below show the highest each limit can be raised to. Where a row reads "No maximum", the platform sets no ceiling and the limit is simply whatever you choose. The values that apply to your account are always shown in the app.

### Trading (futures)

| Limit                              | Highest you can set           |
| ---------------------------------- | ----------------------------- |
| Maximum leverage                   | 25x                           |
| Largest single trade               | \$50,000                      |
| Total open across all positions    | No maximum                    |
| Amount opened per rolling 24 hours | No maximum                    |
| Allowed markets                    | Restrict to a list you choose |

### Predictions

| Limit                             | Highest you can set |
| --------------------------------- | ------------------- |
| Largest single bet                | \$5,000             |
| Bet spend per day / week / month  | No maximum          |
| Minimum market activity           | No maximum          |
| Minimum implied chance of winning | No maximum          |

The last two are quality filters: an agent is refused entry to thin, illiquid markets and refused long-shot bets priced below your chosen probability floor. The floor is measured against the live market price, not a stale quote.

### Earn

| Limit                           | Highest you can set |
| ------------------------------- | ------------------- |
| Minimum yield to accept         | No maximum          |
| Smallest single deposit         | No maximum          |
| Largest single deposit          | \$50,000            |
| Deposits per day / week / month | No maximum          |
| Total amount in Earn            | No maximum          |

### Borrow (Ethereum accounts)

These limits apply to [borrowing](/money/borrow), which is available on Ethereum accounts only.

| Limit                            | Highest you can set |
| -------------------------------- | ------------------- |
| Maximum borrowing rate to accept | No maximum          |
| Smallest single borrow           | No maximum          |
| Largest single borrow            | \$50,000            |
| Maximum loan-to-value            | No maximum          |
| Total outstanding debt           | No maximum          |

Loan-to-value is how much is borrowed against the value of the collateral backing it. Perflo checks the cap against the *projected* position (what your loan would look like after the borrow, in the worst case), so an agent cannot inch you toward liquidation risk.

### Buying and converting assets (Ethereum accounts)

These limits apply to [buying and converting assets](/money/assets), available on Ethereum accounts only.

| Limit                                  | Highest you can set |
| -------------------------------------- | ------------------- |
| Maximum price movement on a conversion | 5%                  |
| Largest single conversion              | \$25,000            |
| Conversions per rolling 24 hours       | No maximum          |

The price-movement limit works differently from the others: instead of denying the request, Perflo rewrites it. An agent that asks for a looser tolerance is simply held to yours, and Perflo applies the check again at the moment of execution.

## Only you can change the rules

Sessions and allowances are created and confirmed by you, in the app. Agents can read their limits, so they can plan within them, but there is no path (no command, no API call) by which an agent can create a session, raise a cap, or extend an expiry.

* Every rule change must be confirmed by you, from your own device. The confirmation is cryptographically tied to the exact change you approved, is valid for only a few minutes, and cannot be reused.
* A change above the platform maximum is rejected outright.
* Changes take effect immediately, including tightening a limit on an agent that is mid-task.

## How every request is checked

Every agent-initiated action is evaluated against your rules **before** it is executed: before any money moves and before any approval exists. The checks are built to fail closed:

* **If Perflo cannot determine the dollar value of a request, the request is denied.** Perflo does not guess, and it does not give an agent the benefit of the doubt.
* **Cumulative caps count money that is still in flight.** Two simultaneous requests cannot each squeeze under a cap that only has room for one; the amount is reserved when the check passes and only released if the action fails.
* **A denial is final for that request.** It cannot be swallowed by a retry path or rerouted through a fallback.
* **The checks themselves are mandatory.** Perflo's servers refuse to start at all if any area of the platform is missing its rule checker.

When a request is denied, it is logged to your activity feed and the agent receives a stable machine-readable code with the limit and the attempted amount, so a well-built agent can explain exactly why it stopped and adjust. The complete code reference is on [Errors and denials](/agents/errors-and-denials).

## Bank withdrawals go to one place

Withdrawals to a bank account can only be sent to the destination you verified. If that destination ever changes, all bank withdrawals pause until you approve the new one with a one-time confirmation in the Perflo app. An agent cannot add or switch the payout destination on its own. That approval always comes from you.

## Investing activates with funding

Investing features (trading, predictions, Earn deposits) stay locked until your account is funded past a minimum threshold, and Perflo's servers enforce this identically for every client: the app, an agent, and the developer API all pass through the same gate. Getting money **out** is never locked: selling, withdrawing, repaying, and closing positions always work.

## The kill switch

One tap, or one command ("stop agent spending"), revokes an agent's access instantly, across every connected app, even in the middle of a task. Nothing pending survives it.

Revocation is fail-closed: access is shut down first, before anything else happens. If any step of confirming that shutdown cannot be completed, access stays revoked and an alert fires. It never fails open. You can also revoke any individual permission from settings without touching the others.

## What guardrails cannot be used for

* They cannot approve withdrawals to new external addresses. That always requires you.
* They cannot raise their own limits. Limit changes require you, confirmed from your device and capped by platform maximums.
* They cannot outlive their expiry.

## Alerts and visibility

Every automated action appears in your activity feed in real time, labeled with which session performed it. You can set alerts on spend velocity, and Perflo warns you before a position approaches risk. A morning brief can summarize everything your automations did.

## Related pages

* [Agent security](/agents/security): the threat model these rules defend against
* [Errors and denials](/agents/errors-and-denials): every denial code and what fixes it
* [Agent spending and budgets](/agents/spending-and-budgets): budgets, hard caps, statements
* [Agent troubleshooting](/agents/troubleshooting): when an agent stops and you're not sure why

<Tip>
  Start small. Give a new agent a low daily cap and a short expiry, watch it work for a week, then raise limits if you are happy. Limits take effect immediately.
</Tip>

<Note>
  Guardrails limit what an agent can do with your account; they do not remove market risk. Trading, predictions, and yield can all lose money within your limits. Nothing in these docs is investment advice. Feature availability may vary by region.
</Note>
