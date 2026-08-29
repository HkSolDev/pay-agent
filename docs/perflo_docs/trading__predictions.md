> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Predictions

> Take positions on real-world events on Polymarket. Buy YES or NO, exit early, redeem winners.

**Goal:** a position on a real-world outcome, exited or redeemed on your terms. You need a verified, funded account. Predictions unlock past the investing threshold and are not available in every country (see [Guardrails](/concepts/guardrails)).

Predictions let you back your view on real-world outcomes: elections, sports, economics, culture. Positions execute on Polymarket, the largest prediction market.

## How prediction markets work

Every market is a question with a defined resolution, for example: will X win the election? You buy YES or NO shares priced between $0.00 and $1.00. The price reflects the market's current probability. When the event resolves, correct shares pay out $1.00 each and incorrect shares pay $0.00.

Example: you buy 100 YES shares at $0.30 (cost $30). If the event happens, you redeem \$100. If it does not, the position expires worthless.

## Using predictions on Perflo

<Steps>
  <Step title="Browse or search markets">
    Explore live markets by category or search for a specific event. Read the market's resolution criteria before trading.
  </Step>

  <Step title="Fund and place a position">
    Choose YES or NO and an amount. Perflo sets everything up and routes funds automatically on your first trade.

    **You'll see:** the position in your predictions list and your activity feed.
  </Step>

  <Step title="Exit early if you want">
    You do not have to wait for resolution. Sell your shares back to the market at the current price at any time.
  </Step>

  <Step title="Redeem winnings">
    After a market resolves, redeem your winning shares to your balance in one tap.
  </Step>
</Steps>

## Things to understand before trading

* **Resolution risk:** markets resolve according to the venue's published rules and resolution sources. Edge cases resolve by those rules, not by headlines.
* **Liquidity:** thin markets can have wide spreads, and large orders can move the price.
* **Availability:** prediction markets are not available in every country. The app tells you if this applies to you.

## If something goes wrong

* **Predictions are locked?** Check the investing threshold and your country's availability. See [Getting started troubleshooting](/getting-started/troubleshooting).
* **An agent's position was denied?** The thin-market and probability-floor filters (`GUARD_MIN_MARKET_VOLUME`, `GUARD_MIN_WIN_PROBABILITY`) are quality controls working as intended; see [Errors and denials](/agents/errors-and-denials).

<Note>
  Prediction positions are speculative. Prices are probabilities, not guarantees.
</Note>

<Note>
  Nothing in these docs is investment advice. Prices of assets, trading positions, and yields move both ways: you can lose money, including your entire position in leveraged products. Yield rates are variable and not guaranteed. Feature availability varies by region and verification level.
</Note>
