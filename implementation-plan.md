# THOS — Build-Ready Implementation Plan

Version: 1.0 · July 2026  
Sources: `prd.md` · `phases.md` · `design.md` · `rules.md` · `architecture.md`

---

## 0. Purpose and Authority

This document converts the product requirements, architecture, delivery phases, UX system, and binding rules into the order in which the team will build THOS. It is the day-to-day execution plan, not a replacement for its source documents.

When documents differ, use this precedence:

1. `rules.md` — binding constraints.
2. `prd.md` — product intent and acceptance.
3. `architecture.md` — technical boundaries and feasibility.
4. `design.md` — interaction, accessibility, content, and visual system.
5. `phases.md` — delivery gates and program status.
6. `implementation-plan.md` — implementation sequence and work packages.

A conflict affecting scope, architecture, data, security, UX, or delivery order must be entered in `phases.md` §16 before implementation proceeds.

### 0.1 Planning status

Status markers: `⬜ Not started` · `🟡 In progress` · `🟢 Complete` · `🔴 Blocked` · `⚪ Deferred`

| Item | Status | Owner | Target |
|---|---|---|---|
| Plan review and approval | ⬜ | TBD | Before repository scaffold |
| Phase 0 decisions | 🟡 | TBD | Sprint 0 |
| Technical foundation | 🟢 | TBD | Sprint 0 |
| First vertical slice | 🟢 | TBD | Sprint 1 |
| Pilot MVP (local pilot form) | 🟡 | TBD | End of Phase 4 |

**July 2026 status.** A working local pilot covers the full hiring loop end to end: tenancy and roles, Education Pack activation, versioned workflows, candidate profiles/consent, Profile Interviews with deterministic evaluation, postings with locked question pools, idempotent applications, the canonical transition command with audit, Applied Interviews, reviewer scorecards, candidate timelines, notifications, and both persona UIs. Slices 1–11 are functionally complete in simplified pilot form. Deliberate simplifications pending production decisions: SQLite instead of PostgreSQL+RLS (ADR-005), development-identity header instead of OIDC (ADR-003), deterministic evaluator with optional LangChain generation, and no technical sandbox runtime (Slice 12), resume parsing, search, messaging, or automation yet.

---

## 1. Reconciled Delivery Interpretation

### 1.1 Milestone naming

`prd.md` §9 calls Phase 1 the MVP boundary, while `phases.md` defines Phase 1 as identity, tenancy, organization, packs, and workflow only. This plan uses these unambiguous milestones:

| Milestone | Included phases | Meaning |
|---|---|---|
| **Foundation** | Phase 0 | Deployable shell, decisions, contracts, prototypes |
| **Control Plane Alpha** | Phase 1 | Secure tenant, roles, pack activation, workflow publishing |
| **Candidate Alpha** | Phase 2 | Candidate profile and Profile Interview end to end |
| **ATS Alpha** | Phase 3 | Jobs, applications, canonical transitions, Kanban/list, timeline |
| **Pilot MVP** | Phases 0–4 | Full Education Pack hiring path including Applied Interview |
| **Operational Beta** | Phase 5 | Search, matching, messaging, notifications, automations |
| **Production Release** | Phase 6 | Governance, hardening, operations, and pilot acceptance |
| **Pack Portability Proof** | Phase 7 | Software Engineering and Business & Marketing packs |

The PRD’s MVP release criteria are therefore evaluated at **Pilot MVP**, after Phase 4. Record this interpretation as the first decision in `phases.md` §16 before work begins.

### 1.2 Sequencing clarifications

1. **Consent projection begins in Phase 2.** Build the consent-change event, visibility projection interface, and deletion hooks in Phase 2. The Phase 2 test uses an in-memory/database projection. OpenSearch implementation remains Phase 5.
2. **Job creation is split across Phases 3 and 4.** Phase 3 supports job drafts and publishable postings with a placeholder/manual assessment configuration. Phase 4 adds AI generation, curation, lock/version rules, and the full Applied Interview requirement. A posting requiring an Applied Interview cannot publish until its pool is locked.
3. **Notifications have a thin foundation before Phase 5.** In-app transactional notices required by Phases 2–4 use a simple outbox-backed notification adapter. Preferences, templates, email delivery, retries, and campaign-scale behavior arrive in Phase 5.
4. **Scenario assessments precede code execution.** The shared assessment contract and scenario workspace are built first. The network-isolated code runtime is introduced only after the contract is stable.
5. **Analytics instrumentation starts on day one.** Product analytics dashboards remain Phase 6, but privacy-safe operational events and audit records are emitted from the first mutation.

---

## 2. Proposed Technical Baseline

These choices are recommended defaults, not yet approved facts. Confirm or replace each in `phases.md` §16 during Sprint 0. Pin current stable versions when scaffolding; do not use unpinned `latest` dependencies in reproducible builds.

