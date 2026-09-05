"use client";

import { useEffect, useRef, useState } from "react";
import { retryReviewProcessing, runPaidVerificationAction, updateReviewAction } from "./actions";
import { buildReviewDrawerModel, type ReviewEmail, type ReviewIntent } from "./review-drawer-model";
import { reviewRetryBlockReason, type ReviewRetryPaymentStatus } from "../../worker/src/review-retry";

// Once a payment has actually been attempted, the review-state actions below
// (approve/reject/mark-not-invoice/retry processing) stop making sense —
// they record review state on the email, but the email already went past
// review into a real payment attempt. reviewRetryBlockReason is the same
// gate the server action itself enforces (worker/src/review-retry.ts); the
// UI mirrors it here so the drawer never offers a button that would just
// throw a server error on submit.
function paymentAttemptNotice(status: string | undefined): string | null {
  switch (status) {
    case "claimed":
      return "A payment is currently being processed for this invoice. Review actions are unavailable until it resolves.";
    case "paid":
      return "This invoice has already been paid. There is nothing left to approve, reject, or reprocess.";
    case "failed":
      return "A payment attempt for this invoice failed. Use the Retry button on the payment card (not these review actions) to try again.";
    case "unknown_outcome":
      return "A payment was attempted and its outcome is still unconfirmed at the provider. Review actions are unavailable until it's reconciled.";
    default:
      return null;
  }
}

function stateLabel(state: "pass" | "review" | "fail" | "unknown") {
  switch (state) {
    case "pass": return "Pass";
    case "review": return "Review";
    case "fail": return "Blocked";
    default: return "Unknown";
  }
}

function attachmentState(status: string) {
  if (status === "Extracted") return "pass";
  if (status === "Not a PDF") return "unknown";
  return "review";
}

