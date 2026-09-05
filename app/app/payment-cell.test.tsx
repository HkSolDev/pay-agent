import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./actions", () => ({
  confirmPayment: vi.fn(),
  preparePayment: vi.fn(),
}));

import { PaymentCell } from "./payment-cell";

describe("PaymentCell rendering", () => {
  it("renders failed state cleanly without inlining long raw lastError text", () => {
    const longError =
      "Confirmed no funds moved (checked manually, 5 Sep 2026) — Perflo CLI call timed out before returning any reference, so automatic reconciliation could not resolve it.";

    const html = renderToStaticMarkup(
      <PaymentCell
        emailId="email-fail-1"
        classification="invoice"
        intent={{
          status: "failed",
          amount: "1500",
          recipientNickname: "Acme",
          paymentReference: null,
          lastError: longError,
        }}
      />
    );

    expect(html).toContain("pill-failed");
    expect(html).toContain("payment-failed-wrap");
    expect(html).toContain("<span>Failed</span>");
    // Ensure raw error is NOT in visible text
    expect(html).not.toContain(`<span>Failed (${longError})</span>`);
    // Full error must be in the title attribute
    expect(html).toContain(`title="${longError}"`);
    // Retry button remains present
    expect(html).toContain("button-retry");
    expect(html).toContain("Retry");
  });

  it("renders failed state when lastError is null", () => {
    const html = renderToStaticMarkup(
      <PaymentCell
        emailId="email-fail-2"
        classification="invoice"
        intent={{
          status: "failed",
          amount: "1500",
          recipientNickname: "Acme",
          paymentReference: null,
          lastError: null,
        }}
      />
    );

    expect(html).toContain("pill-failed");
    expect(html).toContain("<span>Failed</span>");
    expect(html).not.toContain("title=");
  });

  it("renders unknown_outcome in-flight with provider-neutral wording", () => {
    const html = renderToStaticMarkup(
      <PaymentCell
        emailId="email-inflight-1"
        classification="invoice"
        intent={{
          status: "unknown_outcome",
          amount: "1500",
          recipientNickname: "Acme",
          paymentReference: null,
          lastError: "processing",
        }}
      />
    );

    expect(html).toContain("pill-inflight");
    // Must NOT contain RazorpayX anywhere
    expect(html).not.toContain("RazorpayX");
    expect(html).not.toContain("Razorpay");
    // Provider-neutral text
    expect(html).toContain("Still processing — no action needed yet");
    expect(html).toContain(
      'title="FR-27: never automatically retried — the payment provider hasn&#x27;t confirmed the outcome yet"'
    );
  });

  it("renders unknown_outcome uncertain with provider-neutral wording", () => {
    const html = renderToStaticMarkup(
      <PaymentCell
        emailId="email-uncertain-1"
        classification="invoice"
        intent={{
          status: "unknown_outcome",
          amount: "1500",
          recipientNickname: "Acme",
          paymentReference: null,
          lastError: "timeout occurred",
        }}
      />
    );

    expect(html).toContain("pill-uncertain");
    // Must NOT contain RazorpayX anywhere
    expect(html).not.toContain("RazorpayX");
    expect(html).not.toContain("Razorpay");
    // Text and tooltip
    expect(html).toContain("Uncertain — check before retrying");
    expect(html).toContain(
      'title="FR-27: never automatically retried — the payment provider hasn&#x27;t confirmed the outcome yet"'
    );
  });
});
