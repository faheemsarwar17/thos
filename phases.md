# THOS — Phases & Delivery Plan

Version: 1.0 · July 2026
Companion documents: `prd.md` (requirements) · `architecture.md` (technical design) · `rules.md` (binding constraints) · `design.md` (UX/UI system) · `implementation-plan.md` (build sequence)

---

## 0. How to Use This Document

Phases are **implementation gates, not fixed calendar promises** — add dates and owners once team capacity is known. Each phase has a goal, a scope checklist, and exit criteria that must be true before the next phase begins in earnest (some overlap is fine; skipping exit criteria is not). Status markers for checklist items: `⬜ Not started` · `🟡 In progress` · `🟢 Complete` · `🔴 Blocked` · `⚪ Deferred`.

> **Status — July 2026.** A working local pilot delivers the core hiring loop across Phases 1–4 in simplified form: tenancy/roles with automated isolation tests, Education Pack activation, versioned workflows, candidate profiles and consent, Profile and Applied Interviews with autosave and deterministic evidence-cited evaluation, postings with locked question pools, idempotent applications, canonical audited pipeline transitions with list + Kanban UIs, reviewer scorecards, candidate timelines, and in-app notifications. See `implementation-plan.md` §0.1 for what is intentionally deferred (OIDC, PostgreSQL/RLS, resume parsing, technical sandbox, search/matching, messaging, automation). Epic statuses are tracked in §11; new decisions are in §16.

---

## 1. Phase Overview

| Phase | Goal |
|---|---|
| 0 | Discovery, decisions, and an executable foundation |
| 1 | Identity, tenancy, organization, and configurable workflow |
| 2 | Candidate profile and Profile Interview |
| 3 | Jobs, application flow, and Pipeline Kanban |
| 4 | Applied Interview and practical assessments |
| 5 | Matching, messaging, notifications, and automation |
| 6 | Analytics, governance, and production readiness |
| 7 | Domain-pack proof and expansion |

---

## 2. Phase 0 — Discovery, Decisions, and Executable Foundation

**Goal:** remove high-risk ambiguity and establish a deployable skeleton.

- [ ] Confirm the initial-delivery assumptions in §12.1 and record decisions in §13.
- [ ] Map employer/candidate journeys with representative users.
- [ ] Confirm privacy, data residency, retention, AI disclosure, and accessibility requirements.
- [x] Select backend/frontend/interview/AI runtime stack; database, queue/event, search, object storage, observability, and hosting decisions remain open.
- [ ] Define repository/module boundaries and environment strategy.
- [ ] Create design tokens and accessible component foundations (`design.md`).
- [ ] Define API conventions, errors, pagination, idempotency, and versioning (`architecture.md` §9).
- [ ] Define tenant isolation and threat model; automate isolation tests.
- [ ] Establish CI, migrations, seed data, feature flags, telemetry, and deployment skeleton.
- [ ] Build clickable low-fidelity prototypes for onboarding, Kanban, application timeline, interview curation, and automation builder.

**Exit criteria**
- [ ] Stakeholders approve core workflows and MVP boundaries.
- [ ] Architecture decisions and threat model are documented.
- [ ] Empty application deploys through all environments with health/telemetry checks.
- [ ] Prototype passes initial usability and keyboard-navigation review.

---

## 3. Phase 1 — Identity, Tenancy, Organization, and Configurable Workflow

**Goal:** create the secure platform control plane.

- [ ] Authentication, session management, account recovery, and MFA-ready design.
- [ ] Tenant/unit data model and tenant-scoped authorization middleware.
- [ ] Invitation, membership, role, and unit-scope management.
- [ ] Organization onboarding checklist and settings.
- [ ] Domain Pack manifest validation, activation, version pinning, and a test pack.
- [ ] Workflow template/stage/transition data model with version publishing.
- [ ] Workflow designer UI and candidate-facing stage mapping.
- [ ] Audit log and configuration history.

**Exit criteria**
- [ ] Automated tests prove users cannot read/write across tenant or unit scope.
- [ ] Administrator can publish a valid custom workflow and activate a pack.
- [ ] Invalid transitions/configurations are rejected consistently by UI and API.

---

## 4. Phase 2 — Candidate Profile and Profile Interview

