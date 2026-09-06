# THOS — Product Requirements Document (PRD)

Version: 1.0 · July 2026
Companion documents: `architecture.md` (technical design) · `rules.md` (binding constraints) · `phases.md` (delivery gates) · `design.md` (UX/UI system) · `implementation-plan.md` (build sequence)

---

## 1. Purpose & Audience

This PRD defines **what** THOS must do and **why**, independent of implementation detail. It is written for product, design, engineering leads, and any AI coding agent using this repository as context — when in doubt about a feature's intent, this is the source of truth over any individual code comment or Slack thread.

If a requirement here conflicts with `architecture.md`, this document wins on intent; `architecture.md` wins on technical feasibility trade-offs, and conflicts should be logged as a decision (see `phases.md` §Decision Log).

---

## 2. Product Summary

THOS is a multi-tenant, AI-native **hiring operating system**. It separates hiring into two layers:

- A **Universal Hiring Engine** — auth, tenancy, ATS workflow, interview orchestration, sandboxed assessment execution, matching, search, analytics — built once and shared by every customer, in every industry.
- **Domain Intelligence Packs** — swappable modules (Education, Software Engineering, Business & Marketing, Healthcare, Finance, …) that supply the ontology, question generation, and grading rubrics for a specific field.

The platform runs a **two-stage AI interview model**:
1. A **Profile Interview** — self-directed, candidate-owned, retakeable, general to a domain. Produces a portable Skill Score.
2. An **Applied Interview** — employer-owned, generated from a specific job description, curated by the hiring org, locked, one attempt per candidate.

THOS originated as PATN (Pakistan Academic Talent Network), a single-domain academic hiring tool. The Education Pack is the founding, flagship Domain Pack; the underlying engine is built generically from day one.

---

## 3. Problem Statement

**Generic job portals** (LinkedIn, Indeed-style boards) have reach but no domain intelligence: they cannot verify an academic credential, run a subject-specific technical interview, or evaluate teaching ability. Screening remains manual after the platform does little more than collect applications. Opportunity discovery is entirely candidate-driven.

**Single-domain vertical tools** (the original PATN concept) go deep in one field but cap their addressable market there, and every new industry traditionally means rebuilding a near-duplicate product.

Within Pakistani academia specifically: chronic faculty shortages, paper-heavy recruitment, job postings scattered across disconnected channels, no shared visibility into visiting faculty availability, and no shared infrastructure for inter-university collaboration.

**The question THOS answers:** can one platform be both wide (general enough for any industry) and deep (expert enough to be genuinely useful in each one), while proactively connecting proven candidates to roles they haven't searched for — rather than trading off reach against depth?

---

## 4. Goals & Success Metrics

| Goal | Metric | Target (directional — confirm in Phase 0) |
|---|---|---|
| Prove the two-layer architecture | Zero engine-service code changes required to add the second Domain Pack (Phase 7) | 0 required changes; every exception logged as architecture debt |
| Reduce hiring time | Median time-to-hire, Education Pack pilot | ≥30% reduction vs. baseline manual process |
| Build reusable candidate proof of ability | % of candidates who reuse a Profile Interview result across ≥2 applications | Track from Phase 2 onward |
| Increase passive discovery | Notification-to-application conversion rate | Track from Phase 5 onward; feed back into matching weights |
| Keep humans in control of decisions | % of reject/hire/offer decisions with a human actor of record | 100% — non-negotiable (see `rules.md` §4) |
| Screening quality | Reviewer/AI rubric agreement rate | Defined and monitored from Phase 6 (fairness/calibration workflow) |
| Platform trust | WCAG 2.2 AA pass rate on critical paths | 100% of Phase 0 keyboard/screen-reader critical paths |

---

## 5. Personas

| Persona | Summary | Primary workspace |
|---|---|---|
| **Organization Administrator** | Sets up the tenant, units/departments, activates Domain Packs, configures workflow templates and retention policy. | Employer — Administration |
| **Hiring Manager / Head of Department** | Creates and publishes postings, curates Applied Interview question pools, reviews candidates, makes hiring decisions. | Employer — Jobs, Pipeline, Interviews |
| **HR / Talent Team** | Manages pipeline operations, compliance, documentation, offers, communications. | Employer — Pipeline, Messages, Analytics |
| **Candidate / Member** | Builds a verified profile, takes Profile Interviews, applies to postings, takes Applied Interviews, tracks status. | Candidate — Overview, Profile, Skill Profile, Applications |
| **Short-Term / Visiting Talent** | Lists availability for short-term/visiting engagements. | Candidate — Opportunities (marketplace mode) |
| **Specialist / Collaborator** | Specialized profile for research or project collaboration, not a standard hire. | Candidate — Profile (specialist mode) |

