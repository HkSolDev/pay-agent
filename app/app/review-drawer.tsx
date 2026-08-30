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
        <div className="drawer-header">
          <div>
            <p className="eyebrow">ROW REVIEW</p>
            <h2 id="review-drawer-title">{model.email.subject}</h2>
            <p className="drawer-subtitle">Review evidence only. Payment execution stays manual and separate.</p>
          </div>
          <button ref={closeRef} type="button" className="icon-button" aria-label="Close review" onClick={onClose}>×</button>
        </div>

        <div className="drawer-scroll">
          <section className="drawer-section" aria-labelledby="email-heading">
            <div className="section-heading">
              <h3 id="email-heading">Original email</h3>
              <span className="safe-note">Plain text only</span>
            </div>
            <dl className="email-meta">
              <div><dt>From</dt><dd>{model.email.from}</dd></div>
              <div><dt>Reply-To</dt><dd>{model.email.replyTo}</dd></div>
              <div><dt>To</dt><dd>{model.email.to}</dd></div>
            </dl>
            <p className="safe-note">Remote images are not loaded. Links remain inert text.</p>
            <pre className="email-body">{model.email.body}</pre>
          </section>

          <section className="drawer-section" aria-labelledby="attachments-heading">
            <div className="section-heading">
              <h3 id="attachments-heading">Attachments</h3>
              <span className="count">{model.attachments.length} files</span>
            </div>
            {model.attachments.length === 0 ? (
              <p className="empty-copy">No attachments stored with this email.</p>
            ) : (
              <div className="attachment-list">
                {model.attachments.map((attachment) => (
                  <div className="attachment-row" key={`${attachment.name}-${attachment.size}`}>
                    <div><strong>{attachment.name}</strong><span>{attachment.type} · {attachment.size}</span></div>
                    <span className={`state-pill ${attachmentState(attachment.status)}`}>{attachment.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="drawer-section" aria-labelledby="extraction-heading">
            <div className="section-heading">
              <h3 id="extraction-heading">Extracted payment details</h3>
              <span className="count">{model.extractionBackend}</span>
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

          <section className="drawer-section" aria-labelledby="verification-heading">
            <div className="section-heading">
              <h3 id="verification-heading">Verifier evidence</h3>
              <span className="count">Review before acting</span>
            </div>
            <div className="evidence-list">
              {model.verification.map((item) => (
                <div className="evidence-row" key={item.label}>
                  <div><strong>{item.label}</strong><span>{item.detail}</span></div>
                  <span className={`state-pill ${item.state}`}>{stateLabel(item.state)}</span>
                </div>
              ))}
            </div>
            {email.injectionDetected && Array.isArray(email.injectionEvidence) && email.injectionEvidence.length > 0 ? (
              <div className="evidence-callout danger"><strong>Injection evidence</strong><span>{email.injectionEvidence.filter((item): item is string => typeof item === "string").join(" · ")}</span></div>
            ) : null}
          </section>

          <section className="drawer-section" aria-labelledby="duplicate-heading">
            <div className="section-heading"><h3 id="duplicate-heading">Duplicate check</h3></div>
            <div className="duplicate-card">
              <span className={`state-pill ${model.duplicate.status === "Duplicate" ? "fail" : model.duplicate.status === "Review conflict" ? "review" : "pass"}`}>{model.duplicate.status}</span>
              <div><p>{model.duplicate.detail}</p>{model.duplicate.originalEmailId ? <small>Original email: {model.duplicate.originalEmailId}</small> : null}</div>
            </div>
          </section>

          <section className="drawer-section" aria-labelledby="policy-heading">
            <div className="section-heading"><h3 id="policy-heading">Policy decision</h3><span className="decision-label">{model.policy.decision}</span></div>
            <ul className="reason-list">
              {model.policy.reasons.map((reason, index) => <li key={`${reason}-${index}`}>{reason}</li>)}
            </ul>
          </section>

          <section className="drawer-section" aria-labelledby="timeline-heading">
            <div className="section-heading"><h3 id="timeline-heading">Timeline</h3></div>
            <ol className="timeline">
              {model.timeline.map((event) => (
                <li className={event.state} key={event.label}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div><strong>{event.label}</strong><span>{event.detail}</span>{event.date ? <time>{event.date}</time> : null}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="drawer-actions" aria-label="Owner review actions">
          <p>These actions record review state only. None approves an automatic payment.</p>
          <div className="action-row">
            <form action={updateReviewAction}><input type="hidden" name="emailId" value={email.id} /><input type="hidden" name="action" value="approve" /><button type="submit" className="primary-action">Approve for review</button></form>
            <form action={updateReviewAction}><input type="hidden" name="emailId" value={email.id} /><input type="hidden" name="action" value="reject" /><button type="submit" className="secondary-action">Reject</button></form>
            <form action={updateReviewAction}><input type="hidden" name="emailId" value={email.id} /><input type="hidden" name="action" value="not_an_invoice" /><button type="submit" className="secondary-action">Mark not an invoice</button></form>
            <form action={retryReviewProcessing}><input type="hidden" name="emailId" value={email.id} /><button type="submit" className="secondary-action">Retry processing</button></form>
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
      <button ref={triggerRef} type="button" className="review-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Review row
      </button>
      {open ? <ReviewDrawer email={email} intent={intent} onClose={() => { setOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); }} /> : null}
    </>
  );
}
