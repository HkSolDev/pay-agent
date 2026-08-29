> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Bank accounts

> Virtual bank accounts with local details in ten currencies. First-party and third-party pay-ins.

**Goal:** a bank account with real local details, in your name, that settles into your Perflo balance. Individuals need KYC and businesses need KYB before accounts are issued.

Verified individuals and businesses can open virtual bank accounts with real local account details: an account number and routing details in the local format, in your name. Money sent to these accounts lands in your Perflo balance.

## Live currencies and rails

| Currency | Country / region     | Local rails                               |
| :------- | :------------------- | :---------------------------------------- |
| AED      | United Arab Emirates | IPP (instant), FTS                        |
| USD      | United States        | ACH, Wire, RTP (US local), SWIFT (global) |
| EUR      | Eurozone             | SEPA, SEPA Instant                        |
| GBP      | United Kingdom       | Faster Payments, BACS, CHAPS              |
| BRL      | Brazil               | PIX, TED                                  |
| MXN      | Mexico               | SPEI                                      |
| COP      | Colombia             | BRE-B                                     |
| NGN      | Nigeria              | NIP                                       |
| PHP      | Philippines          | InstaPay, PESONet                         |

Perflo adds currencies over time. The app shows which ones are available to you, and each addition is noted in the [changelog](/changelog).

## First-party and third-party pay-ins

* **First-party:** move money from your own bank account into Perflo.
* **Third-party:** receive money from other people and companies. Invoice a client in their currency, get paid into your local-details account, and the money shows up in your balance. Businesses use this for customer collections.

## What happens when money arrives

Incoming money settles into your cash balance automatically. If you have standing instructions (for example, invest 20% of every deposit into assets you choose), they run on arrival.

**You'll see:** a notification and an activity-feed entry either way.

## Recurring funding from your bank

You can link a bank account once and approve a pull mandate with a cap you set. Perflo can then pull top-ups on a schedule or when your balance runs low, always within your cap. You can cancel the mandate anytime.

## If something goes wrong

A transfer that hasn't arrived is covered in [Getting started troubleshooting](/getting-started/troubleshooting); problems sending money out are in [Cards and payouts troubleshooting](/cards-banking/troubleshooting).

<Note>
  Virtual accounts are provided on regulated rails under Perflo's MSB registration and compliance program. Individuals require KYC and businesses require KYB before accounts are issued.
</Note>