export function ReviewDrawer({
  email,
  intent,
  onClose,
}: {
  email: ReviewEmail;
  intent?: ReviewIntent;
  onClose: () => void;
}) {
  const model = buildReviewDrawerModel(email, intent);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The same real gate the server actions enforce (reviewRetryBlockReason) —
  // used here only to decide what the drawer *offers*, not to duplicate its
  // own logic; the server call remains the actual enforcement point.
  const paymentAlreadyAttempted = reviewRetryBlockReason((intent?.status ?? null) as ReviewRetryPaymentStatus) !== null;
  const notice = paymentAttemptNotice(intent?.status);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="drawer-layer">
      <button type="button" className="drawer-backdrop" aria-label="Close review" onClick={onClose} />
      <aside className="review-drawer" role="dialog" aria-modal="true" aria-labelledby="review-drawer-title">

        {/* Header */}
        <div className="drawer-header">
          <div>
            <p style={{ margin: "0 0 4px", fontSize: "10px", fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-accent-700)" }}>
              Row review
            </p>
            <h3 id="review-drawer-title" style={{ margin: 0, maxWidth: "440px", fontSize: "20px" }}>
              {model.email.subject}
            </h3>
            <p className="drawer-subtitle">
              {paymentAlreadyAttempted
                ? "Review evidence only — a payment for this invoice has already been attempted (see below)."
                : "Review evidence only. Payment execution stays manual and separate."}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            aria-label="Close review"
            onClick={onClose}
          >
            {/* X icon */}
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="drawer-scroll">

          {/* ── Original email ── */}
          <section className="drawer-section" aria-labelledby="email-heading">
            <div className="section-heading">
              <h4 id="email-heading">Original email</h4>
              <span className="tag tag-accent-2" style={{ fontSize: "10px" }}>Plain text only</span>
            </div>
            <div className="email-meta">
              <div><span>From </span><strong>{model.email.from}</strong></div>
              <div><span>Reply-To </span><strong>{model.email.replyTo}</strong></div>
              <div><span>To </span><strong>{model.email.to}</strong></div>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: "11px", opacity: 0.55 }}>
              Remote images are not loaded. Links remain inert text.
            </p>
            <pre className="email-body">{model.email.body}</pre>
          </section>

          {/* ── Attachments ── */}
          <section className="drawer-section" aria-labelledby="attachments-heading">
            <div className="section-heading">
              <h4 id="attachments-heading">Attachments</h4>
              <span style={{ fontSize: "11px", opacity: 0.55 }}>{model.attachments.length} files</span>
            </div>
            {model.attachments.length === 0 ? (
              <p className="empty-copy">No attachments stored with this email.</p>
            ) : (
              <div className="attachment-list">
                {model.attachments.map((attachment) => (
                  <div className="attachment-row" key={`${attachment.name}-${attachment.size}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {/* paperclip icon */}
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 12l6-6a3 3 0 114 4l-8 8a5 5 0 01-7-7l7-7" />
                      </svg>
                      <div>
                        {attachment.viewUrl ? (
                          <a
                            href={attachment.viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                            title="Open PDF in new tab"
                          >
                            {attachment.name}
                            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </a>
                        ) : (
                          <strong style={{ fontSize: "13px" }}>{attachment.name}</strong>
                        )}
                        <div style={{ fontSize: "11px", opacity: 0.55 }}>{attachment.type} · {attachment.size}</div>
                      </div>
                    </div>
                    <span className={`state-pill ${attachmentState(attachment.status)}`}>{attachment.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Extracted payment details ── */}
          <section className="drawer-section" aria-labelledby="extraction-heading">
            <div className="section-heading">
              <h4 id="extraction-heading">Extracted payment details</h4>
              <span style={{ fontSize: "11px", opacity: 0.55 }}>{model.extractionBackend}</span>
            </div>
            <div className="detail-grid">
              {model.fields.map((field) => (
                <div className="detail-cell" key={field.label}>
                  <span>{field.label}</span>
                  <strong>{field.value}</strong>
                  <small>Confidence {field.confidence}</small>
                </div>
              ))}
            </div>
            <div className="subtle-facts">
              <span>Classification: <strong>{model.classification}</strong> ({model.classificationConfidence})</span>
              <span>Payee resolution: <strong>{model.payeeResolution}</strong></span>
            </div>
            <p className="rationale"><strong>Classifier note:</strong> {model.classificationRationale}</p>
          </section>

          {/* ── Verifier evidence ── */}
          <section className="drawer-section" aria-labelledby="verification-heading">
            <div className="section-heading">
              <h4 id="verification-heading">Verifier evidence</h4>
              <span style={{ fontSize: "11px", opacity: 0.55 }}>Review before acting</span>
            </div>
            <div className="evidence-list">
              {model.verification.map((item) => (
                <div className="evidence-row" key={item.label}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <span className={`state-pill ${item.state}`}>{stateLabel(item.state)}</span>
                </div>
              ))}
            </div>
            {email.injectionDetected && Array.isArray(email.injectionEvidence) && email.injectionEvidence.length > 0 ? (
              <div className="evidence-callout">
                <strong style={{ fontSize: "12px", display: "block", marginBottom: "2px" }}>Injection evidence</strong>
                <span style={{ fontSize: "12px", opacity: 0.85 }}>
                  {email.injectionEvidence.filter((item): item is string => typeof item === "string").join(" · ")}
                </span>
              </div>
            ) : null}
          </section>

          {/* ── Duplicate check ── */}
          <section className="drawer-section" aria-labelledby="duplicate-heading">
            <div className="section-heading"><h4 id="duplicate-heading">Duplicate check</h4></div>
            <div className="duplicate-card">
              <span className={`state-pill ${model.duplicate.status === "Duplicate" ? "fail" : model.duplicate.status === "Review conflict" ? "review" : "pass"}`}>
                {model.duplicate.status}
              </span>
              <div>
                <p>{model.duplicate.detail}</p>
                {model.duplicate.originalEmailId ? <small>Original email: {model.duplicate.originalEmailId}</small> : null}
              </div>
            </div>
          </section>

          {/* ── Policy decision ── */}
          <section className="drawer-section" aria-labelledby="policy-heading">
            <div className="section-heading">
              <h4 id="policy-heading">Policy decision</h4>
              <span className="decision-label">{model.policy.decision}</span>
            </div>
            <ul className="reason-list">
              {model.policy.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
            </ul>
          </section>

          {/* ── Timeline ── */}
          <section className="drawer-section" aria-labelledby="timeline-heading">
            <div className="section-heading"><h4 id="timeline-heading">Timeline</h4></div>
            <ol className="timeline">
              {model.timeline.map((event) => (
                <li className={event.state} key={event.label}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{event.label}</strong>
                    <span>{event.detail}</span>
                    {event.date ? <time>{event.date}</time> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* ── Sticky footer actions ── */}
        <div className="drawer-actions" aria-label="Owner review actions">
          {paymentAlreadyAttempted ? (
            <p className="drawer-payment-notice">{notice}</p>
          ) : (
            <>
              <p>These actions record review state only. None approves an automatic payment.</p>
              <div className="action-row">
                <form action={updateReviewAction}>
                  <input type="hidden" name="emailId" value={email.id} />
                  <input type="hidden" name="action" value="approve" />
                  <button type="submit" className="primary-action">Approve for review</button>
                </form>
                <form action={updateReviewAction}>
                  <input type="hidden" name="emailId" value={email.id} />
                  <input type="hidden" name="action" value="reject" />
                  <button type="submit" className="secondary-action">Reject</button>
                </form>
                <form action={updateReviewAction}>
                  <input type="hidden" name="emailId" value={email.id} />
                  <input type="hidden" name="action" value="not_an_invoice" />
                  <button type="submit" className="secondary-action">Mark not an invoice</button>
                </form>
                <form action={retryReviewProcessing}>
                  <input type="hidden" name="emailId" value={email.id} />
                  <button type="submit" className="secondary-action">Retry processing</button>
                </form>
              </div>
            </>
          )}
        </div>

      </aside>
    </div>
  );
}

export function ReviewDrawerLauncher({ email, intent }: { email: ReviewEmail; intent?: ReviewIntent }) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [verificationResult, setVerificationResult] = useState(email.verificationResult);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function openReview() {
    setOpening(true);
    try {
      const verification = await runPaidVerificationAction(email.id);
      setVerificationResult(verification);
    } catch (error) {
      // Paid verification must never make the queue unusable. The drawer still
      // opens with the evidence already present on the row.
      console.error("Could not run paid verification for review row:", error);
    } finally {
      setOpening(false);
      setOpen(true);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="review-trigger"
        onClick={() => void openReview()}
        disabled={opening}
        aria-haspopup="dialog"
      >
        {opening ? "Opening…" : "Review row"}
      </button>
      {open ? (
        <ReviewDrawer
          email={{ ...email, verificationResult }}
          intent={intent}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
          }}
        />
      ) : null}
    </>
  );
}
