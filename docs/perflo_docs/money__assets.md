> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Assets (Ethereum accounts)

> Buying, holding, automating, and gifting assets on Ethereum accounts. Not available on new accounts.

<Warning>
  This page applies only to accounts opened before Perflo moved to Base. Assets are not available on new accounts. If you are not sure which you have, your account settings show your address and network, or you can check with [support@perflo.ai](mailto:support@perflo.ai).
</Warning>

**Goal:** own assets directly from your cash balance, from small amounts. You need a verified, funded Ethereum account, and investing features unlock once your balance passes a minimum threshold (see [Guardrails](/concepts/guardrails)).

Ethereum accounts can buy and hold assets directly from the cash balance:

* **BTC and ETH:** held as standard wrapped representations (WBTC, WETH).
* **Gold:** held as XAUT (Tether Gold), where one token represents one troy fine ounce of allocated physical gold held by the issuer.

You can hold fractions of any asset, so you can start small. Every token contract is documented on [Networks and contracts](/reference/networks-and-contracts).

## Buying and selling

<Steps>
  <Step title="Pick an asset and an amount">
    Choose any supported asset and how much of your cash balance to convert. Historical stats are shown for each asset, and gold can be displayed in grams or ounces.
  </Step>

  <Step title="Review the live quote">
    The quote you approve is the price you get. Perflo routes the conversion through aggregated public markets to get the best available price.
  </Step>

  <Step title="Confirm">
    **You'll see:** the asset in your portfolio immediately, and the conversion in your activity feed.
  </Step>
</Steps>

Selling works the same way in reverse: any asset converts back to your cash balance at a live quote, anytime. Getting money out is never locked.

## Automatic buying

Set a standing instruction and Perflo buys for you automatically:

* **On deposit:** convert a percentage of every incoming deposit (for example, 20% of your salary) into the assets you choose the moment it arrives.
* **On schedule:** buy a fixed amount daily, weekly, or monthly.
* **On rules:** with AI automations, buy on conditions you describe in plain language, such as a price dip. See [AI agents](/agents/overview).

Pause or edit standing instructions at any time.

## Gifting

Send an asset to anyone with an email address or phone number. The recipient gets a claim link; when they sign up and verify, the asset is theirs. Unclaimed gifts return to you after the claim window shown at send time.

## Borrowing against your assets

You do not need to sell an asset to unlock cash. You can borrow dollars against it. See [Borrow](/money/borrow).

## If something goes wrong

* **The buy button is locked?** Your balance may be below the investing activation threshold. See [Getting started troubleshooting](/getting-started/troubleshooting).
* **A conversion was refused for an agent?** Check the code against [Errors and denials](/agents/errors-and-denials).

<Warning>
  Asset prices move. BTC, ETH, and gold can all lose value in dollar terms, and holdings are not deposit-insured. Verify token contracts on [Networks and contracts](/reference/networks-and-contracts).
</Warning>

<Note>
  Nothing in these docs is investment advice. Prices of assets, trading positions, and yields move both ways: you can lose money, including your entire position in leveraged products. Yield rates are variable and not guaranteed. Feature availability varies by region and verification level.
</Note>
