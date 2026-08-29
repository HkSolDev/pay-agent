> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Errors and denials

> Every machine-readable code an agent can receive when Perflo refuses a request, what each one means, and what fixes it.

When an agent's request fails a guardrail check, the action simply doesn't happen: nothing is signed, nothing moves, and the denial is final for that request. It can't be retried past the rule or rerouted around it. The denial is logged to your activity feed, and the agent receives a **stable machine-readable code** along with details of the limit involved and the amount attempted, so a well-built agent can explain exactly why it stopped and adjust.

A denial looks like this to the agent (the exact wrapper depends on how it's connected, but the code and details are always there):

```json theme={null}
{
  "success": false,
  "code": "GUARD_MAX_PER_TXN",
  "details": { "limit": 5000, "attempted": 7500 }
}
```

The codes below are the complete set. Amounts in `details` are in dollars unless the app shows otherwise.

## Spending and session limits

| Code                          | What it means                                                                                                     | What fixes it                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GUARD_MAX_PER_TXN`           | A single transaction was larger than your largest-single-transaction limit for that area.                         | Raise the limit in the app (up to the platform maximum), or let the agent split into smaller, slower steps within your caps. |
| `GUARD_MIN_PER_TXN`           | The amount was below the smallest allowed single transaction.                                                     | The agent should batch into a larger amount; you can lower the minimum in the app.                                           |
| `GUARD_WINDOW_EXCEEDED`       | The request would push spending past a cap for its rolling window (hour, day, week, or month).                    | Wait for the window to reset, or raise the cap yourself in the app.                                                          |
| `GUARD_MAX_TOTAL`             | The running total for that area (for example, total in Earn or total outstanding debt) would exceed your maximum. | Reduce the existing total (withdraw, repay) or raise the maximum in the app.                                                 |
| `GUARD_ASSET_NOT_WHITELISTED` | The asset or market isn't on the session's allowed list.                                                          | Add it to the allowlist in the app. Agents can never extend their own list.                                                  |
| `GUARD_CEILING_EXCEEDED`      | The request would exceed a platform-level ceiling that applies above your own settings.                           | Nothing raises this one. Ceilings are Perflo-wide maximums that neither you nor an agent can exceed.                         |

## Trading

| Code                       | What it means                                                   | What fixes it                                                                                 |
| -------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GUARD_MAX_LEVERAGE`       | The requested leverage is above your maximum.                   | Lower the leverage on the request, or raise your maximum in the app (up to the platform cap). |
| `GUARD_MAX_PER_TRADE`      | A single trade was larger than your largest-single-trade limit. | Smaller trade, or raise the limit in the app.                                                 |
| `GUARD_MAX_TOTAL_INVESTED` | Total value open across all positions would exceed your cap.    | Close or reduce positions, or raise the cap in the app.                                       |

## Predictions

| Code                        | What it means                                                                            | What fixes it                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GUARD_MAX_PER_BET`         | A single prediction position was larger than your per-position limit.                    | Smaller position, or raise the limit in the app.                                                                      |
| `GUARD_BET_WINDOW_EXCEEDED` | Prediction spending would exceed your daily, weekly, or monthly cap.                     | Wait for the window to reset, or raise the cap.                                                                       |
| `GUARD_MIN_MARKET_VOLUME`   | The market is thinner than your minimum-activity filter allows.                          | This is a quality filter working as intended. The agent should pick a more liquid market, or you can lower the floor. |
| `GUARD_MIN_WIN_PROBABILITY` | The position's implied chance of winning, at the live market price, is below your floor. | The agent should skip the long shot; you can lower the floor if you genuinely want it taken.                          |

## Earn and borrow

The borrow codes apply to [borrowing](/money/borrow), available on Ethereum accounts only. They are listed here because an agent can still receive them on those accounts.

| Code                    | What it means                                                                                      | What fixes it                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GUARD_MIN_APY`         | The yield on offer is below your minimum acceptable rate.                                          | The agent should find a better rate; you can lower your minimum in the app.                                                |
| `GUARD_MAX_BORROW_RATE` | The borrowing rate is above the maximum you'll accept.                                             | Wait for better rates or raise your maximum.                                                                               |
| `GUARD_MAX_LTV`         | The *projected* loan-to-value after this borrow, checked in the worst case, would exceed your cap. | Borrow less, add collateral first, or raise the cap. This check exists so an agent can't inch you toward liquidation risk. |

## Converting assets

These apply to [buying and converting assets](/money/assets), available on Ethereum accounts only.

| Code                 | What it means                                                                                               | What fixes it                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GUARD_MAX_SLIPPAGE` | The conversion couldn't be completed within your maximum price-movement setting at the moment of execution. | Retry when the market is calmer, or raise the tolerance (up to the platform maximum). Note that agents asking for a looser tolerance are automatically held to yours. |
| `GUARD_MAX_PER_SWAP` | A single conversion was larger than your per-conversion limit.                                              | Smaller conversion, or raise the limit in the app.                                                                                                                    |

## Safety and system

| Code                          | What it means                                                                                                                                             | What fixes it                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GUARD_UNPRICEABLE`           | Perflo could not determine the dollar value of the request, so it was denied. Checks fail closed rather than guessing or giving the benefit of the doubt. | The agent should restate the request in a priceable form; if it persists, the asset or service may not be supported. |
| `GUARD_RULES_WRITE_FORBIDDEN` | An agent tried to change limits or rules. This is always refused; only you, confirmed from your own device, can change rules.                             | Nothing an agent can do. If you want the change, make it yourself in the app.                                        |
| `GUARD_INVALID_RULE`          | A proposed rule change wasn't valid, for example because it was above the platform maximum or malformed.                                                  | Adjust the change to something within platform limits and confirm it yourself in the app.                            |

## The behavioral contract

These properties hold for every check, on every request, from every client:

* **Checks run before execution.** A request is evaluated against your rules before any money moves and before any approval exists.
* **Caps count in-flight money.** Two simultaneous requests can't each squeeze under a cap with room for only one; the amount is reserved when a check passes and released only if the action fails.
* **Denials are final** for that request and always logged to your feed.
* **The checks are mandatory.** Perflo's servers refuse to start if any area of the platform is missing its rule checker.

For the limits themselves (every default and platform maximum), see [Guardrails](/concepts/guardrails). For what to do when an agent reports a denial you didn't expect, see [Agent troubleshooting](/agents/troubleshooting).