Full role/permission scope lives in `architecture.md` §12 (Security & Tenancy).

---

## 6. Scope

### 6.1 In scope (platform-wide, all phases)
- Universal Hiring Engine: multi-tenancy, ATS pipeline, Two-Stage Interview Orchestrator, Practical Assessment Sandbox, Proactive Matching & Notification Engine, Talent Discovery Engine, Analytics & Workforce Planning, Automation engine.
- Domain Pack Registry and the Education Pack (founding pack).
- Candidate-owned Profile Interview (retakeable) and employer-owned Applied Interview (one-shot, curated, locked).
- Human-in-the-loop control over every consequential hiring decision.

### 6.2 In scope (later phases, see `phases.md`)
- Second and third Domain Packs (Software Engineering; Business & Marketing) to prove portability.
- Visual automation builder, workforce planning analytics, fairness/calibration governance tooling.
- External pack-authoring SDK (evaluated, not committed, for opening to third parties).

### 6.3 Explicitly out of scope (Phase 1 and until revisited)
- AI making a final hire/reject/offer decision without a human action.
- Any domain-specific logic implemented inside an engine service rather than a Domain Pack.
- Native mobile apps (responsive web is the Phase 0 assumption — confirm in `phases.md` §12.1).
- Public/open pack authorship by third parties (Phase 7 evaluates only whether to open this later).
- Payroll, background-check, or full HRIS/onboarding functionality beyond a hire event and (optional) webhook handoff to existing systems.

---

## 7. Functional Requirements

Requirements are grouped by capability area. Each includes representative user stories with acceptance criteria; not every acceptance criterion for every minor variant is enumerated — see `phases.md` epic backlog for sprint-level breakdown.

### 7.1 Organization Onboarding & Configuration
**FR-1.1 — Tenant setup.** An organization can sign up, verify (including accreditation/HEC recognition for universities), and configure its internal unit/department structure.
> *As an Organization Administrator, I want to define campuses/departments or business units, so hiring can be scoped and reported at the right level.*
> Acceptance: units form a tree; roles can be scoped to a unit; audit log records all changes.

**FR-1.2 — Domain Pack activation.** An org can browse, activate, and version-pin one or more Domain Packs.
> Acceptance: activating a pack validates its manifest against the Domain Pack contract (`architecture.md` §5); an invalid manifest is rejected with a specific validation error, never partially activated.

**FR-1.3 — Workflow configuration.** An org can start from a default hiring workflow or build a reusable, versioned workflow template (stages, required fields, approvals, SLA targets, rejection reasons, permitted transitions).
> Acceptance: publishing a new workflow version does not retroactively change the workflow version pinned to already-published postings (see `architecture.md` §11 canonical state model).

### 7.2 Candidate Profile & Skill Profile
**FR-2.1 — Profile creation & resume parsing.** A candidate can create an account, upload a resume or enter data manually, and review/correct AI-extracted fields before anything is treated as verified.
> Acceptance: extraction review screen highlights fields and confidence; nothing is silently accepted as verified; candidate can edit every field.

**FR-2.2 — Domain selection.** A candidate selects one or more target domains from active packs (e.g. "Assistant Professor, Computer Science," "Backend Developer").

**FR-2.3 — Profile Interview.** A candidate can take a self-directed, pack-generated interview ending in a practical task (code sandbox for technical domains; structured scenario workspace for non-technical domains).
> *As a candidate, I want to demonstrate my ability once and reuse that proof across applications, so I don't re-prove myself from scratch every time.*
> Acceptance: interview is resumable after disconnect without creating a duplicate attempt; submission is explicit and produces a Skill Score, rubric-dimension breakdown, and an evidence-based strengths/gaps summary; retake is available after a cooldown window with a randomized question/task pool.

**FR-2.4 — Score visibility control.** A candidate can choose (subject to org policy) whether organizations see their best or most recent Profile Interview attempt, not full history by default.

