import { Composio } from "@composio/core";

// Whoever connected Gmail through Composio's OAuth flow — one person's inbox,
// per PRD 3.1. Not a per-request value; it identifies the connected account.
const GMAIL_USER_ID = "perflo-ap-owner";

// Built lazily, not at module load: constructing Composio() throws immediately
// if COMPOSIO_API_KEY is missing, and we want that failure to surface inside
// pollOnce()'s try/catch (worker logs it and retries), not as an uncaught
// exception that kills the whole process on startup.
let composio: Composio | undefined;
function getComposio(): Composio {
  if (!composio) composio = new Composio();
  return composio;
}

// One session per process, reused across polls — sessions are meant to be
// persisted and resumed, not recreated on every call (per Composio's docs).
let sessionPromise: ReturnType<Composio["create"]> | undefined;
function getSession() {
  if (!sessionPromise) sessionPromise = getComposio().create(GMAIL_USER_ID);
  return sessionPromise;
}

export interface RawGmailMessage {
  messageId: string;
  threadId: string;
  subject: string | null;
  messageTimestamp: string; // ISO 8601 — confirmed from a real response, not `internalDate` as docs implied
  labelIds: string[];
  headers: Record<string, string>;
  payload: unknown; // base64url body + attachments — parsed later, not here
}

/**
 * True once the owner has clicked through Gmail's OAuth consent screen for
 * this session. Level 0 can run before this is true — every poll just finds
 * nothing connected and returns zero messages instead of erroring.
 */
export async function isGmailConnected(): Promise<boolean> {
  const session = await getSession();
  const toolkits = await session.toolkits({ isConnected: true });
  return toolkits.items.some((t: { slug: string }) => t.slug === "gmail");
}

/**
 * The one-time Gmail connect flow. Prints the link for the owner to open and
 * approve, then resolves once they have. Run this once, by hand — never from
 * the cron loop (see connect-gmail.ts).
 */
export async function connectGmail(): Promise<void> {
  const session = await getSession();
  const connectionRequest = await session.authorize("gmail");
  console.log(`Open this link and approve access: ${connectionRequest.redirectUrl}`);
  // Default wait is 60s — not enough time for a human to actually click
  // through Google's consent screen. 5 minutes is a sane real limit instead.
  await connectionRequest.waitForConnection(5 * 60 * 1000);
  console.log("Gmail connected.");
}

/**
 * Pull every Gmail message since `sinceEpochSeconds`.
 * NOTE: only fetches the raw message envelope + headers for now. Decoding the
 * MIME body/attachments into bodyText/attachments/links is a separate, later
 * step (FR-3) — doing it here would make this function do two jobs.
 */
export async function fetchNewGmailMessages(
  sinceEpochSeconds: number,
): Promise<RawGmailMessage[]> {
  const session = await getSession();

  // 100 + full payloads in one call hit Composio's 413 payload-too-large limit
  // on a real inbox. 20 is safe; the 5-minute poll interval means a genuinely
  // busy inbox just gets picked up across a couple of extra ticks, not lost.
  const result = await session.execute("GMAIL_FETCH_EMAILS", {
    query: `after:${sinceEpochSeconds}`,
    max_results: 20,
    verbose: true,
    include_payload: true,
  });

  const messages = (result as { data?: { messages?: unknown[] } }).data?.messages ?? [];

  return messages.map((m) => {
    const msg = m as {
      messageId: string;
      threadId: string;
      subject?: string;
      messageTimestamp: string;
      labelIds?: string[];
      payload?: { headers?: { name: string; value: string }[] };
    };
    return {
      messageId: msg.messageId,
      threadId: msg.threadId,
      subject: msg.subject ?? null,
      messageTimestamp: msg.messageTimestamp,
      labelIds: msg.labelIds ?? [],
      // The real response nests headers as an array of {name, value} inside
      // payload — there's no flat top-level `headers` map, despite what the
      // docs example implied. Found this from an actual message, not a guess.
      headers: flattenHeaders(msg.payload?.headers ?? []),
      payload: msg.payload,
    };
  });
}

function flattenHeaders(headers: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) out[h.name] = h.value;
  return out;
}
