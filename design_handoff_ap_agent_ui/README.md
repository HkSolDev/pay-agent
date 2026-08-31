# Handoff: Perflo AP Agent — Queue, Payees, Review Drawer, Confirm & Pay

## Overview
Mockup of the Perflo AP Agent UI: an email-intake payment queue with owner approval, a payee/rail registry, a review drawer showing extraction/verification evidence, and a confirm-and-pay modal. Matches your existing app's screens (`app/page.tsx` = queue, `app/payees/page.tsx` = payees, `review-drawer.tsx`, `payment-cell.tsx`, `payee-form.tsx`).

## About the Design Files
The bundled file (`Perflo AP Agent.dc.html`) is a **design reference built in HTML**, not production code to copy in. Recreate it in your Next.js/React app using your existing components (`queue-view.tsx`, `review-drawer.tsx`, `payee-form.tsx`, `payment-cell.tsx`, `payee-rail-row.tsx`) and Tailwind/CSS setup — don't paste the HTML in directly. Open the file in a browser to see it live; view-source for exact markup/classes if useful.

## Fidelity
**High-fidelity.** Colors, type, spacing, and states are final-intent (built on the "Organic" design system: cream ground, terracotta + sage accents, Caprasimo headings over Figtree body, pill buttons, 16px+ radii). If your app doesn't already use this token set, port the values below into your Tailwind config / CSS variables; if it does, map directly to your existing tokens of the same names.

## Screens

### 1. Payment Queue (`app/page.tsx` → `queue-view.tsx`)
- **Header**: kicker "PERFLO AP AGENT" (11px, uppercase, letter-spacing .1em, terracotta-700) + `<h1>Payment queue`. Actions row: "Payees" link (secondary btn, shows approved count tag), "Sync now" (disabled secondary), "Paused" status pill (disabled, tinted terracotta-100/800). On mobile, Sync/Paused are hidden; header stacks vertically.
- **Balance banner**: sage-tinted card (`--color-accent-2-100` bg) showing RazorpayX test balance.
- **KPI row**: 4 clickable cards (Needs approval / Paid·settled / Quarantined / Other·all) — each is a filter tab; active state = 2px colored border matching its category color. Grid: 4 cols desktop, 2 cols mobile.
- **Payee registry banner**: icon + "N approved payees (M active encrypted rails)" + "+ Add & manage payees" link to Payees screen. Wraps to two rows on narrow widths, no overlap.
- **Filter tabs** (pill buttons with count tags): Needs approval / Paid / Quarantine / All activity — same filter state as KPI cards.
- **Queue rows** (cards), one per email/invoice item:
  - Left: sender + ref + date; state tag (quarantine=dark pill, needs approval=terracotta tag, ignored=neutral tag, approved=sage tag); amount → payee name + rail tag; subject + snippet; optional warning pill (e.g. prompt-injection notice) in terracotta-100/800.
  - Right (action column, 190px min-width desktop / full-width mobile): a state machine per row —
    - **idle**: "Prepare payment" primary button
    - **preparing**: inline mini-form (nickname + amount inputs, Prepare→ / Cancel)
    - **ready** (pending): sage-tinted summary card + "Confirm & pay" button → opens modal
    - **processing** (claimed): grey pill "Processing…"
    - **paid**: sage pill "Paid · {reference}"
    - **failed**: dark pill "Failed ({error})" + "Retry" button → opens modal
    - **unknown_outcome**: terracotta pill "Uncertain — check before retrying" (FR-27: never auto-retried)
    - **not payable** (ignored review): neutral "Not payable" pill, no action
  - Clicking "Review row" opens the Review Drawer for that item.
- Empty state: centered "No items in this filter." card when a tab has zero matches.

### 2. Payees (`app/payees/page.tsx` → `payee-form.tsx`, `payee-rail-row.tsx`)
- Header: same kicker + `<h1>Payees`, "← Back to queue" button.
- Setup-only notice banner (icon + copy: approving a payee/rail/grant here never sends a payment).
- "Add payee" card: 4-field grid (Payee name, Sender email, Recipient nickname [placeholder "e.g. sunrise-textiles"], Per-payment cap ₹) — 4 cols desktop, 1 col mobile. Primary "Add payee" button (disabled in mock).
- "Payees" list card: each payee is a bordered block — name + status tag (approved/revoked), meta row (nickname, per-cap, total-cap, expiry), then one row per payment rail (kind + masked identifier + active/revoked tag).