**Goal:** create a trusted, reusable Skill Profile.

- [ ] Candidate onboarding, consent, privacy, accessibility, and notification preferences.
- [ ] Resume upload, scanning, parsing job, review/correction UI, structured profile.
- [ ] Credentials, skills, availability, domain selection, profile completeness.
- [ ] Profile Interview eligibility, cooldown, attempt cap, device check, and session recovery.
- [ ] Generic interview sequencing and pack-generated content.
- [ ] Non-technical scenario workspace first; technical sandbox adapter behind the same contract.
- [ ] Versioned evaluation, rubric evidence, result visibility, and human-review flagging.
- [ ] Candidate Skill Profile dashboard and attempt history.

**Exit criteria**
- [ ] Candidate completes onboarding and a Profile Interview end to end.
- [ ] Interrupted sessions recover without duplicate attempts or lost accepted responses.
- [ ] Education Pack content changes without engine code changes.
- [ ] Consent revocation is reflected in search and employer visibility within the defined SLA.

---

## 5. Phase 3 — Jobs, Application Flow, and Pipeline Kanban

**Goal:** support the core ATS loop with clear candidate position.

- [ ] Job creation wizard, drafts, collaborators, approvals, and publishing lifecycle.
- [ ] Candidate job discovery/detail, saved job, application preview, and submission.
- [ ] Application profile snapshot and duplicate/idempotent submission protection.
- [ ] Transition command service with requirements, approvals, audit, and events.
- [ ] Employer Kanban, list view, filters, saved views, drawer, bulk actions, keyboard move.
- [ ] Candidate-facing application timeline and status notifications.
- [ ] Rejection, withdrawal, job closure, retention, and disposition workflow.
- [ ] Attention queue, stage SLA, owner assignment, tasks, and basic activity feed.

**Exit criteria**
- [ ] Hiring team processes a candidate from Received to Hired or Rejected.
- [ ] Every move is authorized, validated, auditable, and reflected in both personas.
- [ ] Board remains usable and responsive at the agreed representative data volume.
- [ ] No internal-only status or note is exposed to candidates.

---

## 6. Phase 4 — Applied Interview and Practical Assessments

**Goal:** deliver the employer-owned, posting-specific assessment loop.

- [ ] JD/course outline ingestion and generation job status.
- [ ] Question-pool curation, competency coverage, preview, approval, locking, and versioning.
- [ ] Invitation, deadline, accommodations, device check, and reminders.
- [ ] Autosaving interview experience and explicit immutable submission.
- [ ] Technical sandbox isolation, limits, hidden tests, and result adapter.
- [ ] Scenario assessment rubric and evidence-backed evaluation.
- [ ] Reviewer scorecards, blind-review mode, panel summary, and disagreement handling.
- [ ] Organization-authorized technical reset with reason and audit.

**Exit criteria**
- [ ] All candidates on one posting receive the same locked pool/version.
- [ ] Technical and scenario paths return the same evaluation contract.
- [ ] Sandbox security tests and resource controls pass.
- [ ] AI score can never directly reject or advance a candidate without configured human action.

---

## 7. Phase 5 — Matching, Messaging, Notifications, and Automation

**Goal:** reduce repetitive coordination while preserving control.

- [ ] Search indexing pipeline with tenant, consent, freshness, and delete handling.
- [ ] Talent Discovery filters, explainable matches, comparison tray, and saved searches.
- [ ] Posting-triggered proactive matching with candidate preference controls.
- [ ] In-app/email templates, localization structure, delivery preference, deduplication, and retries.
- [ ] Candidate/job-linked messaging and communication audit.
- [ ] Automation schema/executor, delayed jobs, approval gates, and failure inbox.
- [ ] Visual automation builder, recipes, dry run, impact preview, versioning, and run history.
- [ ] Global/per-rule pause and operational dashboards.

**Exit criteria**
- [ ] Matching never returns a candidate outside tenant/consent constraints.
- [ ] Automation is deterministic, idempotent, inspectable, and safely pausable.
- [ ] Notification failure is visible and does not corrupt application state.
- [ ] Users can understand why a match or automation action occurred.

---

## 8. Phase 6 — Analytics, Governance, and Production Readiness

**Goal:** make the system measurable, supportable, fair, and releasable.