**FR-2.5 — Consent & cross-org visibility.** A candidate controls whether their profile is discoverable across organizations; revoking consent removes them from discovery within a defined SLA without corrupting existing lawful records (e.g. completed applications).

### 7.3 Job Creation & Publishing
**FR-3.1 — Job authoring.** A hiring manager selects a unit, Domain Pack, and workflow template, and enters structured requirements plus a raw JD/course outline.

**FR-3.2 — AI-generated question pool.** On posting creation, the active pack generates a large candidate question pool, a practical task, and a draft rubric scoped to that posting.

**FR-3.3 — Curation.** The hiring team can keep, edit, reorder, remove, or regenerate individual pool items, and append custom closing questions the pack didn't generate.
> Acceptance: a coverage meter flags any competency with zero questions before publish; preview mode shows the exact candidate experience and estimated duration.

**FR-3.4 — Lock & publish.** Once approved, the question pool and workflow version are locked; every applicant to that posting draws from the identical locked pool.
> Acceptance: locking requires an explicit action and a final diff; unlocking requires creating a new version and cannot mutate any already-completed attempt.

### 7.4 Application, Screening & Pipeline
**FR-4.1 — Apply.** A candidate applies using a profile snapshot plus any job-specific screening questions; duplicate submission is prevented idempotently.

**FR-4.2 — AI resume/CV screening.** Applications are ranked using the active pack's extraction rules, existing Profile Interview score, and matching weights, while preserving human control over any resulting decision.

**FR-4.3 — Pipeline movement.** Recruiters move candidates through configurable stages (default: Received → Screened → Shortlisted → Applied Interview → Offer → Hired) via an accessible Kanban or list view, with required fields, approvals, and audit recorded on every transition.
> Acceptance: every stage move is authorized and validated server-side; reversible moves support Undo; irreversible/consequential moves require a reason and are logged with actor, timestamp, and old/new state.

**FR-4.4 — Candidate-facing status.** Candidates see a simplified four-step timeline (Application received → Under review → Interview → Decision) mapped from the internal workflow, never the internal stage names or notes.

### 7.5 Applied Interview
**FR-5.1 — Invitation.** Moving a candidate to the Applied Interview stage creates/activates an invitation from the posting's locked pool, showing deadline, expected duration, accommodations, and consent.

**FR-5.2 — One-shot, immutable submission.** The candidate completes the interview and practical task once; autosave and reconnection protect progress; submission is explicit and immutable.
> Acceptance: no candidate-initiated retake exists; only an org-authorized, reason-logged technical reset can reopen an attempt.

**FR-5.3 — Evaluation.** AI evaluation produces rubric-dimension scores, evidence citations, integrity flags, and stated limitations; human reviewers complete scorecards and record the decision.
> Acceptance: AI output can never itself advance, reject, or hire a candidate.

### 7.6 Proactive Matching & Notifications
**FR-6.1 — Automatic matching.** On posting publish, the matching engine evaluates all candidates in that domain (respecting tenant and consent boundaries) and dispatches explainable match notifications.

**FR-6.2 — Candidate preferences.** Candidates control notification scope (domain, seniority, location, comp band, remote/on-site) to prevent noise at scale.

**FR-6.3 — Employer watch.** A hiring manager can watch for candidates newly crossing a Skill Score threshold, even before a requisition is open.

### 7.7 Talent Discovery
**FR-7.1 — Faceted search.** Employers can search the verified talent pool by expertise, qualification, Skill Score, availability, and location.

**FR-7.2 — Explainable match.** Results separate required-criteria-met, preferred-criteria-met, and missing/unknown evidence — never a single opaque rank.

**FR-7.3 — Comparison.** A small, explicit comparison tray compares candidates by rubric dimension.

### 7.8 Automation
**FR-8.1 — Rule builder.** Administrators can build WHEN/IF/THEN/WAIT automation rules from triggers, conditions, actions, and delays, using recipes as starting points.

**FR-8.2 — Safety by construction.** Consequential actions (reject, hire, stage-move) default to creating a human task rather than executing automatically; every rule supports dry-run/test, versioning, an impact preview, loop detection, duplicate-notification suppression, and a global/per-rule pause.

### 7.9 Analytics & Governance
**FR-9.1 — Operational dashboards.** Funnel, time-to-hire, time-in-stage, source quality, and notification-conversion metrics, every metric linking to the underlying filtered record list.

