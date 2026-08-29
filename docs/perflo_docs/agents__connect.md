> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Connect an agent

> Add Perflo to Claude, ChatGPT, or any AI app in about five minutes, and connect coding agents like Claude Code.

**Goal:** your AI assistant connected to your Perflo account and answering "what's my balance?" For AI apps this takes about five minutes. You need a verified Perflo account.

Perflo connects to AI apps through an open standard called MCP (the Model Context Protocol), the same way your assistant already talks to other tools. There are two ways to connect, and both use one Perflo sign-in:

* **A hosted connector** you add by URL, the fast path for Claude, ChatGPT, Perplexity, and other apps that accept custom connectors.
* **A local connector** you run yourself, for coding agents like Claude Code and for Claude Desktop.

Pick whichever matches how you work. Everything your agent can do stays inside the guardrails you set.

## Connect Claude, ChatGPT, or another AI app (about 5 minutes)

You paste one address into your assistant's settings, sign in to Perflo in your browser, and you are done. There is nothing to install.

<Steps>
  <Step title="Open your assistant's connector settings">
    In Claude: **Settings → Connectors → Add custom connector**. ChatGPT, Perplexity, and other apps have an equivalent screen for adding a custom connector or MCP server.
  </Step>

  <Step title="Paste the Perflo connector address">
    Enter:

    ```
    https://mcp.perflo.xyz
    ```

    Your assistant recognizes it as a Perflo connector and opens a secure sign-in.
  </Step>

  <Step title="Sign in and approve">
    The Perflo sign-in screen opens in your browser. It shows exactly what the connection can do, and you approve it. This uses a secure sign-in standard (OAuth): the connector never sees or stores your Perflo password, and you can revoke it anytime from the Perflo app.
  </Step>

  <Step title="Check it works">
    Ask your assistant: **"what's my Perflo balance?"**

    **You'll see:** your balance in the reply. That's the connection working. Reads like this never need approval.
  </Step>

  <Step title="Set a budget before it can spend">
    Reading works right away. Before an agent can spend, set a guardrail: a cap, an allowlist, and an expiry. See [Agent spending and budgets](/agents/spending-and-budgets).
  </Step>
</Steps>

The approval screen spells out the deal in three lines:

* **View your balances and positions**
* **Move your money and pay for services**
* **Spending is guardrailed; revoke anytime**

Once connected, just talk to your assistant in plain language: "what's my balance," "move \$500 into Earn," or "research this and pay for the data you need" all work.

<Tabs>
  <Tab title="Claude (web & desktop)">
    Settings → Connectors → Add custom connector → paste `https://mcp.perflo.xyz`. Approve the Perflo sign-in that opens in your browser.
  </Tab>

  <Tab title="ChatGPT">
    Add a custom connector (or MCP server) in settings and paste `https://mcp.perflo.xyz`. Approve the Perflo sign-in when it opens.
  </Tab>

  <Tab title="Perplexity & other apps">
    Any app that supports custom MCP connectors works the same way: add the connector by URL using `https://mcp.perflo.xyz`, then approve the Perflo sign-in.
  </Tab>
</Tabs>

## What your agent can do once connected

One sign-in gives your assistant two things:

* **Your money.** See your portfolio and balances, earn yield, open futures positions, place prediction positions, send payouts, and review your history.
* **Paid online services.** Find and pay for pay-per-use services on your behalf. The agent searches [the marketplace](/agents/services), checks the exact price, and pays only within your cap.

### The safety model

This does not change no matter which app connects:

Four guarantees apply to every agent connected to Perflo, with no exceptions:

* **Agents never hold your keys.** An agent gets a permission slip, never the account itself.
* **Hard caps are checked before money moves.** Every spend is tested against your limits first. A request over the cap is refused, not queued.
* **Agents can't raise their own limits.** Any request from an agent to change its permissions is refused automatically. Only you, in the app, can change limits.
* **The kill switch always works.** One tap in the app instantly cuts off every agent's access.

Two more properties complete the picture:

* **Reads never need approval.** Checking balances and prices is always free to do.
* **Spending actions run through your AI app's own permission prompt first**, then Perflo's guardrail check. Moving money *out* of Perflo always requires you to sign in your browser personally.

The full threat model, including what happens if your assistant gets manipulated, is on [Agent security](/agents/security).

## Connect a coding agent (Claude Code or Claude Desktop)

For terminal and desktop agents, you run a small Perflo connector locally and point your agent at it. It gives the same capabilities as the hosted connector, on your own machine.

<Steps>
  <Step title="Get the connector and build it">
    Clone the connector repository, then install and build it:

    ```bash theme={null}
    npm install && npm run build
    ```
  </Step>

  <Step title="Point your agent at it">
    Add the connector to your agent's MCP config (for Claude Code, `.mcp.json` or your user settings), using the absolute path to the built file:

    ```json theme={null}
    {
      "mcpServers": {
        "grant-cash": { "command": "node", "args": ["/absolute/path/to/grant-cash-mcp/dist/stdio.js"] }
      }
    }
    ```
  </Step>

  <Step title="Sign in once">
    Run the `login` tool once. It opens a browser sign-in and remembers you afterward. (Advanced: you can instead set a `GRANTCASH_TOKEN` environment variable to skip the interactive login.) Your sign-in is saved locally at `~/.grant-cash/credentials.json`.

    **You'll see:** the agent answering "what's my balance?", the same check as the hosted path.
  </Step>
</Steps>

<Note>
  `grant-cash` is the technical identifier for Perflo's connector. You'll see it in the config key, the credentials path, and the skill folder below. It connects to the same Perflo account.
</Note>

### Add the Perflo playbook (optional but recommended)

The connector gives your agent the tools; a companion **skill** teaches it the multi-step playbooks: how to earn, use futures and prediction markets, handle funding and identity verification, transfer funds, and pay for agent services well. Adding it makes your agent noticeably smarter about money.

<Tabs>
  <Tab title="claude.ai">
    Build the skill package and upload it:

    ```bash theme={null}
    npm run build:skill
    ```

    This produces `dist/grant-cash-skill.zip`. Upload it at **Settings → Features → Skills**. (Requires a plan that supports skills.)
  </Tab>

  <Tab title="Claude Code">
    The skill is just files. Copy or symlink the connector's `skill/` folder into your skills directory:

    ```bash theme={null}
    ln -s /absolute/path/to/grant-cash-mcp/skill ~/.claude/skills/grant-cash
    ```
  </Tab>
</Tabs>

## If something goes wrong

Connector not appearing, sign-in loops, and local-connector authentication failures are covered step by step in [Agent troubleshooting](/agents/troubleshooting).

## Revoking access

Every connected app appears in your Perflo settings with its own permission set. Revoke one connection, or hit the kill switch to stop all agent spending at once. Revocation is immediate.

<Warning>
  Only connect assistants and apps you trust, and grant the minimum permissions the job needs. Guardrails cap the damage a misbehaving agent can do, but the best protection is a short allowlist and a low cap. Nothing an agent does can move money out of your account without you signing in your browser.
</Warning>
