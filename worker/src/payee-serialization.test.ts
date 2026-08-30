import { describe, expect, it } from "vitest";
import { runWithPayeeLock } from "./payee-serialization.js";

describe("Per-payee serialization", () => {
  it("never runs two payments for the same payee concurrently", async () => {
    let active = 0;
    let maxActive = 0;
    const execute = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    };

    await Promise.all([
      runWithPayeeLock("riya-1", execute),
      runWithPayeeLock("riya-1", execute),
    ]);
    expect(maxActive).toBe(1);
  });

  it("allows different payees to proceed independently", async () => {
    let active = 0;
    let maxActive = 0;
    const execute = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    };

    await Promise.all([runWithPayeeLock("riya-1", execute), runWithPayeeLock("aman-1", execute)]);
    expect(maxActive).toBe(2);
  });

  it("releases a payee lock after failure so a later payment does not deadlock", async () => {
    await expect(runWithPayeeLock("riya-1", async () => { throw new Error("Perflo unavailable"); })).rejects.toThrow("Perflo unavailable");
    await expect(runWithPayeeLock("riya-1", async () => "second attempt")).resolves.toBe("second attempt");
  });
});
