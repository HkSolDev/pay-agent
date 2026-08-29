> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Currencies and money

> Use the supported currencies and exact decimal money objects.

Perflo Finance API does not promise a fixed fiat-currency set. Account and beneficiary metadata determine what a customer can use. Integrations must render the currency returned by each resource instead of assuming an account or payout currency.

General money values are objects with an ISO 4217 code and a decimal string. Parse amounts with decimal arithmetic, never binary floating point.

Every amount is written out in full, never in exponent notation: a tenth of a millionth reads `0.0000001`, not `1E-7`. An amount answered from a stored record reads at its own scale, so `12.500000000000000000` reads as `12.5`; an amount Perflo states in the same request keeps the digits it was stated with, so `12.50` stays `12.50`. The one exception is a spelling long enough to be padding rather than an amount: writing an amount out in full is bounded, so a value carrying more redundant zeros than that bound admits reads at its own scale instead. The bound is wide enough that no amount inside the published limit reaches it. Compare amounts as decimals rather than as strings.

That published limit is a rule on what you send as well as on what you read: an amount carries at most 20 digits before the decimal point and at most 18 after it, which is 38 in total at the full-scale corner. An amount carrying more is refused with `422` rather than accepted and rounded when it is stored, so round an amount to at most 18 decimal places before sending it. The limit counts the value rather than the spelling it is written in, so redundant trailing zeros carry nothing and are ignored: `1.000000000000000000000` is one digit and no decimal places.

Mandate creation caps, mandate execution amounts, and beneficiary grant payment amounts are positive decimal strings without a currency field. They are always denominated in USD, the only control unit for those amounts. Service-purchase `max_price` remains a USD money object.

Display conversion is informational. Preserve the source amount and currency in decisions, confirmations, records, and idempotent request bodies.