### 3. Review Drawer (`review-drawer.tsx`)
Right-side slide-over (560px desktop, full-width mobile via same component), scrim backdrop, closes on scrim click or X.
- Header: "ROW REVIEW" kicker + subject line + "Review evidence only. Payment execution stays manual and separate."
- Sections (each divided by a hairline): Original email (from/to, plain-text-only notice, monospace body preview, remote images/links inert notice) · Attachments (file chip + "Extracted" tag) · Extracted payment details (2-col grid of field/value/confidence) · Verifier evidence (sender identity + SPF/DKIM rows with pass/blocked tags; if quarantined, a dark "Injection evidence" callout) · Policy decision (tag + reasoning list) · Timeline (dot + label + detail per step).
- Sticky footer: disclaimer + Approve for review / Reject / Mark not an invoice buttons (all record-only, no payment).

### 4. Confirm & Pay Modal
Centered dialog over backdrop. Warning copy ("you're about to send a real payout… cannot be automatically retried if wrong"), summary card (amount/recipient/rail), Cancel + sage-filled "Confirm & pay" button.

## Interactions & Behavior
- Device toggle (Desktop/Mobile) and Screen toggle (Queue/Payees) in the mock are dev-only viewer controls — not part of the real product; ignore them in implementation, they just simulated breakpoints for this prototype.
- Row state machine transitions: idle → preparing → ready → processing → paid, with failed/unknown_outcome as terminal error branches. "Retry" and "Confirm & pay" both reopen the same modal.
- KPI cards and filter-tab pills share one `tab` state — clicking either updates the same filter.
- No animations beyond native hover/focus states from the design system (buttons, tags, inputs already themed — don't restyle).

## State Management
- `screen`: 'queue' | 'payees'
- `tab`: 'needs_approval' | 'paid' | 'quarantine' | 'all'
- Per-row payment status: idle | preparing (local draft: nickname, amount) | pending ("ready") | claimed ("processing") | paid (+ reference) | failed (+ lastError) | unknown_outcome
- `drawerId` / `modalId`: currently-open item for drawer/modal (null = closed)

## Design Tokens (Organic system — see `_ds/organic-.../styles.css` for full ramps)
- Background: `--color-bg` #f5ead8 · Text: `--color-text` #201e1d
- Accent (terracotta): `--color-accent` #c67139, ramp 100–900
- Accent 2 (sage): `--color-accent-2` #7a8a5e, ramp 100–900
- Headings: Caprasimo · Body: Figtree
- Radius: 16px base (`--radius-md/lg`), pill buttons `border-radius: 999px`
- Elevation: `--shadow-sm/md/lg` utility classes `.elev-sm/md/lg`

## Responsive Behavior
- Breakpoint ~980px: queue header stacks (title above actions), Sync/Paused buttons hidden below it.
- KPI grid: 4 cols → 2 cols on mobile frame (390px).
- Row action column: fixed 190px side column (desktop) → full-width stacked below content (mobile).
- Add-payee form grid: 4 cols → 1 col on mobile.
- Title uses `clamp()` + media query so it never wraps mid-word at in-between (laptop/half-screen) widths.

## Assets
No external images. Icons are inline Lucide-style SVGs (stroke-width 2.75, matching design-system convention) — replace with your existing icon library's equivalents (search/clock, check-circle, shield, alert-triangle, users, credit-card, arrow-right, x, upload icons used).

## Files in this bundle
- `Perflo AP Agent.dc.html` — **the design source of truth.** Open it in a browser (or view-source) for exact markup, inline styles, colors, spacing, icons, and interaction logic. Every color/font/spacing value used across the whole design lives only in this file and in `_ds/organic-.../styles.css`.
- `_ds/organic-.../styles.css`, `_ds_bundle.js` — the Organic design-system tokens/components referenced by the mock (colors, type ramps, button/card/tag/dialog styles)
- `support.js` — mockup runtime only, not relevant to your app
- `screenshots/queue-desktop.png`, `review-drawer.png`, `payees-desktop.png`, `queue-mobile.png`, `payees-mobile.png` — visual reference for each screen/state
