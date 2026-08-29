> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Earn

> Earn interest on cash you're not using through audited public lending vaults. Rates vary, and you can withdraw anytime.

**Goal:** interest accruing on cash you're not using, withdrawable whenever you want it back. You need a verified, funded account. Earn unlocks once your balance passes the investing threshold (see [Guardrails](/concepts/guardrails)).

Earn moves idle balance into audited public lending vaults (Morpho vaults) where it is lent out to over-collateralized borrowers. Interest accrues to you continuously.

## How it works

<Steps>
  <Step title="Choose a vault">
    Earn uses a curated shortlist of USDC vaults. Each one is named in the app with its current rate, and every address is listed on [Networks and contracts](/reference/networks-and-contracts).
  </Step>

  <Step title="Deposit">
    Move any amount from your balance into the vault. The current variable APY is shown before you confirm.
  </Step>

  <Step title="Watch it accrue">
    **You'll see:** your position and earned interest updating in the app. Rates float with market supply and demand.
  </Step>

  <Step title="Withdraw anytime">
    Withdraw back to your balance whenever you like, subject to vault liquidity at that moment.
  </Step>
</Steps>

## Automations that pair well with Earn

* **Idle cash sweep:** automatically move balance above a buffer you set into Earn, and pull it back when you need it.
* **Round-ups:** sweep card round-ups into Earn.

See [AI agents](/agents/overview) for how to set these up in plain language.

## Where the yield comes from

Yield comes from borrowers paying interest on over-collateralized loans in the vault's markets. The rate is variable. This is not a bank deposit, and it is not insured. Vault contracts are public and audited, and you can independently verify the exact vault your money sits in. The APY you see is the current rate, not a promise of future rates.

## If something goes wrong

* **Deposit refused?** Check your balance is above the investing threshold, and that the deposit is within your Earn limits in [Guardrails](/concepts/guardrails).
* **An agent's deposit was denied?** `GUARD_MIN_APY` and the other Earn codes are explained in [Errors and denials](/agents/errors-and-denials).
* **Withdrawal slow?** Withdrawals depend on vault liquidity at that moment; the app shows what's available now.

## Next steps

* [Cash](/money/cash): what your balance is and everything else it can do.
* [Agent spending and budgets](/agents/spending-and-budgets): let an agent manage the sweep for you, within caps.

<Note>
  Nothing in these docs is investment advice. Prices of assets, trading positions, and yields move both ways: you can lose money, including your entire position in leveraged products. Yield rates are variable and not guaranteed. Feature availability varies by region and verification level.
</Note>