| Concern | Proposed choice | Reason |
|---|---|---|
| Repository | Separate `Backend/` and `Frontend/` applications in one repository | Clear runtime boundaries while keeping coordinated delivery simple |
| Web | Next.js App Router with React and TypeScript | Responsive employer/candidate app, route grouping, mature accessibility ecosystem |
| API | FastAPI on Python 3.13 | Typed async API, generated OpenAPI, dependency-based policy boundaries |
| Validation/contracts | Pydantic schemas as backend authority; generated OpenAPI client/types for frontend | Runtime validation and one published cross-runtime contract |
| Interviews | LiveKit with server-issued, room-scoped short-lived tokens | Managed real-time media without exposing signing credentials to browsers |
| AI orchestration | LangChain behind provider-neutral application adapters | Structured AI workflows without coupling domain services to one model provider |
| Database | PostgreSQL with explicit SQL migrations and row-level security | Transactional consistency and defense-in-depth tenant isolation |
| Query layer | SQLAlchemy 2 async + Alembic, with reviewed SQL for RLS policies | Mature Python persistence while preserving visible tenant-aware policies |
| Background work | Redis + Celery or ARQ; choose in ADR before async persistence work | Delays, retries, idempotent jobs, and Python worker compatibility |
| Durable events | PostgreSQL transactional outbox; Kafka-compatible broker introduced before Phase 5 scale | Reliable domain events now, independently scalable consumers later |
| Object storage | S3 API; MinIO locally | Signed URL contract and local parity |
| Authentication | OIDC provider behind a central auth adapter | Avoid custom credential/session security; provider remains replaceable |
| Search | OpenSearch in Phase 5 | Required faceting and full-text search, asynchronously projected |
| Graph | Defer Neo4j until Education ontology use cases prove graph queries are required | Avoid infrastructure without a measured Phase 1 query need |
| UI styling | CSS variables from `design.md` + accessible headless primitives | Enforces tokens while retaining interaction control |
| Testing | Vitest, Testing Library, Playwright, API integration tests with real PostgreSQL | Fast unit/component tests plus critical end-to-end coverage |
| Observability | OpenTelemetry traces/metrics/log correlation | Required correlation and async visibility across deployables |
| Local environment | Docker Compose for PostgreSQL, Redis, MinIO, mail capture, optional OpenSearch | Repeatable onboarding and CI integration |
| Deployment | Containerized web/API/workers; sandbox in a separate isolated environment | Matches modules-first architecture and mandatory sandbox isolation |

### 2.1 Required decisions before scaffold

- [ ] ADR-001 — approve Pilot MVP milestone after Phase 4.
- [x] ADR-002 — use FastAPI/Python for backend and Next.js/TypeScript for frontend.
- [ ] ADR-003 — choose OIDC provider and local-development strategy.
- [ ] ADR-004 — choose hosting region(s) and initial data-residency policy.
- [ ] ADR-005 — approve PostgreSQL RLS as tenant-isolation defense in depth.
- [ ] ADR-006 — approve outbox + Redis/BullMQ initially and define the broker migration trigger.
- [ ] ADR-007 — select managed or self-hosted sandbox strategy.
- [ ] ADR-008 — use LangChain as the AI orchestration abstraction; still approve model provider and data-processing terms.
- [x] ADR-011 — use LiveKit for real-time interview rooms with backend-issued tokens.
- [ ] ADR-009 — set the consent-removal SLA.
- [ ] ADR-010 — set initial availability, latency, scale, RPO, and RTO targets.

If a decision is not available in Sprint 0, hide the affected integration behind an adapter and use a deterministic local fake. Do not embed provider behavior in domain modules.

---

## 3. Repository and Module Layout

```text
/
├─ Backend/                        # FastAPI/Python application
│  ├─ app/
│  │  ├─ api/                      # HTTP routes and dependencies
│  │  ├─ core/                     # Configuration, errors, security, observability
│  │  ├─ domain/                   # Framework-independent policies/entities
│  │  ├─ repositories/             # Tenant-scoped persistence adapters
│  │  ├─ schemas/                  # Pydantic API/event/pack contracts
│  │  ├─ services/                 # LiveKit, LangChain, storage, notifications
│  │  └─ workers/                  # Interview and automation jobs
│  ├─ migrations/                  # Alembic migrations and RLS policies
│  └─ tests/                       # Unit, contract, integration, security tests
├─ Frontend/                       # Next.js/TypeScript application
│  ├─ app/                         # Employer/candidate routes and server proxies
│  ├─ components/                  # Shared named design-system components
│  ├─ lib/                         # Generated API client, queries, utilities
│  └─ tests/                       # Component and browser-facing tests
├─ domain-packs/
│  ├─ sdk/                         # Manifest schema, fixtures, compatibility tests
│  └─ education/                   # Education data/config; no engine mechanics
├─ infrastructure/
│  ├─ local/                       # Docker Compose and local bootstrap
│  └─ deployment/                  # Environment manifests/templates
└─ docs/                           # ADRs, threat models, API docs, runbooks
```

