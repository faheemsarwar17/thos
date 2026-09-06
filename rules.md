# THOS — Rules

Version: 1.0 · July 2026
Companion documents: `prd.md` (requirements) · `architecture.md` (technical design) · `phases.md` (delivery gates) · `design.md` (UX/UI system) · `implementation-plan.md` (build sequence)

---

## 0. How to Use This Document

These are **binding constraints**, not preferences. They apply to every engineer, designer, and AI coding agent working in this codebase, on every change, regardless of which phase (`phases.md`) is currently in flight. A rule here overrides a convenience shortcut, a faster implementation path, or a request from a single stakeholder unless that request comes with a recorded decision overriding the rule (`phases.md` §Decision Log). If a rule and a ticket disagree, the rule wins — flag the conflict rather than silently picking one.

Each rule is written as a **must** or **must never**. Anything not covered here defaults to the guidance in `architecture.md` and `design.md`.

---

## 1. Architectural Rules

1. **The engine must never contain domain knowledge.** No `if (domain === "...")`, no hardcoded question text, rubric, or ontology term inside any engine service. If you're tempted to do this, the content belongs in a Domain Pack manifest instead (`architecture.md` §5).
2. **A new industry must never require an engine-service code change.** Any exception must be logged as architecture debt immediately, not shipped silently and forgotten.
3. **An application must have exactly one canonical stage**, engine-defined by category, tenant-configurable only by ID/label (`architecture.md` §11). No view is allowed to maintain its own copy of "where this candidate is."
4. **All stage changes must go through the single transition command path** (`architecture.md` §9) — never a direct field update to `Application.stage` from any service or script.
5. **Domain Pack manifests must be validated before activation**, atomically. A partially-applied pack must never exist.

---

## 2. Data & Tenancy Rules

1. **Tenant context is mandatory** on every request, query, cache entry, event, object-storage path, and search-index document. A code path with no tenant scoping is a defect, not an optimization.
2. **Cross-tenant data access must be denied server-side**, not merely hidden in the UI. Hidden navigation items are a UX convenience, never a security boundary.
3. **Consent revocation must propagate to search and employer visibility within the SLA defined in Phase 0**, without corrupting existing lawful records (e.g., a completed application stays on file per retention policy even if the candidate later revokes discovery consent).
4. **Personal data (resumes, transcripts, recordings) must never appear in analytics instrumentation, logs, or error traces.** Use stable, content-free event names.
5. **Every mutation to permissions, configuration, candidate decisions, scores, exports, or overrides must produce an append-only audit record** — actor, reason, timestamp, old state, new state.

---

## 3. AI & Automation Rules

1. **AI must never be the final actor on a reject, hire, or offer decision.** It may score, flag, recommend, and summarize. A human action is required to execute any of those three outcomes, in every workflow, without exception.
2. **Every AI-generated or AI-evaluated artifact must store its prompt, model, pack, rubric, and policy version.** A score without a reproducible version trail must not ship.
3. **AI evidence must cite only real transcript/resume/submission segments.** Inventing or paraphrasing evidence beyond what was actually said is a defect, not a style issue.
4. **Protected characteristics must be excluded from scoring context** unless a specific, legally approved audit requires them — and that audit path is itself restricted and logged.
5. **Structured AI output must be schema-validated.** Invalid output retries safely, then falls back to a human review queue — it must never be silently discarded, guessed at, or auto-corrected without a record.
6. **Recalculating an evaluation must create a new version.** The original result is never overwritten, so a candidate's decision history stays reconstructable.
7. **Consequential automation actions (reject, hire, stage-move) must default to creating a human task, not acting directly.** An administrator may explicitly configure a more autonomous path only with an approval gate and a visible audit trail.
8. **Automation rules must be idempotent, versioned, dry-run-testable, and pausable** (globally and per-rule) before they can be published.
9. **A failed AI or automation task must never silently block a candidate.** It must surface in an exception inbox with cause, owner, and a safe retry or manual fallback.

---

## 4. Security Rules

1. **Authentication and session handling must be centralized** in the Authentication Service — no service implements its own parallel login/session logic.
2. **The Practical Assessment Sandbox must run in a separate, network-isolated runtime**, never colocated with the Core API, with enforced resource quotas.
3. **All object storage access must use signed, short-lived URLs**; every upload must pass malware scanning and content-type/size enforcement before it is stored.
4. **Secrets must never be committed to the repository or embedded in client-side code.**
5. **Every stage-mutating endpoint must independently re-validate authorization server-side**, even if the UI already prevented the action from being shown.

---

## 5. Privacy & Consent Rules

1. **Cross-organization profile visibility requires explicit candidate consent.** Default visibility is scoped to the organizations the candidate has actively applied to or opted into.
2. **Data export and deletion requests must be honored within the retention policy's defined SLA**, and must not leave orphaned personal data in derived stores (search index, analytics, cache).
3. **Interview recordings and transcripts are personal data** and follow the same access-control and retention rules as resumes — they must never be exposed to a different organization than the one the candidate applied to.
4. **Legal holds override standard retention/deletion timers** and must be explicitly modeled, not implemented as an ad hoc exception.

---

## 6. Accessibility Rules

