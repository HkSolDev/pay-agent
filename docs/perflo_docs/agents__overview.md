> ## Documentation Index
> Fetch the complete documentation index at: https://docs.perflo.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# AI agents on Perflo

> Give an AI agent real financial capability with limits you control. This is what Perflo is built for.

export const marketplaceSize = "hundreds of verified pay-per-call services, with new ones added weekly";

Perflo gives AI agents the same money capabilities you have: check balances, earn on idle cash, trade, place prediction positions, create cards, send payments, and pay for third-party services per call. Every capability runs inside guardrails you set, and nothing an agent does can exceed them.

## What an agent can do

* **Read:** portfolio, prices, positions, activity.
* **Money actions:** deposit to and withdraw from Earn, open and manage futures positions, place prediction positions, send payouts, all within your permissions.
* **Spend:** pay whitelisted recipients, fund virtual cards just in time for purchases, and buy from a marketplace of {marketplaceSize}: search, data, media generation, email, and more. See [The service marketplace](/agents/services).
* **Automate:** run standing rules you describe in plain language, such as "sweep anything over \$500 into Earn" or "top up my card before it runs dry."

## What an agent can never do

Four guarantees apply to every agent connected to Perflo, with no exceptions:

* **Agents never hold your keys.** An agent gets a permission slip, never the account itself.
* **Hard caps are checked before money moves.** Every spend is tested against your limits first. A request over the cap is refused, not queued.
* **Agents can't raise their own limits.** Any request from an agent to change its permissions is refused automatically. Only you, in the app, can change limits.
* **The kill switch always works.** One tap in the app instantly cuts off every agent's access.

An agent also cannot withdraw to an external address you have not approved. That always requires a fresh confirmation from you.

## How working with an agent actually goes

1. **Connect** your AI app once. Setup takes about five minutes.
2. **Grant** a budget: caps, an allowlist, an expiry.
3. **The agent works** inside those limits; every action appears in your activity feed in real time.
4. **When something is refused**, the agent gets a machine-readable reason and your feed shows which limit stopped it.
5. **You renew, tighten, or revoke**, or hit the kill switch and stop everything at once.

## Where agents run

Perflo agents work wherever you already work with AI:

* **Claude, ChatGPT, and other AI apps** via the Perflo hosted connector. Your assistant gains Perflo tools directly in chat.
* **Coding agents like Claude Code** via a local Perflo connector you run yourself.
* **Inside the Perflo app** via plain-language automation rules and a daily morning brief.

## Everything agent-related

<CardGroup cols={2}>
  <Card title="Connect an agent" icon="plug" href="/agents/connect">
    Hosted connector for AI apps, local connector for coding agents. About five minutes.
  </Card>

  <Card title="Spending and budgets" icon="gauge-high" href="/agents/spending-and-budgets">
    Caps, allowlists, expiry, auto top-up, statements, and the kill switch.
  </Card>

  <Card title="The service marketplace" icon="store" href="/agents/services">
    What your agent can buy, how services are verified, and how pricing works.
  </Card>

  <Card title="Agent security" icon="shield-halved" href="/agents/security">
    The full threat model: manipulation, misbehaving services, runaway agents.
  </Card>

  <Card title="Errors and denials" icon="circle-exclamation" href="/agents/errors-and-denials">
    Every machine-readable code an agent can receive, and what fixes each.
  </Card>

  <Card title="Troubleshooting" icon="wrench" href="/agents/troubleshooting">
    Connector setup, sign-in loops, unexpected stops, and kill-switch recovery.
  </Card>
</CardGroup>

<Note>
  An agent acts on behalf of a verified person or business. Compliance screening and transaction monitoring apply to agent activity exactly as they do to human activity.
</Note>