### 3.1 Dependency rules

- `Frontend/` depends only on the backend’s published OpenAPI contract, never backend implementation modules.
- Engine code never imports `domain-packs/education` directly. It consumes packs through the Registry contract.
- Shared UI components may use generated API types but never backend implementation or pack content.
- `Backend/app/domain` policy code must not depend on FastAPI, SQLAlchemy, HTTP, queues, LiveKit, LangChain, or UI code.
- Only repository adapters access tenant-owned tables; direct ad hoc SQL from controllers/workers is prohibited.
- The sandbox gateway may submit work and read normalized results; it cannot run untrusted code in the API process.
- Dependency-boundary checks run in CI.

---

## 4. Cross-Cutting Contracts Built First

These foundations prevent each feature team from inventing incompatible behavior.

### 4.1 Request context

Every API command/query receives an immutable context:

```ts
type RequestContext = {
  requestId: string;
  correlationId: string;
  actor: { type: 'user' | 'service'; id: string };
  tenantId: string;
  unitScopeIds: string[];
  permissions: string[];
};
```

Candidate self-service still uses a tenant-aware context. Cross-organization discovery must use a dedicated consent-aware query policy rather than omitting `tenantId`.

### 4.2 Standard command behavior

All mutations must provide:

- Idempotency key.
- Actor and tenant context.
- Schema-validated input.
- Authorization policy result.
- Transactional business mutation.
- Append-only audit record where required.
- Outbox event written in the same transaction.
- Stable error code and correlation ID.

### 4.3 Error contract

```json
{
  "error": {
    "code": "APPLICATION_STAGE_CONFLICT",
    "message": "This application is now in Shortlisted. Refresh it before advancing.",
    "field_errors": [],
    "current_resource": {},
    "correlation_id": "cor_123"
  }
}
```

Required categories: validation, unauthenticated, forbidden without existence leakage, not found, conflict/stale version, rate limited, dependency unavailable, and internal error with a safe actionable message.

### 4.4 Event envelope

```ts
type DomainEvent<T> = {
  eventId: string;
  eventName: string;
  eventVersion: number;
  occurredAt: string;
  tenantId: string;
  actor: { type: 'user' | 'service'; id: string };
  correlationId: string;
  resource: { type: string; id: string; version: number };
  payload: T;
};
```

Validate the envelope before writing to the outbox and again before a consumer handles it. No resume, transcript, recording, or free-text note belongs in the envelope.

### 4.5 Async job state

Every user-visible async operation stores:

- `id`, `tenant_id`, `type`, `resource_type`, `resource_id`.
- `state`: `queued | processing | completed | needs_attention | retrying | resolved | cancelled`.
- Attempt count, next retry, owner, safe error code, support reference.
- Created/started/completed timestamps and correlation ID.

The UI uses a shared `async-job-status` component and polite live-region announcements.

---

## 5. Initial Data Model and Migration Order

All tenant-owned tables include `tenant_id`, timestamps, and where mutable a `version` column. IDs are opaque and globally unique. Soft deletion is not a substitute for retention/deletion jobs.

### Migration group A — identity and tenancy

1. `users`
2. `organizations`
3. `units` with parent adjacency and cycle prevention
4. `memberships`
5. `roles`, `permissions`, `role_permissions`, `membership_roles`
6. `sessions` or provider-session references
7. `audit_records`
8. `idempotency_records`
9. `outbox_events`
10. `async_jobs`

### Migration group B — packs and workflows

1. `domain_pack_versions`
2. `organization_domain_packs`
3. `workflow_templates`
4. `workflow_versions`
5. `workflow_stages`
6. `workflow_transitions`
7. `workflow_transition_requirements`
8. `candidate_status_mappings`
9. `workflow_approvals`

### Migration group C — candidates and profiles

1. `candidates`
2. `candidate_consents`
3. `candidate_profiles`
4. `resume_files`
5. `resume_extraction_jobs`
6. `profile_credentials`, `profile_experiences`, `profile_skills`
7. `candidate_domain_targets`
8. `profile_interview_attempts`
9. `interview_sessions`, `interview_responses`
10. `assessment_submissions`
11. `evaluation_versions`, `evaluation_dimensions`, `evaluation_evidence`

### Migration group D — jobs and applications

1. `postings`
2. `posting_collaborators`
3. `posting_workflow_snapshots`
4. `question_pool_versions`, `questions`, `rubric_versions`
5. `applications`
6. `application_profile_snapshots`
7. `application_transitions`
8. `application_tasks`
9. `application_notes`
10. `applied_interview_attempts`
11. `reviewer_scorecards`
12. `offers`, `offer_approvals`

### Migration group E — operations