1. **WCAG 2.2 AA is the minimum bar for every critical path** (onboarding, application, Applied Interview, Kanban movement, offer/decision) — not an aspirational target.
2. **Every drag-and-drop interaction must have a complete keyboard-only equivalent.** No feature may ship as pointer-only.
3. **Status, score, and severity must never be conveyed by color alone.** Always pair color with a text label and, where practical, an icon (`design.md` §Color).
4. **Every interactive element must have a visible focus state.** Suppressing focus outlines for aesthetic reasons is not permitted.
5. **Countdown timers, autosave confirmations, and live status updates must use polite live regions**, not interrupt screen-reader users on every tick.
6. **The Kanban board must degrade to an accessible list/table view** carrying identical actions — this is a required alternative, not a nice-to-have.

---

## 7. UX & Content Rules

1. **A control's label and its resulting confirmation must use the same verb** ("Advance" produces "Advanced," never "Moved"). Vocabulary is fixed once it ships.
2. **Candidates must never see internal stage names, private notes, or reviewer deliberation.** Only the mapped four-step candidate-facing status is shown (`architecture.md` §11.2).
3. **Every screen must show the next action, not just current state**, per the product delivery principle in `prd.md` §2 — a dashboard of numbers with no path to act on them is incomplete.
4. **Empty states must teach the next action** and distinguish "no data" from "no permission" from "filtered to zero results" — these are three different messages, never one generic blank.
5. **Errors must state exactly what's missing or wrong**, in the interface's voice, and must never apologize on the product's behalf or use vague language like "something went wrong" without a specific cause and next step.
6. **Destructive or irreversible actions require a reason and a confirmation step**; reversible actions (most stage moves) should prefer an Undo window over a confirmation dialog.

---

## 8. API & Event Rules

1. **All mutating commands (apply, submit, transition, invite, notify) require an idempotency key.** Retried requests must never produce duplicate side effects.
2. **Event schemas are versioned and contract-tested.** A breaking change to an event payload requires a new `event_version`, not an in-place mutation of consumers' expectations.
3. **Every event carries `tenant_id`, `actor`, and `correlation_id`.** An event without these is invalid and must be rejected by the bus, not silently accepted.
4. **A version mismatch on a transition command returns a conflict with current state** — the API must never silently apply a stale client's intent over newer server state.

---

## 9. Testing & Quality Gates

1. **A story is not "ready" without:** explicit persona/outcome, acceptance criteria covering success/empty/loading/error/denied/concurrency states, tenant/role/consent/audit implications identified, and an agreed API/event contract.
2. **A story is not "done" without:** automated coverage at the appropriate layer, authorization/tenant-isolation tests for any changed access path, accessibility and keyboard-workflow checks, implemented loading/error/retry/empty states, and backward-compatible or rehearsed-migration data changes.
3. **Cross-tenant isolation must be covered by an automated denial test suite** — this is a release gate, not a manual QA checklist item.
4. **A new Domain Pack must pass the existing contract, interview, sandbox, matching, and analytics test suites unmodified** before it can be considered complete (`phases.md` Phase 7).
5. **Test fixtures must never contain real candidate personal data.**

---

## 10. Fairness & Governance Rules

1. **Every Domain Pack undergoes recurring bias audits** (score disparities across gender, institution tier, and other non-merit attributes) as a standing governance item, not a one-time pre-launch check.
2. **A candidate must have a clear, working appeals path** for any AI-graded result they believe misrepresented them, routed to human review with a bounded response SLA.
3. **Fairness/calibration data access is restricted** to authorized governance roles and requires minimum sample thresholds before conclusions are surfaced, to avoid drawing conclusions from statistically meaningless samples.

---

## 11. Change Management Rules

1. **A workflow (stage/transition configuration) is versioned on publish.** Active postings and applications continue on their pinned version; a later edit requires an explicit migration preview before affecting them.
2. **Every decision that affects scope, architecture, data, security, UX, or delivery order must be recorded** in `phases.md` §Decision Log with date, reason, consequence, and owner — not left as an undocumented Slack agreement.
3. **A Domain Pack version is pinned per organization on activation and per posting at creation time.** Packs are never silently upgraded underneath an in-flight posting.

---

## 12. Naming & Component Conventions

1. **UI component names must match the vocabulary in `design.md`** (`score-badge`, `pill`, `kanban-card`, `pack-chip`, `drawer`, `attention-queue-card`, etc.) — design and code use one shared vocabulary, not a translated one.
2. **Service and event names use the nouns and verbs defined in `architecture.md` §3 and §10** — do not introduce a synonym for an existing entity or event (e.g., no second name for "Applied Interview").
3. **Any new reusable UI primitive must be added to the shared primitives list in `architecture.md` §14.2 before a second screen uses a copy of it.**

---

## 13. Escalation

If a rule in this document appears to block a legitimate, urgent need: do not silently override it. Raise it as a decision-log entry with the specific rule cited, the proposed exception, its scope and expiry, and an accountable owner. Rules 3.1 (AI as final decision-maker), 4.2 (sandbox isolation), and 2.1/2.2 (tenant isolation) are considered non-negotiable and are not subject to exception without a full security/legal review — flag these separately rather than routing them through the standard decision log.
