"use client";

import { useEffect, useRef, useState } from "react";
import { retryReviewProcessing, updateReviewAction } from "./actions";
import { buildReviewDrawerModel, type ReviewEmail, type ReviewIntent } from "./review-drawer-model";

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
              Review evidence only. Payment execution stays manual and separate.
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
                        <strong style={{ fontSize: "13px" }}>{attachment.name}</strong>
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
        </div>

      </aside>
    </div>
  );
}

export function ReviewDrawerLauncher({ email, intent }: { email: ReviewEmail; intent?: ReviewIntent }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="review-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Review row
      </button>
      {open ? (
        <ReviewDrawer
          email={email}
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