- [ ] Funnel, time-to-hire, time-in-stage, source, notification conversion, and workload metrics.
- [ ] Fairness monitoring with minimum sample thresholds and restricted access.
- [ ] Human-vs-AI disagreement and rubric calibration workflow.
- [ ] Data export/deletion, retention jobs, legal hold, and consent audit.
- [ ] Performance, capacity, backup/restore, disaster recovery, and failure-mode exercises.
- [ ] Security review, penetration testing, dependency/container scanning, and incident runbooks.
- [ ] Support tooling, feature-flag rollout, operator dashboards, and status communications.
- [ ] Pilot migration/seed plan, training, feedback intake, and go-live checklist.

**Exit criteria**
- [ ] SLOs, recovery objectives, alert ownership, and incident process are approved.
- [ ] Backup restoration and tenant data deletion are successfully rehearsed.
- [ ] Accessibility, privacy, security, and pilot acceptance gates pass.
- [ ] Production rollout has rollback criteria and named decision owners.

---

## 9. Phase 7 — Domain-Pack Proof and Expansion

**Goal:** prove that domain intelligence is truly swappable.

- [ ] Implement the Software Engineering Pack without modifying engine domain logic.
- [ ] Run the same contract, interview, sandbox, matching, and analytics suites.
- [ ] Log every required engine change as architecture debt and resolve boundary leaks.
- [ ] Implement the Business & Marketing Pack to stress the non-technical path.
- [ ] Define the pack authoring SDK, schema docs, validation CLI, fixtures, certification, signing, and compatibility policy.
- [ ] Decide whether/when external pack authorship is safe to open.

**Exit criteria**
- [ ] New packs install, validate, activate, and run through existing engine paths.
- [ ] Pack compatibility and rollback behavior are documented and tested.
- [ ] No pack can bypass tenant isolation, assessment limits, consent, or human-decision controls.

---

## 10. Suggested Sprint Sequence

Two-week sprints as a planning default only — adjust to team size and discovery results.

| Sprint | Intended outcome | Demonstrable increment |
|---|---|---|
| 0 | Decisions and foundation | Deployed shell, CI, contracts, clickable core prototype |
| 1 | Secure tenancy | Login, tenant/unit setup, invitations, isolation tests |
| 2 | Pack and workflow control | Activate Education Pack; publish a workflow |
| 3 | Candidate profile | Upload, parse, review, consent, Skill Profile shell |
| 4 | Profile Interview | Complete scenario attempt and see evidence-based result |
| 5 | Jobs and application | Publish a job and submit an application |
| 6 | Pipeline | Process cards in accessible Kanban/list and candidate timeline |
| 7 | Question curation | Generate, review, preview, approve, and lock a pool |
| 8 | Applied Interview | Submit scenario assessment; review human + AI scorecard |
| 9 | Technical sandbox | Complete isolated technical assessment through same contract |
| 10 | Notifications and search | Receive updates and find consenting talent |
| 11 | Matching and messaging | Explainable match notification and contextual conversation |
| 12 | Automation | Build, test, publish, observe, and pause a workflow rule |
| 13 | Analytics/governance | Trace funnel, inspect quality, run calibration workflow |
| 14 | Hardening/pilot | Security, accessibility, performance, restore, pilot exercise |

Each sprint review should demonstrate a cross-role user outcome, not only endpoints or isolated components.

---

## 11. Prioritized Epic Backlog

Split epics into sprint-sized stories only when the responsible team is ready to implement them.

