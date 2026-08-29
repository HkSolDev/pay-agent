> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Troubleshooting: cards and payouts

> Fixes for declined card payments, delayed payouts, paused bank withdrawals, rejected transfers, and frozen cards.

Each symptom below lists its most common causes first. Start at the top of the entry that matches yours.

## A card payment was declined

1. **The card doesn't hold enough.** Virtual cards spend what you loaded onto them, not your whole balance. Check the card's balance in the app and top it up from your cash balance.
2. **The card's daily limit was reached.** Each card has its own daily spending limit. Check it on the card's settings screen; you can raise it there.
3. **The card is frozen.** A frozen card declines everything. Unfreeze it in one tap from the card screen.
4. **The merchant or region is restricted.** Some merchant categories and regions can't be served; card availability depends on your region and verification level.

**Verify recovery:** retry the payment. A successful charge appears on the card's transaction list immediately.

## My payout hasn't arrived

1. **The rail is still settling.** Most corridors are instant or same-day, but some banks post incoming payments only during business hours. Check the payout's status in your activity feed first: "sent" means it left Perflo.
2. **A compliance check is running.** Payouts are screened; first payouts to a new recipient can take longer. No action is needed from you unless the app asks.
3. **The recipient details are off.** Even one wrong digit sends the money to the wrong place or bounces it. Compare the saved recipient's details against what the recipient gave you.

**Verify recovery:** the payout shows as completed in your activity feed and the recipient confirms receipt.

## Bank withdrawals are paused

This is a protection, not a failure. Withdrawals to a bank account can only go to the destination you verified. **If that destination changes, all bank withdrawals pause** until you approve the new one with a one-time confirmation in the Perflo app. No agent or anyone else can approve it for you.

1. Open the app. A pending approval for the new payout destination will be waiting.
2. If **you didn't change the destination**, do not approve it. Revoke access for anything you don't recognize in settings and contact support immediately.

**Verify recovery:** after you approve, withdrawals resume with the new destination.

## The recipient's bank rejected the transfer

1. **Name mismatch.** Many banks reject payments where the account name doesn't match. Re-check the exact registered name with your recipient.
2. **The account can't receive that currency** or is closed. Confirm the account accepts the payout currency shown in the app.
3. **The corridor has requirements you didn't complete.** Some currencies need extra recipient details (branch codes, purpose of payment). The app asks for everything needed; if a saved recipient is missing details, edit them and retry.

Rejected payouts are returned to your balance; the activity feed shows the return when it lands.

## I sent a payout to the wrong account

<Warning>
  A payout to a wrong but *valid* account number may be unrecoverable. Perflo screens payouts for compliance, but it cannot verify that an account number belongs to the person you intend.
</Warning>

Contact support immediately with the payout's activity-feed entry. Recovery depends on the receiving bank and is not guaranteed, so every hour counts.

## A card was frozen and I don't know why

1. **You (or a rule you set) froze it.** Check the card screen; unfreezing is one tap and takes effect immediately.
2. **An agent finished a just-in-time purchase.** Cards created by agents for a single purchase are designed to be frozen right after use. This is normal; see [Virtual cards](/cards-banking/virtual-cards).
3. **A protective freeze was applied.** If the app shows a security notice on the card, follow it, and check your activity feed for anything you don't recognize.

## Still stuck?

1. Check your **activity feed** in the app. Every action, denial, and pending item appears there with a timestamp.
2. Find the entry matching your symptom on the troubleshooting pages for [getting started](/getting-started/troubleshooting), [cards and payouts](/cards-banking/troubleshooting), or [agents](/agents/troubleshooting).
3. Email [support@perflo.ai](mailto:support@perflo.ai) from the email address on your account. Include what you were trying to do, the approximate time it happened, and what the activity feed shows.

<Warning>
  Perflo support will never ask for your password, sign-in codes, or ask you to move money "for verification". Anyone who does is not Perflo.
</Warning>
