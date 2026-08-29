> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Networks and contracts

> The chains, tokens, and contract addresses behind your Perflo balance. Verify everything yourself.

Perflo is built on public blockchains, which means you can independently verify every asset you hold and every venue your money touches. This page is the canonical list. If an address you see anywhere else does not match this page, do not trust it.

<Warning>
  Perflo will never send you a contract or deposit address by email, DM, or chat. Deposit addresses live inside the app; token contracts live on this page. Anything else is a scam.
</Warning>

## Networks

| Network     | Chain ID       | Used for                                                           | Explorer                                           |
| ----------- | -------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| Base        | 8453           | Cash, deposits, Earn, agent pay-per-call payments (x402)           | [basescan.org](https://basescan.org)               |
| Polygon     | 137            | Prediction markets (Polymarket, USDC settlement)                   | [polygonscan.com](https://polygonscan.com)         |
| Hyperliquid | L1 (own chain) | Futures trading and margin                                         | [app.hyperliquid.xyz](https://app.hyperliquid.xyz) |
| Ethereum    | 1              | Legacy accounts only (see [Ethereum accounts](#ethereum-accounts)) | [etherscan.io](https://etherscan.io)               |

Accounts run on Base. The app always shows which network is valid for a given deposit.

## Token contracts

| Token            | Network | Contract address                             | Decimals |
| ---------------- | ------- | -------------------------------------------- | -------- |
| USDC (Circle)    | Base    | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 6        |
| USDC.e (bridged) | Polygon | `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174` | 6        |

Notes:

* Your cash balance is USDC on Base. It is the only token your account holds.
* Prediction markets settle in the Polygon USDC used by Polymarket.

## Protocol contracts

| Protocol                               | Network | Contract address                             |
| -------------------------------------- | ------- | -------------------------------------------- |
| Morpho vault: Steakhouse Prime USDC    | Base    | `0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9` |
| Morpho vault: Gauntlet USDC Prime      | Base    | `0x050cE30b927Da55177A4914EC73480238BAD56f0` |
| Morpho vault: Ethena x Steakhouse USDC | Base    | `0xBeEfF0be997Cca5B1c13A7433c2004637975739e` |

Those three vaults are the venues [Earn](/money/earn) can deposit into. Each one is a public Morpho vault you can look up on BaseScan and verify holds USDC.

Venue-specific contracts (Polymarket's exchange contracts, Hyperliquid's bridge) are published in those venues' own documentation, which is the authoritative source for them.

## Ethereum accounts

Accounts opened before the move to Base run on Ethereum instead. Nothing about those positions changed, and the contracts backing them are unchanged:

| Token                       | Contract address                             | Decimals    |
| --------------------------- | -------------------------------------------- | ----------- |
| USDT (Tether USD)           | `0xdAC17F958D2ee523a2206206994597C13D831ec7` | 6           |
| USDC (Circle)               | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6           |
| XAUT (Tether Gold)          | `0x68749665FF8D2d112Fa859AA293F07A622782F38` | 6           |
| WETH (Wrapped Ether)        | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | 18          |
| WBTC (Wrapped BTC)          | `0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599` | 8           |
| Morpho (lending and vaults) | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | Not a token |

If your account is on Ethereum, [Assets](/money/assets) and [Borrow](/money/borrow) describe what you can do with it.

## Your own address

Your Perflo account is a smart account you control. Find your address in the app under settings, and look it up on any explorer above to independently verify your balances and history.

<Note>
  Contract addresses on this page were verified against the issuers' official documentation and block explorers. If a token migrates or a new network is added, this page is updated first and the change is announced in the [changelog](/changelog).
</Note>