| ID | Epic | Priority | Depends on | Status | Acceptance summary |
|---|---|---|---|---|---|
| FND-01 | Repository, CI/CD, environments | P0 | — | 🟡 | Repeatable tested deploy and rollback |
| SEC-01 | Authentication and sessions | P0 | FND-01 | 🟡 | Secure login/recovery; audited sessions (development-identity adapter in place; OIDC pending ADR-003) |
| TEN-01 | Tenant/unit isolation | P0 | SEC-01 | 🟢 | Automated cross-tenant denial suite |
| RBAC-01 | Roles and permissions | P0 | TEN-01 | 🟢 | API and UI enforce unit-scoped permissions |
| PACK-01 | Domain Pack Registry | P0 | TEN-01 | 🟢 | Versioned manifest validates and activates |
| FLOW-01 | Workflow model/designer | P0 | TEN-01 | 🟢 | Versioned stages/transitions publish safely |
| PROF-01 | Candidate profile/resume | P0 | TEN-01, PACK-01 | 🟡 | Structured profile and consent complete; resume upload/parsing pending |
| PINT-01 | Profile Interview | P0 | PROF-01, PACK-01 | 🟢 | Attempt lifecycle and score are complete |
| JOB-01 | Job authoring/publishing | P0 | FLOW-01, PACK-01 | 🟢 | Approved job pins pack/workflow versions |
| APP-01 | Candidate application | P0 | JOB-01, PROF-01 | 🟢 | Idempotent application with profile snapshot |
| PIPE-01 | Kanban/list pipeline | P0 | APP-01, FLOW-01 | 🟢 | Accessible validated candidate movement |
| AINT-01 | Applied Interview curation | P0 | JOB-01, PACK-01 | 🟢 | Same immutable locked pool per posting |
| SBOX-01 | Practical assessment runtime | P0 | AINT-01 | 🟡 | Scenario contract works; isolated technical runtime pending |
| EVAL-01 | Evaluation and scorecards | P0 | PINT-01, AINT-01 | 🟢 | Versioned evidence and human decision path |
| NOTIF-01 | In-app/email notifications | P1 | FND-01 | 🟡 | In-app outbox-backed notices work; preferences/email/retries pending |
| SEARCH-01 | Talent Discovery | P1 | PROF-01, TEN-01 | ⬜ | Consent/tenant-safe explainable results |
| MATCH-01 | Proactive matching | P1 | SEARCH-01, JOB-01 | ⬜ | Event-driven matching respects preferences |
| AUTO-01 | Automation executor/builder | P1 | FLOW-01, NOTIF-01 | ⬜ | Versioned dry-run rules with audit and pause |
| MSG-01 | Contextual messaging | P1 | APP-01, NOTIF-01 | ⬜ | Permission-safe job/candidate conversations |
| ANLY-01 | Hiring analytics | P1 | PIPE-01, MATCH-01 | ⬜ | Traceable scoped funnel and time metrics |
| GOV-01 | Fairness and calibration | P1 | EVAL-01, ANLY-01 | ⬜ | Restricted review workflow; no auto-reject |
| SDK-01 | Domain Pack authoring SDK | P2 | PACK-01, Phase 7 findings | ⬜ | External-quality validation and docs |

---

## 12. Definition of Ready / Done

### 12.1 Initial delivery assumptions — edit before Sprint 1

| Decision | Working assumption | Confirmed? |
|---|---|---:|
| Web client | Responsive browser application | ⬜ |
| Initial locale | English; localization-ready | ⬜ |
| Initial market | Pakistani academic hiring | ⬜ |
| Organization model | One tenant can contain multiple units/departments | ⬜ |
| Default pipeline | Received → Screened → Shortlisted → Applied Interview → Offer → Hired | ⬜ |
| Candidate visibility | Best or most recent Profile Interview result | ⬜ |
| Applied Interview | One locked attempt; org-authorized technical reset only | ⬜ |
| Human approval | Required for rejection, offer, and hire | ⬜ |
| MVP notification channels | In-app + email | ⬜ |
| MVP architecture | Modular services with clear boundaries; split only when justified | ⬜ |

### 12.2 Story ready checklist
- [ ] User/persona and business outcome are explicit.
- [ ] Acceptance criteria include success, empty, loading, error, denied, and concurrency states.
- [ ] Tenant, role, unit scope, consent, and audit implications are identified.
- [ ] API/event/schema contract is agreed or the story explicitly includes it.
- [ ] Design covers keyboard, screen reader, responsive behavior, and content text.
- [ ] Analytics and operational signals are specified.
- [ ] Dependencies, migration, feature flag, and rollback needs are known.
- [ ] Test data does not contain real candidate personal data.

