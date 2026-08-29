# Skills & Master Playbook (August 2026)

This document synthesizes the curated skills, design principles, and execution schedule for building the **Perflo Autonomous AP Agent**.

---

## 1. The Core Skillset Intersection

| Skill | Role | Why It Matters Here |
|---|---|---|
| **`tdd`** | Test-Driven Development | Write double-spend & race condition tests (T-18 to T-22) before writing the executor code. |
| **`domain-modeling`** | Data Architecture | Separation of `payees`, `payee_identities`, `payee_payment_methods`, and `grants` (Enforces FR-16 exact match). |
| **`grill-with-docs`** | Specification Rigor | Forces the agent to consult `docs/PRD_PERFLO_AP_AGENT_V0.md` and `https://perflo.xyz/skill.md`, eliminating hallucinated parameters. |
| **`improve-codebase-architecture`** | Modular Separation | Clean boundaries: `ingest/`, `engine/`, `agent/`, `perflo/`, `ui/`. |
| **`vercel-react-best-practices` + `frontend-design`** | Enterprise Queue UI | Dense, responsive Queue Table & safe email drawer (Brex/Ramp-style), not a chatbot. |
| **`supabase-postgres-best-practices`** | DB Concurrency | Enforces `UNIQUE` indexes, `SELECT ... FOR UPDATE SKIP LOCKED`, and in-flight serialization. |
| **`cso` / Red-Team Security** | Threat Defense | Verifies defense against prompt injection, spoofed headers, and lookalike domains (T-11 to T-17). |

---

## 2. The 3 Non-Negotiable Prohibitions

1. **No Chatbots**: The primary interface is a **Queue Dashboard**.
2. **No Local Link Fetching**: Invoice links must be evaluated exclusively via Perflo's x402 headless browser (`browse_web`), never local HTTP requests.
3. **No LLM Payment Permissions**: The LLM output is structured JSON only. Only deterministic backend code calls `perflo recipient pay`.

---

## 3. Timeline & Execution Roadmap

* **Friday (Today)**: Level 0 (PostgreSQL Schema + Composio Ingest + Locked Manual Pay via Perflo CLI) $\rightarrow$ Level 1 (Classifier + Extractor + Policy Engine).
* **Saturday**: Level 2 (Anti-Phishing Verifier + SPF/DKIM/DMARC headers + x402 tools + T-1 to T-25 test suite) + Queue UI Polish.
* **Sunday**: Level 3 (Background Crons + Reconciler + Required Docs: `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `EDGE_CASES.md` + 8-minute Demo Video).

---

## 4. Universal Master Prompt

```
Use grill-with-docs on docs/PRD_PERFLO_AP_AGENT_V0.md and https://perflo.xyz/skill.md.
Architecture: ingest → postgres → classify (no tools) → extract → resolver → verifier (evidence only) → policy (code) → CLI pay → reconcile.
LLM never pays. Follow tdd for T-18–T-22.
UI: queue table, vercel-react-best-practices + frontend-design.
Build Level N only. After each block, teach me what I should remember.
```
