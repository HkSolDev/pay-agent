> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Borrow (Ethereum accounts)

> Borrowing dollars against assets on Ethereum accounts. Not available on new accounts.

<Warning>
  This page applies only to accounts opened before Perflo moved to Base. Borrowing is not available on new accounts. If you are not sure which you have, your account settings show your address and network, or you can check with [support@perflo.ai](mailto:support@perflo.ai).
</Warning>

**Goal:** cash in your balance without selling your holdings. You need a verified, funded Ethereum account with assets to pledge. Borrowing unlocks once your balance passes the investing threshold (see [Guardrails](/concepts/guardrails)).

Borrowing lets you unlock cash from your holdings while keeping your position. Loans are over-collateralized lending positions on Morpho, a public, audited lending protocol: you pledge a supported asset as collateral and borrow USDT against it. The app shows which collateral markets are available to you.

## Opening a loan

<Steps>
  <Step title="Choose collateral">
    Select which asset and how much of it to pledge.
  </Step>

  <Step title="Choose how much to borrow">
    The app shows the maximum you can borrow and, more importantly, a safe recommended amount below it.
  </Step>

  <Step title="Confirm">
    **You'll see:** borrowed dollars in your cash balance immediately, and the new loan with its health factor on your loans screen. Interest accrues at the variable market rate shown before you confirm.
  </Step>
</Steps>

## Health factor, in plain terms

Every loan has a health factor: the cushion between your collateral value and your debt. If your collateral falls in price, your health factor drops. If it drops far enough, the lending protocol liquidates part of your collateral to repay the debt, and liquidation carries a penalty. This is a property of public lending markets, not a Perflo decision, and it is the main risk of borrowing.

Perflo watches your loan health around the clock, and:

* warns you well before you approach risk,
* shows you safe maximum amounts for borrowing more or withdrawing collateral, so you cannot stumble into danger through the app,
* lets you fix a position in one tap by adding collateral or repaying.

You can also set an automation to protect a loan automatically, for example: if health drops below a threshold, add collateral from my balance. See [AI agents](/agents/overview).

## Managing and closing a loan

At any time you can add collateral, withdraw collateral (within safe bounds), borrow more, repay partially, or close the position entirely. Repayment comes from your cash balance; closing returns your collateral in full. Exiting is never locked.

## If something goes wrong

* **A health warning arrived?** Open the loan and use the one-tap fix: add collateral or repay. Acting early is cheap; liquidation is not.
* **An agent's borrow was denied?** `GUARD_MAX_LTV` and the other borrow codes are explained in [Errors and denials](/agents/errors-and-denials). The LTV check is deliberately conservative and projected against the worst case.

<Warning>
  Borrowing against a volatile asset can lead to liquidation and loss of collateral. Borrow conservatively and keep alerts on.
</Warning>

<Note>
  Nothing in these docs is investment advice. Prices of assets, trading positions, and yields move both ways: you can lose money, including your entire position in leveraged products. Yield rates are variable and not guaranteed. Feature availability varies by region and verification level.
</Note>