### 12.3 Story done checklist
- [ ] Acceptance criteria pass with automated coverage at the appropriate level.
- [ ] Authorization and tenant isolation tests cover changed access paths.
- [ ] Accessibility checks and keyboard workflow pass.
- [ ] Loading/error/retry/empty states are implemented.
- [ ] Audit, logs, metrics, traces, and alerts avoid sensitive content.
- [ ] Database/event/API changes are backward compatible or have a rehearsed migration.
- [ ] Documentation, runbooks, and feature-flag instructions are updated.
- [ ] Product/design acceptance is recorded for visible behavior.
- [ ] Deployed behavior is verified in a non-production environment.

---

## 13. Validation Strategy

### 13.1 Automated test layers

| Layer | Required focus |
|---|---|
| Unit | Transition policies, scoring adapters, permissions, pack validation, automation conditions |
| Component | Board/card interactions, forms, timeline, drawers, rule nodes, accessibility semantics |
| Contract | API schemas, pack interface, event compatibility, sandbox/evaluation result contract |
| Integration | Database isolation, outbox/events, object storage, search synchronization, background retries |
| End-to-end | Candidate onboarding → interview; job → application → Kanban → interview → decision |
| Security | Tenant escape, IDOR, privilege escalation, upload abuse, sandbox breakout, secret leakage |
| Performance | Board/search scale, async generation throughput, notification bursts, sandbox quotas |
| Resilience | Worker restart, duplicate event, stale update, provider timeout, partial outage, restore |
| AI quality | Schema validity, evidence grounding, rubric consistency, drift, protected-attribute exclusion |

### 13.2 Required end-to-end scenarios
1. Candidate completes profile, Profile Interview, application, Applied Interview, and receives a decision.
2. Hiring manager creates, curates, locks, publishes, and closes a job.
3. Recruiter moves cards by pointer and keyboard, including required fields, stale conflict, undo, rejection, and bulk partial failure.
4. Two recruiters edit the same application and receive a safe conflict instead of losing data.
5. Organization changes a workflow while active jobs remain pinned to their original version.
6. Automation runs, skips, retries, fails visibly, and is paused without duplicate side effects.
7. Candidate revokes sharing consent and disappears from discovery without corrupting existing lawful records.
8. AI provider is unavailable; interview/application state remains recoverable and human fallback works.
9. User from Tenant A attempts every direct object route for Tenant B and is denied without existence leakage.
10. New Domain Pack completes contract tests without engine branching.

### 13.3 UX research checkpoints
- Prototype test before Phase 1: terminology, navigation, privacy comprehension.
- Phase 2 test: resume correction, interview readiness, score interpretation.
- Phase 3 test: Kanban scanability, candidate movement, timeline transparency.
- Phase 4 test: question curation, interview recovery, reviewer evidence comprehension.
- Phase 5 test: automation mental model, dry run, exception recovery.
- Pilot test: complete real-world hiring exercise with representative roles and accessibility users.

---

## 14. Non-Functional Release Gates

Exact numeric targets must be agreed during Phase 0 and recorded here.

| Area | MVP gate | Target / owner |
|---|---|---|
| Availability | SLO defined for core API, interview submission, and sandbox separately | TBD |
| Performance | p95 targets defined for navigation, API reads/writes, search, and board interaction | TBD |
| Scale | Representative candidates/job, active jobs/tenant, and concurrent interviews tested | TBD |
| Recovery | RPO/RTO defined; restore and queue replay rehearsed | TBD |
| Security | Threat model closed; critical/high findings resolved or formally accepted | TBD |
| Accessibility | WCAG 2.2 AA target; keyboard and screen-reader critical paths pass | TBD |
| Privacy | Consent, export, deletion, retention, subprocessors, and residency verified | TBD |
| AI quality | Rubric agreement, evidence grounding, and invalid-output thresholds defined | TBD |
| Fairness | Audit protocol, sample thresholds, access controls, and escalation owner defined | TBD |
| Operations | Dashboards, alerts, runbooks, support access, and incident ownership ready | TBD |

---

## 15. Risk Register

