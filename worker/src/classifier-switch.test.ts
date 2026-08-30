import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyWithSelectedBackend } from "./ingest.js";
import * as llmClassifier from "./llm-classifier.js";

// Proves the CLASSIFIER_MODE safety switch actually gates which backend
// runs — not just that both backends individually work (already covered by
// classifier.test.ts and llm-classifier.test.ts).

const genuineInvoice = {
  subject: "Invoice #77",
  bodyText: "Please find attached invoice for ₹800, due Friday.",
  fromName: "Vendor",
  fromAddr: "billing@vendor.com",
};

const originalMode = process.env.CLASSIFIER_MODE;
afterEach(() => {
  if (originalMode === undefined) delete process.env.CLASSIFIER_MODE;
  else process.env.CLASSIFIER_MODE = originalMode;
  vi.restoreAllMocks();
});

describe("classifyWithSelectedBackend", () => {
  it("uses the free rule-based classifier when CLASSIFIER_MODE is unset", async () => {
    delete process.env.CLASSIFIER_MODE;
    const llmSpy = vi.spyOn(llmClassifier, "classifyEmailWithLLM");

    const result = await classifyWithSelectedBackend(genuineInvoice);

    expect(llmSpy).not.toHaveBeenCalled();
    expect(result.kind).toBe("invoice");
  });

  it("uses the free rule-based classifier for any value other than exactly 'llm'", async () => {
    process.env.CLASSIFIER_MODE = "LLM"; // wrong case on purpose
    const llmSpy = vi.spyOn(llmClassifier, "classifyEmailWithLLM");

    await classifyWithSelectedBackend(genuineInvoice);

    expect(llmSpy).not.toHaveBeenCalled();
  });

  it("uses the real LLM classifier only when CLASSIFIER_MODE=llm exactly", async () => {
    process.env.CLASSIFIER_MODE = "llm";
    const llmSpy = vi
      .spyOn(llmClassifier, "classifyEmailWithLLM")
      .mockResolvedValue({ kind: "invoice", confidence: 0.99, injectionDetected: false, injectionEvidence: [], rationale: "fake" });

    const result = await classifyWithSelectedBackend(genuineInvoice);

    expect(llmSpy).toHaveBeenCalledOnce();
    expect(result.rationale).toBe("fake");
  });
});
