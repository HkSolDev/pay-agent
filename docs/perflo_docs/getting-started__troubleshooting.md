> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Troubleshooting: getting started

> Fixes for stuck verification, missing deposits, declined card top-ups, wrong-network deposits, and locked features.

Symptoms are listed with the most common causes first. Start at the top of the entry that matches yours.

## Verification is stuck in review

**Most verifications complete within minutes.** If yours hasn't:

1. **It went to manual review.** Some checks need a human. The app and an email will notify you when it completes or if anything more is needed; you don't need to resubmit.
2. **The document photo didn't pass.** Blurry photos, cropped edges, glare, and expired documents are the usual culprits. If the app asks you to retry, photograph the document flat, in good light, with all four corners visible.
3. **Your details don't match the document.** The name, date of birth, and nationality you typed must match the ID exactly, including middle names.
4. **Your country isn't supported for the feature you're after.** Availability depends on your country of residence; the app tells you during onboarding if something is restricted where you live.

**Verify recovery:** the app shows a "verified" state, and money features (adding funds, cards, payouts) become available.

## My bank transfer hasn't arrived

1. **Check the details you sent to.** Compare the account number and reference your bank shows against your virtual account details inside the Perflo app. A transfer to slightly-wrong details won't arrive.
2. **The sending bank is still processing.** Local rails (SEPA Instant, Faster Payments, PIX, and others) are usually fast, but your bank may queue first-time or larger payments for its own review. Check the transfer's status in your banking app.
3. **The sender name doesn't match.** Transfers can be held for compliance screening. This is normal for first transfers and third-party pay-ins, and in most cases it resolves without any action from you.

**Verify recovery:** the amount appears in your cash balance and your activity feed.

## My card top-up was declined

1. **Your bank declined it.** Banks sometimes block first payments to a new merchant. The fastest fix is usually approving the payment in your banking app or calling the number on your card.
2. **The security step wasn't completed.** If your bank showed a confirmation prompt (an app notification or code) and it timed out, retry and complete it promptly.
3. **The card type isn't supported.** Some prepaid and corporate cards can't be used for top-ups. Try a standard debit card.
4. **A regional restriction applies.** The app tells you before you start if card top-ups aren't available where you live.

**Verify recovery:** the top-up appears in your activity feed and your balance updates immediately.

## I sent a crypto deposit on the wrong network or as the wrong asset

<Warning>
  Deposits sent as the wrong asset or on the wrong network may be unrecoverable. Perflo cannot promise recovery; some networks make it genuinely impossible.
</Warning>

1. **Confirm exactly what you sent.** Note the asset, the network, the amount, and the transaction reference from the app or exchange you sent from.
2. **Check the supported combinations** on [Networks and contracts](/reference/networks-and-contracts). If you sent a supported asset on a supported network, it may just be slow. Networks vary from seconds to many minutes.
3. **If it was genuinely wrong**, contact support with all the details from step 1. Recovery is attempted case by case and is not guaranteed.

Always copy your deposit address from inside the app, and send only the shown asset on the shown network.

## Investing features are locked even though I added money

1. **Your balance is below the activation threshold.** Investing features (trading, predictions, Earn) unlock once your account is funded past a minimum, enforced identically for the app, agents, and developers. The app shows the threshold. Getting money *out* is never locked.
2. **Your verification level doesn't cover the feature.** Some features need full verification; the app says so before you start.
3. **The feature is restricted in your country.** Prediction markets and leveraged trading, for example, are restricted in certain places.

**Verify recovery:** the feature's button in the app becomes active on its own; there is nothing to toggle manually.

## Still stuck?

1. Check your **activity feed** in the app. Every action, denial, and pending item appears there with a timestamp.
2. Find the entry matching your symptom on the troubleshooting pages for [getting started](/getting-started/troubleshooting), [cards and payouts](/cards-banking/troubleshooting), or [agents](/agents/troubleshooting).
3. Email [support@perflo.ai](mailto:support@perflo.ai) from the email address on your account. Include what you were trying to do, the approximate time it happened, and what the activity feed shows.

<Warning>
  Perflo support will never ask for your password, sign-in codes, or ask you to move money "for verification". Anyone who does is not Perflo.
</Warning>