| ID | Risk | Probability | Impact | Mitigation | Trigger/indicator | Status |
|---|---|---:|---:|---|---|---|
| R-01 | Domain logic leaks into engine | Medium | High | Pack contract tests and architecture review | Domain-specific branch outside registry | Open |
| R-02 | AI evaluation is inconsistent | High | High | Evidence, calibration samples, versioning, human decision | Reviewer disagreement exceeds threshold | Open |
| R-03 | Cross-tenant data exposure | Low | Critical | Mandatory tenant context, policy tests, audit | Isolation test/security finding | Open |
| R-04 | Sandbox escape or resource abuse | Medium | Critical | Separate runtime, no network, quotas, security tests | Abnormal runtime/network/resource event | Open |
| R-05 | Automation causes duplicate or harmful action | Medium | High | Idempotency, dry run, approval gates, kill switch | Duplicate notification/action or loop | Open |
| R-06 | Candidate loses interview progress | Medium | High | Autosave, reconnect, durable submission, fallback | Save failure/session disconnect rate | Open |
| R-07 | Kanban becomes unusable at scale | Medium | Medium | Virtualization, filters, list view, performance budget | p95 interaction exceeds target | Open |
| R-08 | Privacy/retention requirements arrive late | Medium | High | Phase 0 legal discovery and configurable policies | Market/customer policy conflict | Open |

---

## 16. Decision Log

Add one row for every decision that affects scope, architecture, data, security, UX, or delivery order.

| Date | ID | Decision | Reason | Consequences | Owner | Status |
|---|---|---|---|---|---|---|
| 2026-07-15 | ADR-001 | Treat Pilot MVP as complete after delivery Phase 4 | The PRD release criteria require Applied Interviews, while delivery Phase 1 is only the control plane | MVP reporting uses milestone names from `implementation-plan.md` §1 | Product | Proposed |
| 2026-07-15 | ADR-002 | Use FastAPI/Python backend and Next.js/TypeScript frontend in separate `Backend/` and `Frontend/` folders | Explicit implementation direction and clear runtime ownership | Cross-runtime contracts are published through OpenAPI | Product / Engineering | Accepted |
| 2026-07-15 | ADR-011 | Use LiveKit for real-time interview rooms | Provides managed audio/video room infrastructure and browser components | Tokens must be short-lived, room-scoped, and issued only by the authenticated backend | Product / Engineering | Accepted |
| 2026-07-15 | ADR-012 | Use LangChain behind the AI application adapter | Supports structured AI generation and future automation chains without embedding provider calls in domain logic | Model provider, residency, and processing terms remain separate pending decisions | Product / Engineering | Accepted |
| 2026-07-17 | ADR-013 | Use SQLite with an explicit tenant-scoped store layer for the local pilot | Zero-infrastructure local development and testing while every query carries a `tenant_id` predicate | PostgreSQL + RLS (ADR-005) remains the production plan; the store layer is the migration seam | Engineering | Accepted |
| 2026-07-17 | ADR-014 | Use a deterministic rubric evaluator as the default interview scorer | Evaluation must be reproducible, evidence-cited, and available without an AI provider | LangChain generation/scoring remains optional behind the same contract; humans always make decisions | Engineering | Accepted |
| 2026-07-17 | ADR-015 | Ship the pilot with `X-Development-Identity` persona switching instead of OIDC | Authentication provider selection (ADR-003) is still open; the identity dependency is a single adapter | Production deployments refuse caller-chosen identity; OIDC must land before staging | Engineering | Accepted |
| 2026-07-17 | ADR-016 | Password + JWT access/refresh as interim auth (Bearer); opaque refresh hashed in DB | Needed for real multi-user login before OIDC; single identity adapter still centralizes auth | OIDC (ADR-003) remains the production identity target; development header is fallback only | Engineering | Accepted |

---

## 17. Immediate Next Actions

1. [ ] Review and edit the assumptions in §12.1 with product, engineering, design, security/privacy, and an Education-domain representative.
2. [ ] Assign an owner and target milestone to every P0 epic in §11.
3. [x] Record the selected FastAPI, Next.js, LiveKit, and LangChain choices in §16; complete the remaining infrastructure decisions.
4. [ ] Prototype and user-test the five highest-risk interactions: resume extraction review, candidate application timeline, Pipeline Kanban movement, interview pool curation, and automation dry run.
5. [ ] Define tenant isolation, audit, consent, and human-decision policies before creating production data models.
6. [ ] Turn Phase 0 and Phase 1 checklist items into estimated delivery stories.
7. [ ] Agree measurable release gates in §14; do not leave quality targets as implicit expectations.
8. [ ] Establish a weekly plan review: update status, dependencies, decisions, and risks in this document.
