> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Welcome to Perflo

> One account for money, assets, trading, cards, and payments. Built for people, businesses, and the AI agents that work for them.

export const marketplaceSize = "hundreds of verified pay-per-call services, with new ones added weekly";

Perflo is a compliant money platform for humans and their AI agents. It holds a Money Services Business (MSB) registration and gives individuals, businesses, and the agents that work for them regulated access to accounts, cards, trading, and global payments, all from one balance.

It's also non-custodial: your money sits in an account that only you control, on public infrastructure you can verify yourself. Trading routes to established public venues. Perflo runs no exchange and never takes the other side of your trade.

## What you can do

Everything below works two ways. Do it yourself in the app, or let a connected agent do it for you inside hard limits you set. Either way, every action lands in your activity feed in real time.

<CardGroup cols={2}>
  <Card title="Hold and move money" icon="wallet" href="/money/cash">
    Keep a digital dollar balance, receive bank transfers, and pay out to more than 45 currencies, mostly on instant local rails.
  </Card>

  <Card title="Trade futures" icon="chart-line" href="/trading/futures">
    Go long or short on crypto, US stocks, commodities, FX, and indices, around the clock, every day.
  </Card>

  <Card title="Predict real-world events" icon="square-poll-vertical" href="/trading/predictions">
    Take positions on elections, sports, economics, and culture on Polymarket, the largest prediction market.
  </Card>

  <Card title="Earn on idle cash" icon="percent" href="/money/earn">
    Put cash you're not using into audited public yield vaults, and withdraw whenever you want it back.
  </Card>

  <Card title="Spend with cards" icon="credit-card" href="/cards-banking/virtual-cards">
    Create virtual Mastercards funded from your balance and accepted worldwide, one per subscription if you like.
  </Card>

  <Card title="Let your agent buy its tools" icon="database" href="/agents/services">
    Your agent pays per request for the data, search, and media tools a job needs, usually cents, from a budget you set.
  </Card>

  <Card title="Automate your money" icon="arrows-spin" href="/agents/overview">
    Describe rules in plain language, like "sweep anything over \$500 into Earn" or "pay my researcher every Friday," and your agent runs them.
  </Card>
</CardGroup>

The agent side comes with hard guarantees. An agent never gets your keys, can only pay recipients you saved, can't raise its own limits, and stops instantly on the kill switch. The tool marketplace holds {marketplaceSize}. See [Agent spending and budgets](/agents/spending-and-budgets) for how the limits work.

## Who Perflo is for

**Individuals** open an account with an email address, verify their identity once, and get the full product: cash, earn, trading, cards, and payments.

**Businesses** complete business verification (KYB) and get the same tools plus business bank accounts, third-party pay-ins and payouts, and team-friendly controls.

**AI agents** act on behalf of a verified person or business. An agent never gets your keys. It gets a bounded permission you can revoke at any time, with hard spending caps checked before any money moves.

## Where to start

Ready to dive in? [Open the app](https://app.perflo.ai) and sign up, then follow the [Quickstart](/quickstart) from sign-up to money in your account in about ten minutes. If you'd rather go step by step:

<Steps>
  <Step title="Create your account">
    [Open the app](https://app.perflo.ai) and sign up with your email. Your account is ready in about a minute. See [Create your account](/getting-started/create-account).
  </Step>

  <Step title="Verify your identity">
    Complete KYC (or KYB for a business) to unlock money features. See [Verify your identity](/getting-started/verify-identity).
  </Step>

  <Step title="Add funds">
    Fund by bank transfer, card, or crypto deposit. See [Fund your account](/getting-started/fund-your-account).
  </Step>
</Steps>

Building Perflo into your own product instead? The **Developer platform** tab covers the server API for accounts, transfers, cards, mandates, and service purchases. Start at [Perflo Finance API](/developers/overview).

<Note>
  Nothing in these docs is investment advice. Prices of assets, trading positions, and yields move both ways: you can lose money, including your entire position in leveraged products. Yield rates are variable and not guaranteed. Feature availability varies by region and verification level.
</Note>