1. `notification_preferences`, `notifications`, `notification_deliveries`
2. `conversations`, `conversation_participants`, `messages`
3. `automation_rules`, `automation_versions`, `automation_runs`, `automation_node_runs`
4. `saved_searches`, `watchlists`
5. analytics projections and governance/calibration records

### 5.1 Tenant-isolation implementation

For every tenant-owned table:

1. Add non-null `tenant_id` and tenant-prefixed indexes/unique constraints.
2. Enable and force PostgreSQL row-level security.
3. Set tenant context transaction-locally from authenticated request/job context.
4. Deny table access to the application role when tenant context is absent.
5. Add integration tests for read, create, update, delete, aggregate, join, export, and background-job paths.
6. Test that forbidden and nonexistent cross-tenant resources do not leak distinguishable details.

The application must still include explicit tenant predicates. RLS is defense in depth, not the only check.

---

## 6. UI Foundation and Screen Build Order

### 6.1 Shared foundation

Build these before feature screens:

- [ ] Tokens from `design.md`: colors, typography, spacing, radius, elevation.
- [ ] Employer and candidate application shells.
- [ ] Fixed top-bar `pack-chip` position in both personas.
- [ ] Sidebar/navigation, tenant/unit switcher, breadcrumbs, contextual action area.
- [ ] `button`, `pill`, `score-badge`, `card`, `table`, `form-input`.
- [ ] `drawer`, `stepper`, `timeline`, `filter-bar`, `audit-log`.
- [ ] `progress-ring`, `async-job-status`, toast/undo, empty/error/denied states.
- [ ] Focus-visible styling, skip navigation, landmarks, live-region service.
- [ ] Storybook or equivalent component explorer with all required states.
- [ ] Automated accessibility checks for every primitive story.

### 6.2 Feature screen order

1. **Organization setup** — proves forms, tenant context, unit tree, permissions.
2. **Workflow designer** — proves versioned configuration and candidate mapping.
3. **Candidate profile** — proves uploads, async extraction, review/correction, consent.
4. **Profile Interview session** — proves autosave, reconnect, progress, practical workspace.
5. **Candidate Skill Profile** — proves score/evidence presentation and version history.
6. **Job wizard** — proves pinned pack/workflow selection and approval state.
7. **Candidate job/application flow** — proves snapshots and idempotent submission.
8. **Pipeline list view first** — establishes complete accessible operations.
9. **Pipeline Kanban over the same query/commands** — adds drag/drop and virtualization without creating a second behavior path.
10. **Candidate application timeline** — derives mapped state from canonical stage.
11. **Question-pool curation** — proves split pane, reorder keyboard equivalent, diff, lock.
12. **Applied Interview and reviewer scorecards**.
13. **Home attention queue** using real filtered operational data.
14. **Talent Discovery**, **Messages**, **Automations**, then **Analytics**.

### 6.3 Kanban implementation constraints

- The list and Kanban consume one pipeline query contract and one transition command.
- Build keyboard movement and transition forms with the list view before pointer drag.
- Drag only highlights server-declared valid destinations.
- A drop never bypasses required reason, artifact, approval, or permission checks.
- Optimistic updates are limited to reversible transitions; failures restore canonical state.
- Cards show `Stage N of M`, time in stage, score label, two evidence strengths, owner, and next action.
- Virtualization must preserve accessible names, focus recovery, and live movement announcements.
- Narrow viewports default to list/table; users can choose the list at any width.

---

## 7. Vertical Slices and Work Packages

Each slice must include UI, API, database, policy, audit/event, tests, async/error states, and documentation. Do not declare a slice done when only its endpoint or visual shell exists.

### Slice 0 — System heartbeat

**Outcome:** a developer can start the system, sign in through a fake/local OIDC identity, and see a traced authenticated request.

- [ ] Workspace, lint, formatting, type-check, test, build commands.
- [ ] Local PostgreSQL, Redis, MinIO, mail capture.
- [ ] Web/API/worker health and readiness endpoints.
- [ ] Typed environment validation and secret scanning.
- [ ] Correlation/request IDs and privacy-safe structured logging.
- [ ] CI checks and container builds.
- [ ] One-command local bootstrap with seeded synthetic data.

**Acceptance:** clean checkout → documented bootstrap → all services healthy → CI passes.

### Slice 1 — Create organization and unit

**Outcome:** an authenticated administrator creates an organization and department and sees the audit trail.

- [ ] Organization/unit schemas and cycle-safe unit tree.
- [ ] Central auth context and initial administrator policy.
- [ ] Tenant-scoped repositories and RLS.
- [ ] `ORGANIZATION_CREATED` outbox event.
- [ ] Setup stepper and unit-tree UI.
- [ ] Cross-tenant denial and audit integration tests.

**Acceptance:** two seeded tenants cannot discover or mutate each other through any route or direct ID.

### Slice 2 — Invite member and assign scoped role

**Outcome:** an administrator invites a hiring manager scoped to one unit.

