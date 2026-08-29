> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Futures

> Trade crypto, US stocks, commodities, FX, and indices around the clock on a public derivatives order book.

**Goal:** open, protect, and manage a leveraged position. You need a verified, funded account. Trading unlocks once your balance passes the investing threshold, and availability depends on your country (see [Guardrails](/concepts/guardrails)).

Futures on Perflo are perpetual futures executed on Hyperliquid, a public derivatives exchange. Markets trade 24/7, including weekends, and cover:

* **Crypto:** BTC, ETH, and major assets
* **US stocks:** large-cap equities via Hyperliquid's HIP-3 markets
* **Commodities:** including gold and oil
* **FX and indices**

You are trading perpetual futures on these markets, not holding the underlying shares or barrels. Perflo never custodies spot securities.

## Placing a trade

<Steps>
  <Step title="Pick a market and direction">
    Long if you expect the price to rise, short if you expect it to fall.
  </Step>

  <Step title="Set size and leverage">
    Leverage multiplies both gains and losses. The app shows your liquidation price as you adjust.
  </Step>

  <Step title="Add protection">
    Attach a take-profit and stop-loss to the position in the same ticket. You can also place limit orders instead of market orders.
  </Step>

  <Step title="Confirm">
    You post margin in USDC. Funding from your cash balance is one tap; Perflo handles the conversion and routing behind the scenes.

    **You'll see:** the position under Open positions and in your activity feed, with live profit and loss.
  </Step>
</Steps>

## Managing and exiting positions

Positions, unrealized profit and loss, funding payments, and liquidation prices update live. You can close partially or fully, adjust take-profit and stop-loss levels, and withdraw free margin back to your balance at any time. Closing a position is never locked.

## Hedge protection

Hedge protection is an optional feature for [Ethereum accounts](/money/assets) holding spot assets. When enabled, Perflo maintains a short futures position sized against your holding, so that a price drop in the asset is offset by a gain on the hedge. The position adjusts automatically as your holding changes. It reduces downside, and it also caps upside while active. You can turn it off at any time.

## If something goes wrong

* **Trading is locked?** Your balance may be below the investing threshold, or leveraged trading may be restricted in your country. See [Getting started troubleshooting](/getting-started/troubleshooting).
* **An agent's trade was denied?** Leverage, per-trade, and total-exposure codes are explained in [Errors and denials](/agents/errors-and-denials); the limits themselves are in [Guardrails](/concepts/guardrails).

<Warning>
  Leveraged trading is high risk. You can lose your entire margin quickly, and funding rates cost money over time on leveraged positions. Perpetual futures on stocks and commodities are synthetic markets and can trade at prices that differ from official market hours prices. Never trade with money you cannot afford to lose.
</Warning>

<Note>
  Nothing in these docs is investment advice. Prices of assets, trading positions, and yields move both ways: you can lose money, including your entire position in leveraged products. Yield rates are variable and not guaranteed. Feature availability varies by region and verification level.
</Note>
