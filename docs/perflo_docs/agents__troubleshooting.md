> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Troubleshooting: agents

> Fixes for connector setup failures, sign-in loops, unexpected denials, agents stopping mid-task, and recovering after the kill switch.

Symptoms are listed with the most common causes first. Start at the top of the entry that matches yours.

## My assistant can't see the Perflo connector

1. **The connector wasn't added where you're chatting.** Connectors added in Claude's web settings, for example, don't automatically appear in every client. Add it in the settings of the app you're actually using: **Settings → Connectors → Add custom connector**, address `https://mcp.perflo.xyz`.
2. **The app doesn't support custom connectors.** Some AI apps and plan tiers don't allow custom connectors or MCP servers. Check your plan's features.
3. **The connection was added but not approved.** The browser sign-in step must complete; if you closed the tab, remove the connector and add it again.

**Verify recovery:** ask your assistant *"what's my Perflo balance?"*. If it replies with a balance, the connection works.

## I'm stuck in a sign-in loop when approving the connector

1. **Your browser is blocking the sign-in window.** Pop-up blockers and strict privacy modes can break the approval redirect. Allow pop-ups for the sign-in page and retry.
2. **You signed in with a different email.** Approve with the same email your Perflo account uses. A fresh sign-in with a new email creates a new, empty account.
3. **The session went stale.** Remove the connector from your assistant, add it again, and complete sign-in promptly.

## My agent says its request was denied

This is usually guardrails doing their job, not a malfunction.

1. **Check your activity feed.** Every denial is logged with which limit stopped it and the amount attempted.
2. **Match the code** the agent reported against [Errors and denials](/agents/errors-and-denials). Each code lists exactly what fixes it.
3. **If you want the action to go through**, change the relevant limit yourself in the app. Remember that an agent asking you to raise a limit is normal; an agent being *able* to raise a limit is impossible.

## My agent stopped working mid-task

1. **The session expired.** Sessions end on their own (30 days by default, 90 maximum). Renew it in the app; the agent regains exactly the permissions you re-grant.
2. **A cap was reached.** Spending stops when an hourly, daily, or monthly cap is hit and resumes when the window resets. The activity feed shows which one.
3. **The kill switch was used.** All agent spending stays stopped until you re-enable it. See the last entry on this page.
4. **The AI app's own permission prompt is waiting.** Spending actions run through your app's allow/deny prompt; a forgotten prompt looks like a hang.

## The local connector (Claude Code / Claude Desktop) won't authenticate

1. **The `login` tool was never run.** Run it once. It opens a browser sign-in and saves your credentials locally at `~/.grant-cash/credentials.json`.
2. **Saved credentials went stale.** Delete `~/.grant-cash/credentials.json` and run `login` again.
3. **The `GRANTCASH_TOKEN` environment variable is set but wrong.** If you use the advanced token option instead of interactive login, an invalid token fails silently in some agents. Unset it and use `login`, or set a fresh token.
4. **The path in your MCP config is wrong.** The config must point at the *built* file with an absolute path (`/absolute/path/to/grant-cash-mcp/dist/stdio.js`). Rebuild with `npm install && npm run build` if `dist/` is missing.

**Verify recovery:** ask the agent for your balance; a balance reply means authentication works.

## I hit the kill switch. How do I turn things back on?

The kill switch stops all agent spending everywhere, instantly, and it *stays* stopped. Nothing pending survives it, and nothing resumes on its own.

1. In the Perflo app, review your connected apps and sessions in settings. Revoke anything you no longer want.
2. Re-enable agent spending for the sessions you trust. Each resumes with the caps, allowlist, and expiry it had; you can tighten them at the same time.

**Verify recovery:** the agent's next in-limit action succeeds and appears in your activity feed.

## Still stuck?

1. Check your **activity feed** in the app. Every action, denial, and pending item appears there with a timestamp.
2. Find the entry matching your symptom on the troubleshooting pages for [getting started](/getting-started/troubleshooting), [cards and payouts](/cards-banking/troubleshooting), or [agents](/agents/troubleshooting).
3. Email [support@perflo.ai](mailto:support@perflo.ai) from the email address on your account. Include what you were trying to do, the approximate time it happened, and what the activity feed shows.

<Warning>
  Perflo support will never ask for your password, sign-in codes, or ask you to move money "for verification". Anyone who does is not Perflo.
</Warning>
