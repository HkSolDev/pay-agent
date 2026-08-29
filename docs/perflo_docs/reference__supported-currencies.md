> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Supported currencies and assets

> Where you can hold local bank accounts, where you can collect and pay out, and the stablecoins and crypto assets you can hold.

## Local virtual accounts (live today)

Named virtual accounts with local account details, for receiving first-party and third-party payments:

| Currency | Country / region     | Local rails                               |
| :------- | :------------------- | :---------------------------------------- |
| 🇦🇪 AED | United Arab Emirates | IPP (instant), FTS                        |
| 🇺🇸 USD | United States        | ACH, Wire, RTP (US local), SWIFT (global) |
| 🇪🇺 EUR | Eurozone             | SEPA, SEPA Instant                        |
| 🇬🇧 GBP | United Kingdom       | Faster Payments, BACS, CHAPS              |
| 🇧🇷 BRL | Brazil               | PIX, TED                                  |
| 🇲🇽 MXN | Mexico               | SPEI                                      |
| 🇨🇴 COP | Colombia             | BRE-B                                     |
| 🇳🇬 NGN | Nigeria              | NIP                                       |
| 🇵🇭 PHP | Philippines          | InstaPay, PESONet                         |

Standing stablecoin deposit addresses are also available; see [Stablecoins](#stablecoins) below.

## Payout corridors

| Region                  | Payout currencies                                                                                                                                                                                              | Notable rails                                                                      |
| :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| 🌍 Global               | 🇺🇸 USD · 🇪🇺 EUR · 🇬🇧 GBP · plus stablecoins (USDC, EURC)                                                                                                                                                 | SWIFT (T+1 to T+3); stablecoins instant                                            |
| 🇪🇺 Europe             | 🇪🇺 EUR · 🇬🇧 GBP · 🇩🇰 DKK · 🇳🇴 NOK · 🇵🇱 PLN                                                                                                                                                           | SEPA Instant, Faster Payments, local wires                                         |
| 🌎 Americas             | 🇺🇸 USD · 🇧🇷 BRL · 🇲🇽 MXN · 🇨🇦 CAD · 🇨🇴 COP · 🇨🇱 CLP · 🇧🇴 BOB · 🇨🇷 CRC · 🇩🇴 DOP · 🇬🇹 GTQ · 🇭🇳 HNL · 🇯🇲 JMD · 🇺🇾 UYU                                                                   | PIX, SPEI, FedWire/ACH, BRE-B, mobile wallets                                      |
| 🌍 Africa               | 🇳🇬 NGN · 🇰🇪 KES · 🇬🇭 GHS · 🇹🇿 TZS · 🇺🇬 UGX · 🇷🇼 RWF · 🇿🇲 ZMW · 🇸🇱 SLE · XAF and XOF (CFA franc zones)                                                                                          | Instant mobile money (including M-Pesa), bank transfers                            |
| 🌏 APAC and Middle East | 🇦🇪 AED · 🇮🇳 INR · 🇵🇭 PHP · 🇵🇰 PKR · 🇧🇩 BDT · 🇮🇩 IDR · 🇻🇳 VND · 🇹🇭 THB · 🇲🇾 MYR · 🇸🇬 SGD · 🇭🇰 HKD · 🇨🇳 CNY · 🇯🇵 JPY · 🇰🇷 KRW · 🇸🇦 SAR · 🇹🇷 TRY · 🇮🇱 ILS · 🇦🇺 AUD · 🇳🇿 NZD | UPI/IMPS, InstaPay, Raast, PromptPay, DuitNow, FAST, FPS, Sarie, AliPay/WeChat Pay |

Collections (pay-ins) are additionally live in 🇦🇪 AED, 🇺🇸 USD, 🇪🇺 EUR, 🇬🇧 GBP, 🇧🇷 BRL, 🇲🇽 MXN, 🇨🇴 COP, 🇵🇭 PHP, and 🇮🇩 IDR. African mobile-money corridors move money in both directions. Most corridors settle instantly or within the same day.

## Stablecoins

| Stablecoin           | Pegged to      | You can                                |
| :------------------- | :------------- | :------------------------------------- |
| 💵 USDC (Circle)     | 🇺🇸 US Dollar | Deposit, hold, send, pay out           |
| 💵 USDT (Tether USD) | 🇺🇸 US Dollar | Deposit (converted to USDC on arrival) |
| 💶 EURC (Circle)     | 🇪🇺 Euro      | Pay out                                |

Your balance is held in USDC. Your standing deposit address is on **Base**, and incoming stablecoins convert straight into your balance. If you send USDT, it is converted to USDC for you rather than bounced. Stablecoin transfers out are gasless for you; the app shows the valid network for every deposit and send.

Verify every token contract on [Networks and contracts](/reference/networks-and-contracts).

<Note>
  Corridor availability, cut-off times, and any payout cost are shown in the app at the moment you create a payout. Coverage expands regularly; the app is the live source of truth, and new corridors are announced in the [changelog](/changelog).
</Note>