- [ ] Membership/invitation lifecycle and expiration.
- [ ] Permission vocabulary and policy evaluator.
- [ ] Unit-scope inheritance rules.
- [ ] People/role UI and permission summary.
- [ ] Invitation notification adapter and safe retry state.
- [ ] Permission mutation audit.

### Slice 3 — Activate Education Pack

**Outcome:** an administrator validates and atomically activates a pinned Education Pack version.

- [ ] Domain Pack manifest JSON schema and semantic-version policy.
- [ ] Registry interface and database adapter.
- [ ] Minimal Education Pack fixture outside engine packages.
- [ ] Validation errors with exact manifest paths.
- [ ] Activation transaction and `DOMAIN_PACK_ACTIVATED` event.
- [ ] Persistent `pack-chip` reflects active context.
- [ ] Architecture test rejects engine imports of Education Pack.

### Slice 4 — Publish workflow version

**Outcome:** an administrator publishes the default six-stage workflow with four-state candidate mapping.

- [ ] Workflow/stage/transition schema and pure validation policy.
- [ ] Required approvals/reasons/artifacts model.
- [ ] Draft, validate, compare, publish, and version endpoints.
- [ ] Workflow designer and candidate-status mapping UI.
- [ ] Validation for unreachable state, invalid terminal path, and missing mapping.
- [ ] Immutable published version and audit/event records.

### Slice 5 — Candidate profile and consent

**Outcome:** a candidate creates a structured profile and explicitly controls discovery visibility.

- [ ] Candidate identity linkage and profile schema.
- [ ] Consent purpose/version/timestamp model.
- [ ] Resume signed upload, scanning adapter, extraction async job.
- [ ] Deterministic fake parser first; AI parser later through the same contract.
- [ ] Extraction review showing confidence and editable fields.
- [ ] `CANDIDATE_CREATED`, `PROFILE_UPDATED`, `CONSENT_CHANGED` events.
- [ ] Visibility projection interface and revocation SLA test.

### Slice 6 — Profile Interview scenario path

**Outcome:** a candidate completes and resumes a scenario Profile Interview and sees a versioned result.

- [ ] Eligibility, attempt cap, cooldown, randomized pack content.
- [ ] Session idempotency, autosave, accepted-response versioning, reconnect.
- [ ] Scenario practical workspace.
- [ ] Explicit submit command and immutable submitted payload.
- [ ] Schema-validated deterministic evaluator before external AI integration.
- [ ] Versioned score, dimensions, evidence citations, strengths/gaps.
- [ ] Skill Profile UI, visibility selection, appeal/human-review entry point.

### Slice 7 — Job and application

**Outcome:** a hiring manager creates a job pinned to pack/workflow versions and a candidate applies once.

- [ ] Job draft, collaborator, approval, and publish lifecycle.
- [ ] Structured requirements and safe JD upload/text.
- [ ] Pack/workflow snapshot at job creation.
- [ ] Candidate job detail including process and data-sharing scope.
- [ ] Profile snapshot and job-specific answers.
- [ ] Idempotent application command and `APPLICATION_CREATED` event.

### Slice 8 — Canonical pipeline transition

**Outcome:** a recruiter advances an application through validated stages using the accessible list.

- [ ] Pipeline query with filters, pagination, valid destinations, SLA, and next action.
- [ ] Single transition command exactly matching `architecture.md` §9.
- [ ] Optimistic concurrency and exact conflict response.
- [ ] Requirement/approval/reason evaluation.
- [ ] Application transition + audit + outbox in one transaction.
- [ ] Accessible list/table, candidate drawer, transition sheet, activity timeline.
- [ ] Undo for allowed reverse transition using a new audited command.

### Slice 9 — Kanban and candidate timeline

**Outcome:** recruiters use Kanban without losing list parity, while candidates see only four mapped statuses.

- [ ] Kanban columns/cards over Slice 8 contracts.
- [ ] Pointer drag, keyboard move, valid/invalid destination states.
- [ ] Horizontal/vertical virtualization at agreed test volume.
- [ ] Saved views storing query definition, not candidate IDs.
- [ ] Candidate timeline derived at read time from canonical stage mapping.
- [ ] Security tests proving internal stages/notes are absent from candidate responses.

### Slice 10 — Applied Interview pool

**Outcome:** a manager generates, curates, previews, approves, diffs, and locks one immutable pool.

- [ ] Generation async job and pack generator interface.
- [ ] Question/rubric structured schemas and competency coverage.
- [ ] Split-pane curation, edit/regenerate/reorder/remove/restore.
- [ ] Keyboard question reorder with identical behavior.
- [ ] Approval, final diff, version lock, and `QUESTION_POOL_LOCKED` event.
- [ ] Completed attempts remain pinned to exact question/rubric versions.

### Slice 11 — Applied Interview scenario and review

**Outcome:** an invited candidate submits once; human reviewers decide using evidence-backed scorecards.

