import { describe, expect, it } from "vitest";
import { DEMO_PREFIX, listDemoScenarios } from "./demo-inbox.js";

describe("seeded demo inbox", () => {
  it("has named coverage for the Level 1 milestone", () => {
    const names = new Set(listDemoScenarios().map((scenario) => scenario.name));
    for (const name of ["english-invoice", "multiline-pdf", "german-pdf", "scanned-pdf", "corrupt-pdf", "prompt-injection", "changed-upi", "changed-bank", "multiple-rails", "unknown-sender", "conflicting-sender-rail", "exact-duplicate", "conflicting-duplicate"]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("keeps fixture IDs isolated from real Gmail rows", () => {
    expect(DEMO_PREFIX).toBe("demo-");
    expect(listDemoScenarios().every((scenario) => scenario.message.messageId.startsWith(DEMO_PREFIX))).toBe(true);
  });
});
