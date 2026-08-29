import { describe, expect, it } from "vitest";
import { sha256Bytes } from "./content-integrity.js";

describe("source content integrity", () => {
  it("creates a SHA-256 hash from the original bytes", () => {
    const originalPdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);

    expect(sha256Bytes(originalPdfBytes)).toBe(
      "86edbaa24831badfa0a8b04bb410141e2ee4182b6d0014493fe262a7a331c20b",
    );
  });

  it("returns the same hash for the same source bytes", () => {
    const firstRead = new Uint8Array([1, 2, 3]);
    const secondRead = new Uint8Array([1, 2, 3]);

    expect(sha256Bytes(firstRead)).toBe(sha256Bytes(secondRead));
  });
});