- [ ] Invitation/deadline/accommodations/device-check lifecycle.
- [ ] Same locked pool for every posting application.
- [ ] Autosave/reconnect and immutable explicit submission.
- [ ] Evaluation version, evidence, limitation, and integrity flags.
- [ ] Reviewer scorecard, blind-review option, panel summary.
- [ ] Reasoned organization-only technical reset.
- [ ] Human actor required for reject, offer, and hire transitions.

### Slice 12 — Technical assessment runtime

**Outcome:** technical tasks return the same normalized assessment contract from an isolated runtime.

- [ ] Sandbox gateway contract and signed task package.
- [ ] Separate network-isolated runtime with CPU/memory/time/process limits.
- [ ] Language image allowlist, hidden tests, output truncation, cleanup.
- [ ] No tenant secrets or internal network route available to code.
- [ ] Correctness plus code-quality adapter into common evaluation schema.
- [ ] Abuse, escape, timeout, fork-bomb, oversized-output, and replay tests.

Completion of Slice 12 and all Phase 0–4 release gates produces the **Pilot MVP**.

### Slice 13 — Notification and messaging platform

- [ ] Preference-aware in-app/email templates and localization keys.
- [ ] Delivery deduplication, retry, bounce/failure, and exception inbox.
- [ ] Candidate/job-linked conversations with tenant and participant authorization.
- [ ] Communication audit without message contents in telemetry.

### Slice 14 — Search and matching

- [ ] Consent-safe search projection and deletion propagation.
- [ ] OpenSearch mappings, reindex strategy, freshness monitoring.
- [ ] Facets, ontology chips, evidence-aware result explanation.
- [ ] Comparison tray and saved search/watchlist.
- [ ] `POSTING_PUBLISHED` matching consumer with throttled notifications.
- [ ] Controlled conversion feedback; no automatic weight updates without evaluation/versioning.

### Slice 15 — Automation

- [ ] Versioned rule/node schema and deterministic evaluator.
- [ ] Trigger, condition, action, wait, approval, fallback nodes.
- [ ] Idempotent node execution and side-effect ledger.
- [ ] Loop/rate/duplicate guards and mandatory stop conditions.
- [ ] Vertical DOM-ordered builder, recipes, dry run, impact preview.
- [ ] Run history, exception inbox, per-rule pause, global kill switch.

### Slice 16 — Analytics and governance

- [ ] Read models for funnel, time, source, workload, and conversion.
- [ ] Every metric links to a filtered source-record view.
- [ ] Rubric agreement and recalibration workflow.
- [ ] Fairness minimum-sample enforcement and restricted access.
- [ ] Candidate appeal workflow with bounded response SLA.
- [ ] Retention, export, deletion, legal hold, and derived-store erasure.

---

## 8. API Delivery Order

Do not build the entire illustrative API before a vertical slice needs it. Add endpoints in this order:

### Foundation and control plane

```text
GET    /health/live
GET    /health/ready
GET    /me
POST   /organizations
GET    /organizations/{organizationId}
POST   /organizations/{organizationId}/units
POST   /organizations/{organizationId}/invitations
PUT    /memberships/{membershipId}/roles
POST   /organizations/{organizationId}/domain-packs/activations
POST   /workflow-templates
POST   /workflow-templates/{id}/versions
POST   /workflow-versions/{id}/publish
```

### Candidate and Profile Interview

```text
POST   /candidates
GET    /candidates/me/profile
PATCH  /candidates/me/profile
POST   /candidates/me/resume-upload-requests
POST   /candidates/me/resume-extractions
PUT    /candidates/me/consents/{purpose}
POST   /candidates/me/profile-interview-attempts
PATCH  /profile-interview-attempts/{id}/responses/{responseId}
POST   /profile-interview-attempts/{id}/submit
GET    /profile-interview-attempts/{id}/evaluation
```

### Jobs and ATS

```text
POST   /postings
PATCH  /postings/{id}
POST   /postings/{id}/publish
GET    /postings
GET    /postings/{id}
POST   /applications
GET    /pipeline
GET    /applications/{id}
POST   /applications/{id}/transitions
POST   /application-transitions/{id}/undo
GET    /candidates/me/applications
```

### Applied Interview

```text
POST   /postings/{id}/question-pool-generations
GET    /postings/{id}/question-pool
PATCH  /postings/{id}/question-pool
POST   /postings/{id}/question-pool/approve
POST   /postings/{id}/question-pool/lock
POST   /applications/{id}/applied-interview-invitations
PATCH  /applied-interview-attempts/{id}/responses/{responseId}
POST   /applied-interview-attempts/{id}/submit
GET    /applications/{id}/evaluation
POST   /applied-interview-attempts/{id}/reset-authorizations
POST   /applications/{id}/scorecards
```

Every mutation endpoint requires the idempotency header/field defined by the API convention. OpenAPI output and generated client types are CI artifacts.

---

