> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# FAQ

> Straight answers to the most common questions about custody, safety, agents, fees, and availability.

## About Perflo

<AccordionGroup>
  <Accordion title="Is Perflo a bank?">
    No. Perflo is a compliant money platform holding a Money Services Business (MSB) registration. Bank accounts and cards are delivered on regulated rails, and your assets are held in your own self-custodial account rather than on a bank's balance sheet. Balances are not covered by deposit insurance. [How Perflo works](/concepts/how-perflo-works) explains what protects them instead.
  </Accordion>

  <Accordion title="Who actually holds my money?">
    You do. Your cash and assets sit in an account you control on public infrastructure, and you can verify your holdings independently. Perflo operates services around your account under permissions you grant and can revoke. See [Cash](/money/cash).
  </Accordion>

  <Accordion title="What happens to my money if Perflo goes offline?">
    Your assets remain in your own account on public networks, and the venues Perflo routes to (Hyperliquid, Polymarket, Morpho) are public protocols that exist independently of Perflo. If Perflo went offline, you would lose the app experience, not your ownership. More detail in [How Perflo works](/concepts/how-perflo-works).
  </Accordion>

  <Accordion title="Which countries are supported?">
    Availability depends on your country of residence and applicable regulation, and some features (for example prediction markets or leveraged trading) are restricted in certain places. The app tells you during onboarding and before you open any restricted feature. See [Verify your identity](/getting-started/verify-identity).
  </Accordion>
</AccordionGroup>

## Money and investing

<AccordionGroup>
  <Accordion title="What actually backs my balance?">
    Your cash balance is held as USDC, the dollar stablecoin issued by Circle, which holds reserves against it. Money you move into [Earn](/money/earn) sits in a named public Morpho vault. Every token and vault contract is public and listed on [Networks and contracts](/reference/networks-and-contracts), so you can verify what you hold without taking our word for it.
  </Accordion>

  <Accordion title="Can I lose money?">
    Yes. Trading with leverage can lose your entire margin. Prediction positions can expire worthless. Yield rates are variable and not guaranteed, and your balance carries the issuer risk described in [Cash](/money/cash). Use the risk controls, and never commit money you cannot afford to lose. [Guardrails](/concepts/guardrails) covers the controls.
  </Accordion>

  <Accordion title="Why do I never pay gas fees?">
    Perflo sponsors all network fees, so the price you see on a confirmation screen is the full cost. See [Fees and limits](/concepts/fees-and-limits).
  </Accordion>

  <Accordion title="What are the fees?">
    Every action shows its full cost before you confirm. Venue-set costs (trading fees, funding rates, spreads, variable lending rates) are passed through and displayed. See [Fees and limits](/concepts/fees-and-limits).
  </Accordion>

  <Accordion title="How do taxes work?">
    Perflo gives you statements and a full activity history, including itemized agent spending, so you or your accountant have the records you need. Tax treatment depends on your jurisdiction and is your responsibility.
  </Accordion>
</AccordionGroup>

## AI agents

<AccordionGroup>
  <Accordion title="Can an AI agent steal my money?">
    An agent can only act inside the guardrails you set: hard caps, an allowlist of recipients, asset restrictions, and an expiry. It cannot withdraw to external addresses (that always requires you), cannot raise its own limits, and dies instantly on the kill switch. The full threat model is on [Agent security](/agents/security).
  </Accordion>

  <Accordion title="What does an agent see when it's refused?">
    A stable machine-readable code naming the exact limit that stopped it, plus the amounts involved. Every code is documented on [Errors and denials](/agents/errors-and-denials).
  </Accordion>

  <Accordion title="What can my agent actually buy?">
    Verified pay-per-call services: search, data, media generation, email, and more. Each is priced per request and paid from the budget you set. Browse the categories on [The service marketplace](/agents/services).
  </Accordion>
</AccordionGroup>

## Account

<AccordionGroup>
  <Accordion title="How do I close my account?">
    Withdraw or pay out your balances, revoke agent sessions, then request closure in settings. Compliance records are retained as required by law.
  </Accordion>

  <Accordion title="How do I get help?">
    In-app support is the fastest route; you can also email [support@perflo.ai](mailto:support@perflo.ai). For step-by-step fixes, start with the troubleshooting pages for [getting started](/getting-started/troubleshooting), [cards and payouts](/cards-banking/troubleshooting), or [agents](/agents/troubleshooting). Remember: support never asks for your one-time code.
  </Accordion>
</AccordionGroup>

## Still stuck?

1. Check your **activity feed** in the app. Every action, denial, and pending item appears there with a timestamp.
2. Find the entry matching your symptom on the troubleshooting pages for [getting started](/getting-started/troubleshooting), [cards and payouts](/cards-banking/troubleshooting), or [agents](/agents/troubleshooting).
3. Email [support@perflo.ai](mailto:support@perflo.ai) from the email address on your account. Include what you were trying to do, the approximate time it happened, and what the activity feed shows.

<Warning>
  Perflo support will never ask for your password, sign-in codes, or ask you to move money "for verification". Anyone who does is not Perflo.
</Warning>
