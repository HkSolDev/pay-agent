import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@perflo-ap-agent/db";
import { ingestGmailMessages } from "./ingest.js";
import type { RawGmailMessage } from "./gmail.js";

// Integration test against the real local Postgres (docker compose up -d),
// not a mock — a mocked DB can't prove the UNIQUE constraint actually holds.
function fakeMessage(overrides: Partial<RawGmailMessage> = {}): RawGmailMessage {
  return {
    messageId: "msg-1",
    threadId: "thread-1",
    subject: "Test invoice",
    messageTimestamp: new Date().toISOString(),
    labelIds: ["INBOX"],
    headers: { From: "Riya Sharma <riya@okaxis.example>", To: "owner@example.com" },
    payload: undefined,
    ...overrides,
  };
}

beforeEach(async () => {
  await prisma.email.deleteMany({ where: { gmailMessageId: { startsWith: "msg-" } } });
});

afterAll(async () => {
  await prisma.email.deleteMany({ where: { gmailMessageId: { startsWith: "msg-" } } });
  await prisma.$disconnect();
});

describe("ingestGmailMessages", () => {
  it("writes a new message as a row with parsed sender fields", async () => {
    const result = await ingestGmailMessages([fakeMessage()]);
    expect(result).toEqual({ inserted: 1, skipped: 0 });

    const row = await prisma.email.findUniqueOrThrow({ where: { gmailMessageId: "msg-1" } });
    expect(row.fromAddr).toBe("riya@okaxis.example");
    expect(row.fromName).toBe("Riya Sharma");
  });

  it("never creates a second row for a message already ingested (FR-2)", async () => {
    await ingestGmailMessages([fakeMessage()]);
    const second = await ingestGmailMessages([fakeMessage()]);
    expect(second).toEqual({ inserted: 0, skipped: 1 });

    const count = await prisma.email.count({ where: { gmailMessageId: "msg-1" } });
    expect(count).toBe(1);
  });
});