## 9. Testing Plan by Build Stage

### 9.1 Required on every pull request

- Formatting, lint, type-check, dependency-boundary check.
- Changed-package unit and component tests.
- API/pack/event schema compatibility.
- Database migration validation from empty and prior schema.
- Tenant/authorization tests for changed access paths.
- Automated accessibility checks for changed UI components/screens.
- Secret, dependency, and container scanning as available.

### 9.2 Required before merging a vertical slice

- Happy path plus loading, empty, validation, denied, stale/conflict, dependency failure, retry, and no-permission states.
- Audit record and event envelope assertions.
- Idempotent retry test for every mutation.
- No-personal-data logging/telemetry assertion.
- Keyboard-only completion of the slice’s critical UI path.
- Browser-level test proving the user outcome.

### 9.3 Required release suites

| Milestone | Required suites |
|---|---|
| Control Plane Alpha | Cross-tenant matrix, RBAC/unit scope, workflow/pack contract |
| Candidate Alpha | Upload security, consent propagation, reconnect/idempotency, evaluation versioning |
| ATS Alpha | Transition policy/concurrency, list/Kanban parity, candidate data leakage |
| Pilot MVP | Full candidate + employer E2E, AI fallback, pool immutability, sandbox security, WCAG critical paths |
| Operational Beta | Search consent/deletion, notification burst, automation replay/kill switch |
| Production Release | Performance, penetration, backup/restore, DR, deletion/export, fairness governance |
| Portability Proof | Existing unmodified pack, interview, sandbox, matching, and analytics contract suites |

---

## 10. Security, Privacy, and AI Workstream

This workstream runs alongside every slice and cannot be deferred to Phase 6.

### 10.1 Threat-model increments

1. Authentication/session and invitation abuse.
2. Tenant and unit isolation, direct-object access, exports.
3. Resume/file upload and object-storage access.
4. Prompt injection and malicious resume/transcript content.
5. Interview impersonation, autosave replay, answer tampering.
6. Pipeline privilege escalation and stale transitions.
7. Sandbox escape and resource exhaustion.
8. Search-index leakage and consent deletion lag.
9. Automation loops and unauthorized consequential actions.
10. Analytics re-identification and small-sample fairness exposure.

### 10.2 AI adapter contract

All model operations pass through one provider-neutral adapter with:

- Operation type and schema version.
- Minimum required, redacted input only.
- Prompt template, model, pack, rubric, and policy versions.
- Structured response schema.
- Timeout, retry, cost/token budget, and cancellation.
- Evidence segment IDs rather than invented prose sources.
- Safety classification and human-fallback reason.
- Trace metadata that contains no personal text.

Development and tests use deterministic fakes. External AI is enabled behind a feature flag only after data-processing and retention terms are approved.

---

## 11. Delivery Workflow

### 11.1 Planning cadence

- Weekly: update `phases.md` statuses, risk register, decisions, and release gates.
- Sprint planning: select complete vertical outcomes, not disconnected frontend/backend tickets.
- Daily: track blockers by work package and decision ID.
- Sprint review: demonstrate a cross-role user outcome with synthetic data.
- Retrospective: record process changes; architectural changes require an ADR.

### 11.2 Branch and review expectations

- Keep changes small enough to review and deploy behind tenant-aware feature flags.
- Schema changes use expand/migrate/contract when backward compatibility is needed.
- At least one reviewer checks product/rules compliance; security-sensitive changes require a security owner.
- Generated artifacts are reproducible and clearly separated from source contracts.
- No code is considered complete while diagnostics, tests, or migrations introduced by that code fail.

### 11.3 Feature flag lifecycle

Every flag records owner, purpose, tenant scope, default, created date, removal condition, and safe disabled behavior. Flags cannot bypass authorization, tenant isolation, audit, or human-decision rules.

---

## 12. Sprint 0 — Exact Starting Backlog

**Sprint goal:** create a secure, observable, testable shell and approve the decisions needed for the first organization vertical slice.

### Track A — Product and architecture decisions

- [ ] `S0-A1` Add ADR-001 through ADR-010 proposals to `phases.md` §16.
- [ ] `S0-A2` Confirm Pilot MVP scope and explicit non-goals.
- [ ] `S0-A3` Define role/permission vocabulary for administrator, hiring manager, HR, reviewer, and candidate.
- [ ] `S0-A4` Define tenant/unit inheritance and candidate self-service context.
- [ ] `S0-A5` Set measurable Phase 0 release gates.
- [ ] `S0-A6` Complete initial tenant, upload, AI, and sandbox threat-model outline.

### Track B — Repository foundation