**FR-9.2 — Fairness monitoring.** Recurring bias audits per Domain Pack with minimum sample thresholds and restricted access; a documented appeals path for a candidate who believes an AI-graded result misrepresented them.

### 7.10 Domain Pack System
**FR-10.1 — Pack contract.** A pack supplies ontology, knowledge graph, resume extraction rules, matching weights, Profile/Applied Interview generators, evaluation rubric, and (optional) compliance rules — see `architecture.md` §5 for the manifest schema.

**FR-10.2 — Zero engine changes.** Adding a new industry must require authoring and registering a new pack only; any engine-service change required to support a new pack is logged as architecture debt and resolved before the pack is considered complete (validated explicitly in Phase 7).

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Accessibility** | WCAG 2.2 AA on all critical paths; full keyboard equivalents for drag-and-drop; visible focus states; color never the sole carrier of status. |
| **Privacy & consent** | Candidate consent required for cross-org profile sharing; consent revocation reflected in search/visibility within a defined SLA; export/deletion/retention policies configurable per tenant. |
| **Security** | Mandatory tenant context on every request/query/cache/event/storage/search boundary; sandboxed, network-isolated code execution; signed short-lived object URLs; malware scanning on uploads. |
| **AI governance** | Every AI-generated/evaluated artifact stores prompt/model/pack/rubric/policy version; structured output is schema-validated; protected characteristics excluded from scoring context unless a legally approved audit requires them; AI never silently rejects, hires, or overrides a human decision. |
| **Reliability** | Async/AI-driven operations always expose a visible state (`Queued → Processing → Completed` or `Needs attention → Retrying → Resolved/Cancelled`); failures never silently block a candidate; manual fallback exists for critical hiring actions. |
| **Performance** | p95 targets for navigation, API reads/writes, search, and board interaction defined in Phase 0 and tracked as release gates (`phases.md` §Non-Functional Release Gates). |
| **Auditability** | Append-only audit records for permissions, configuration, candidate decisions, score changes, exports, and overrides. |
| **Localization readiness** | English at launch; UI and content structured for localization from the start (no hardcoded strings in engine logic). |

---

## 9. Release Criteria (MVP)

Phase 1 (see `phases.md`) is the MVP boundary: Universal Hiring Engine + Education Pack, validated end-to-end through Pakistani academic hiring. MVP is releasable when:
- A candidate can complete onboarding, a Profile Interview, an application, and an Applied Interview end-to-end.
- A hiring team can process a candidate from Received to Hired or Rejected with every move authorized, validated, and auditable.
- No internal-only status or note is ever exposed to a candidate.
- Tenant isolation is proven by an automated cross-tenant denial test suite.
- WCAG 2.2 AA passes on the above critical paths.

---

## 10. Assumptions & Dependencies

- Initial market is Pakistani academic hiring (Education Pack); initial locale is English.
- One tenant may contain multiple units/departments.
- Web client is a responsive browser application at launch (no native mobile app committed for Phase 1).
- Human approval is required for rejection, offer, and hire actions in every workflow, by default.
- MVP notification channels are in-app and email.
- These are **working assumptions** pending confirmation in Phase 0 (`phases.md` §12.1) — treat as provisional until the linked decision is recorded.

---

## 11. Risks

Tracked and owned in `phases.md` §Risk Register. Headline product risks:
- Domain logic leaking into the engine, eroding the "new industry = new pack, not a new product" claim.
- Inconsistent AI grading on open-ended, non-technical tasks relative to objectively-testable code tasks.
- Candidate trust erosion if status communication is silent between pipeline gates (directly addressed by FR-4.4).
- Compute cost of live sandbox execution and AI-graded scenario tasks at scale.

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Engine** | The Universal Hiring Engine — domain-agnostic services shared by every tenant and pack. |
| **Domain Pack** | A swappable module supplying ontology, question generation, and rubrics for one industry/field. |
| **Profile Interview** | Candidate-owned, general, retakeable interview producing a portable Skill Score. |
| **Applied Interview** | Employer-owned, job-specific, one-shot interview generated from a posting's JD/course outline. |
| **Skill Score** | The scored, evidence-backed output of a Profile Interview attempt, presented with a tier (e.g. Gold/Silver/Bronze). |
| **Locked pool** | The finalized, immutable Applied Interview question set for one specific posting. |
| **Canonical state** | The single, engine-defined source of truth for an application's stage category (see `architecture.md` §11). |