- [x] `S0-B1` Scaffold separate backend and frontend application roots.
- [x] `S0-B2` Scaffold Next.js web and FastAPI API with health checks; dedicated worker processes remain pending.
- [ ] `S0-B3` Add backend `domain`, `database`, `auth`, `observability`, and `test-kit` modules as their first slices require; initial API schemas, services, config, and frontend UI modules exist.
- [ ] `S0-B4` Add dependency-boundary rules.
- [ ] `S0-B5` Add Docker Compose for PostgreSQL, Redis, MinIO, and local mail capture.
- [ ] `S0-B6` Add typed environment validation and `.env.example` without secrets.

### Track C — Quality and delivery

- [ ] `S0-C1` CI for install, format check, lint, type-check, unit test, build, and migration validation.
- [ ] `S0-C2` Test-report and coverage artifacts without setting misleading global coverage targets before code exists.
- [ ] `S0-C3` Secret and dependency scanning.
- [ ] `S0-C4` Container builds and non-production deployment skeleton.
- [ ] `S0-C5` Synthetic seed-data conventions and factories.

### Track D — Contracts and observability

- [ ] `S0-D1` Request context and standardized errors.
- [ ] `S0-D2` Idempotency record and command middleware contract.
- [ ] `S0-D3` Audit record and event envelope schemas.
- [ ] `S0-D4` Transactional outbox foundation and one no-op test consumer.
- [ ] `S0-D5` Correlation IDs across HTTP, database transaction, outbox, and worker.
- [ ] `S0-D6` Privacy-safe logger with prohibited-field tests.

### Track E — Design foundation

- [x] `S0-E1` Implement the initial design tokens from `design.md`.
- [x] `S0-E2` Load Poppins and Liberation font families with resilient fallbacks.
- [x] `S0-E3` Implement application shell, landmarks, skip link, focus system, and responsive navigation.
- [ ] `S0-E4` Complete initial component stories; `button`, `pill`, `card`, `table`, `attention-queue-card`, and `pack-chip` implementations exist.
- [ ] `S0-E5` Expand component accessibility automation and keyboard checks; smoke tests exist.
- [ ] `S0-E6` Prototype organization setup and Pipeline list/Kanban interactions.

### Sprint 0 exit criteria

- [ ] All blocking ADRs are approved or have adapter-backed temporary decisions with owners/dates.
- [ ] A clean checkout starts locally through documented commands.
- [ ] Web, API, and workers deploy to a non-production environment and expose health/telemetry.
- [ ] CI prevents formatting, typing, test, migration, boundary, and secret failures.
- [ ] Request context, error, audit, event, and idempotency contracts are tested.
- [ ] Initial components pass automated accessibility checks and manual keyboard review.
- [ ] Sprint 1 organization/unit stories meet the Definition of Ready.

---

## 13. Sprint 1 — First Production-Shaped Vertical Slice

**Sprint goal:** an authenticated administrator creates an organization and unit in a tenant-isolated system and inspects the resulting audit activity.

### Planned stories

1. `S1-01` Integrate the selected OIDC provider through the centralized auth adapter.
2. `S1-02` Create `users`, `organizations`, `units`, `memberships`, `audit_records`, `idempotency_records`, and `outbox_events` migrations.
3. `S1-03` Add application DB role, transaction-local tenant context, and forced RLS policies.
4. `S1-04` Implement organization creation command with idempotency, audit, and `ORGANIZATION_CREATED` event.
5. `S1-05` Implement unit creation and tree query with cycle prevention and unit-scoped policy checks.
6. `S1-06` Build the organization setup stepper and unit-tree screen from shared primitives.
7. `S1-07` Build an audit timeline showing configuration changes without sensitive payloads.
8. `S1-08` Add cross-tenant denial matrix, stale/retry, browser E2E, and keyboard/accessibility tests.
9. `S1-09` Add synthetic Tenant A/Tenant B seeds and developer test personas.
10. `S1-10` Deploy behind an administrator-only feature flag and verify in non-production.

### Sprint 1 demonstration

- Sign in as Tenant A administrator.
- Create an organization and two-level department tree.
- See the setup progress and append-only audit timeline.
- Retry the create command without duplicating data or events.
- Attempt access using Tenant B and receive a nondisclosing denial.
- Complete the flow by keyboard at desktop and narrow viewport widths.

---

## 14. Definition of Build Readiness

Development may start when all of the following are true:

- [ ] This plan and the milestone interpretation are approved.
- [ ] Owners are assigned for product, architecture, frontend, backend, security/privacy, design/accessibility, and delivery.
- [ ] ADR-001 through ADR-010 have a decision or a bounded temporary adapter strategy.
- [ ] Sprint 0 has estimates and named assignees.
- [ ] The team agrees that `rules.md` is enforced in review and CI where automatable.
- [ ] No real candidate data will be used in development, test, demos, or logs.

Once those checks are complete, begin with **Sprint 0 Track A and Track B in parallel**, followed immediately by Tracks C–E as the workspace becomes available. The first application behavior to implement is **Slice 1: Create organization and unit**; do not start with AI generation, Kanban drag-and-drop, search, or sandbox execution before the foundational contracts and tenant isolation exist.
