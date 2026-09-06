# THOS — Architecture Document

Version: 1.0 · July 2026
Companion documents: `prd.md` (requirements) · `rules.md` (binding constraints) · `phases.md` (delivery gates) · `design.md` (UX/UI system) · `implementation-plan.md` (build sequence)

---

## 1. Architectural Principles

1. **Two strict layers.** The Universal Hiring Engine never contains domain knowledge. Domain Intelligence Packs never implement engine mechanics (auth, persistence, tenancy, scheduling). If a change requires touching both to add a new industry, that is an architecture violation — log it as debt and fix the boundary, don't ship around it.
2. **Configuration over branching.** Domain behavior is data loaded from an active pack via the Domain Pack Registry, never an `if (domain === "...")` branch inside an engine service.
3. **Modules first, distributed system second.** Start with independently owned modules and strict contracts within a small number of deployables; split into separately scaled services only when reliability, security, or load specifically requires it (see §14).
4. **Human authority over AI output.** Every consequential decision (reject, hire, offer) requires a human actor of record. AI produces scores, evidence, and recommendations — never a final state change on its own.
5. **One canonical state, many views.** An application's stage lives in exactly one place; every UI (Kanban, candidate timeline, analytics) derives its label from that single source (§11).
6. **Everything async is visible.** No operation is allowed to fail or complete silently; see the exception-state model in §11.3.

---

## 2. System Context

```
                 ┌─────────────────────────────────────────────┐
                 │              Web Application                │
                 │   Employer routes  │  Candidate routes       │
                 └───────────────┬───────────────┬──────────────┘
                                  │               │
                         ┌────────▼───────────────▼────────┐
                         │            Core API              │
                         │ auth · tenancy · orgs · profiles  │
                         │ jobs · applications · transitions │
                         └───┬───────┬─────────┬────────┬───┘
                             │       │         │        │
                 ┌───────────▼─┐ ┌──▼───────┐ ┌▼──────┐ ┌▼─────────────┐
                 │ Domain Pack │ │ Interview │ │Sandbox │ │ Automation / │
                 │  Registry   │ │Orchestr.  │ │Runtime │ │ Notification │
                 └─────────────┘ └───────────┘ └────────┘ └──────────────┘
                             │
                 ┌───────────▼───────────────────────────────┐
                 │  Matching · Search · Analytics · Messaging  │
                 └──────────────────────────────────────────────┘
```

External systems (later phases): org-side ATS/HRMS via webhook/API, email/SMS providers, object storage, AI model provider(s).

---

## 3. Microservice / Module Breakdown

| Service | Responsibility | Notes |
|---|---|---|
| **Authentication Service** | Identity, RBAC, tenant isolation, sessions, MFA-ready | JWT/OAuth2; tenant_id scoped on every token |
| **Organization Management Service** | Units, departments/campuses, business units, configuration | Tree structure per org; role/unit-scope assignment |
| **Profile Management Service** | Candidate/member profiles, verification, credentials, Skill Score history | Owns consent and visibility controls |
| **ATS Service** | Postings, pipeline stages, applications, transition command handling | Owns the canonical application state (§11) |
| **Domain Pack Registry** | Loads, versions, validates, and serves the active pack's ontology/graph/generators/rubrics | The plugin boundary — see §5 |
| **Two-Stage Interview Orchestration Service** | Generic session mechanics for Profile & Applied Interviews: sequencing, timing, follow-ups, recording | Domain-agnostic; uses LiveKit for real-time media and calls the active pack for content only |
| **Practical Assessment Sandbox Service** | Isolated multi-language code execution + structured scenario workspace | Network-restricted; never colocated with Core API |
| **Proactive Matching & Notification Service** | Event-driven; compares new postings against the candidate pool, dispatches notifications | Consumes/produces on the event bus |
| **Messaging Service** | Internal chat tied to job/candidate records | — |
| **Analytics Service** | Time-to-hire, pipeline conversion, notification funnel, fairness monitoring | Read-optimized, derived from the event stream |
| **Search Service** | Talent Discovery Engine — filter by expertise, qualification, Skill Score, availability | Tenant- and consent-filtered index |
| **Automation/Notification Worker** | Event consumption, delayed jobs, templates, retries, the automation rule executor | Idempotent by design (§9) |

### 3.1 Recommended data infrastructure
- **PostgreSQL** — transactional data (orgs, users, applications, ATS state)
- **OpenSearch** — full-text and faceted search (Talent Discovery)
- **Neo4j** (or equivalent) — domain knowledge graphs, talent-network relationships
- **Docker-based sandbox runtime** (Judge0-style) — isolated code execution
- **Kafka** (or managed equivalent) — event bus for matching, automation, analytics
- **S3-compatible object storage** — resumes, transcripts, interview recordings, with signed short-lived URLs

---

## 4. Core Data Entities

```
Organization
 ├─ id, name, type (university | company), verification_status
 ├─ units[]                 (campuses / departments / business units)
 ├─ domain_packs[]           (active pack ids + pinned versions)
 └─ hiring_workflow_config   (stage order, thresholds, required docs, approvals)

Candidate
 ├─ id, profile, resume_raw, resume_parsed, consent_settings
 ├─ target_domains[]
 ├─ profile_interviews[]     → ProfileInterviewAttempt[]
 └─ applications[]           → Application

Posting (Job / Requisition)
 ├─ id, org_id, unit_id, domain_pack_id, workflow_version (pinned)
 ├─ job_description_raw / course_outline_raw
 ├─ applied_interview_question_pool   (AI-generated, org-curated, versioned)
 ├─ custom_closing_questions[]
 └─ pipeline_stage_config

Application
 ├─ candidate_id, posting_id, stage (canonical — see §11), stage_version
 ├─ cv_match_score
 ├─ profile_interview_score_snapshot
 └─ applied_interview_attempt   (exactly one, immutable once submitted)

ProfileInterviewAttempt
 ├─ id, candidate_id, domain_pack_id, attempt_number
 ├─ transcript, practical_task_submission
 ├─ skill_score, rubric_breakdown, strengths_gaps_summary
 └─ visibility (best | most_recent | all — org-configurable default: best/most-recent)

DomainPack (manifest — see §5)
```

---

## 5. Domain Pack Contract (Plugin Interface)

Every pack implements the same interface so the engine never needs to branch on which pack is active.

```json
{
  "pack_id": "education-v1",
  "pack_version": "1.2.0",
  "ontology": { "skills": [...], "certifications": [...], "concepts": [...] },
  "knowledge_graph": "neo4j://graph/education-v1",
  "resume_extraction_rules": { "signals": ["publications", "hec_rank", "teaching_experience"] },
  "matching_weights": { "cv_match": 0.4, "profile_interview_score": 0.6 },
  "profile_interview_generator": { "endpoint": "...", "task_style": "scenario" },
  "applied_interview_generator": { "endpoint": "...", "task_style": "scenario" },
  "evaluation_rubric": { "dimensions": ["structure", "reasoning", "domain_correctness"] },
  "compliance_rules": ["HEC_alignment"]
}
```

- `task_style: "code"` → routes the practical task to the Sandbox's compiler/IDE path, graded against hidden test cases plus AI code-quality review.
- `task_style: "scenario"` → routes to the structured written/recorded workspace, graded against the pack's rubric dimensions.
- **Versioning:** packs are semantically versioned; an org pins a version on activation; a posting pins the pack version active at creation time so mid-flight postings are never silently changed underneath applicants.
- **Validation:** the Registry validates a manifest against a published schema before activation; an invalid manifest is rejected atomically, never partially applied.
- **Adding a new industry** = authoring a manifest + registering it. No engine service should require a code change — this is the claim Phase 7 exists to test (`phases.md`).

---

## 6. Two-Stage Interview Architecture

### 6.1 Profile Interview (candidate-owned)
State: `Not started → In progress → Submitted → Evaluated`. Retakeable subject to a cooldown window and attempt cap; each attempt draws a randomized question/task subset within the domain. Interruption must resume without creating a duplicate attempt or losing accepted responses.

### 6.2 Applied Interview (employer-owned) — posting-level state machine
```
1. POSTED           → pack generates large AI question pool + practical task from JD/course outline
2. CURATED          → org reviews pool: remove / edit / reorder / add
3. CUSTOM_APPENDED  → org attaches ≥0 custom closing questions
4. LOCKED           → pool frozen; every applicant to this posting draws from the same locked set
5. ATTEMPTED        → candidate applies → one attempt only, immutable on submit
6. EVALUATED        → AI produces evaluation summary → human reviewer records the decision
```
Constraint: no candidate-initiated retake. A redo can only be triggered by the hiring org (e.g. technical failure), logged as an explicit, reasoned override.

### 6.3 Practical Assessment Sandbox
- **Technical path:** embedded multi-language compiler/IDE → run against hidden test cases → correctness score + AI code-quality/edge-case review.
- **Non-technical path:** structured written/recorded workspace → AI grades against pack rubric dimensions.
- Both paths report into the same evaluation-rubric interface so the orchestrator never needs to know which path ran.
- **Isolation:** separate runtime, no network access from inside the sandbox, resource quotas, and security tests as a release gate (`phases.md` Phase 4 exit criteria).

---

## 7. Matching & Notification Architecture

Event-driven: `POSTING_PUBLISHED` triggers evaluation against every eligible candidate (tenant- and consent-scoped) whose resume + Profile Interview results fall within that domain; matches produce an explainable notification (which required/preferred criteria matched, from which evidence). Candidate notification preferences and employer "watch" triggers are first-class filters, not afterthoughts. Notification-to-application and application-to-hire conversion feed back into `matching_weights` per pack as a controlled, evaluated update — not an uncontrolled feedback loop.

---

## 8. Automation Engine Architecture

Rule schema: trigger node → condition group (AND/OR) → action node(s) → optional delay/wait → optional human-approval node → end/fallback node. Execution is:
- **Idempotent** — safe to re-run without duplicate side effects.
- **Versioned** — draft/published; active applications continue on the version they started under.
- **Dry-run capable** — "test with sample candidate" executes with no side effects.
- **Bounded** — loop detection, duplicate-notification suppression, rate limits, mandatory stop conditions.
- **Consequential-safe by default** — templates that would reject/hire/move-stage default to creating a human task instead of acting directly.
- **Observable** — every node run logs input, result, duration, actor, retry state; a global pause and per-rule kill switch are always available to administrators.

---

## 9. API & Event Conventions

- REST-ish engine surface; domain-specific content is always fetched indirectly through the active pack, never embedded in engine endpoints.
- **Idempotency keys** required on application, submission, transition, invitation, and notification commands.
- **Pagination** and **error shape** are standardized once, engine-wide (define exact contract in Phase 0).
- **Contract testing** on the pack interface, event schemas, and the sandbox/evaluation result contract — a pack or sandbox change that breaks contract tests blocks release.

### Illustrative surface (engine-layer only)
```
POST   /orgs                                   POST   /candidates
POST   /orgs/{id}/units                        POST   /candidates/{id}/profile-interviews
POST   /orgs/{id}/domain-packs                 GET    /candidates/{id}/skill-scores

POST   /postings                               POST   /applications
GET    /postings/{id}/question-pool            POST   /applications/{id}/applied-interview
PATCH  /postings/{id}/question-pool            GET    /applications/{id}/evaluation
POST   /postings/{id}/question-pool/lock

GET    /talent-search                          GET    /analytics/pipeline
```

### Transition command contract (all stage changes use this one path)
```json
{
  "application_id": "app_123",
  "from_stage_version": 14,
  "to_stage_id": "shortlisted",
  "reason_code": "meets_requirements",
  "note": "Optional reviewer context",
  "required_artifact_ids": [],
  "idempotency_key": "client-generated-id"
}
```
The response returns the canonical application, the transition/audit record, any newly required tasks, and triggered automation references. A version mismatch returns a conflict with current state for safe UI recovery — never a silent overwrite.

---

## 10. Required Domain Events

`ORGANIZATION_CREATED`, `DOMAIN_PACK_ACTIVATED`, `CANDIDATE_CREATED`, `PROFILE_UPDATED`, `CONSENT_CHANGED`, `PROFILE_INTERVIEW_STARTED`, `PROFILE_INTERVIEW_SUBMITTED`, `PROFILE_INTERVIEW_EVALUATED`, `POSTING_CREATED`, `QUESTION_POOL_LOCKED`, `POSTING_PUBLISHED`, `POSTING_CLOSED`, `APPLICATION_CREATED`, `APPLICATION_STAGE_CHANGED`, `APPLICATION_WITHDRAWN`, `APPLICATION_REJECTED`, `APPLIED_INTERVIEW_INVITED`, `APPLIED_INTERVIEW_SUBMITTED`, `APPLIED_INTERVIEW_EVALUATED`, `INTERVIEW_RESET_AUTHORIZED`, `OFFER_CREATED`, `OFFER_APPROVED`, `OFFER_ACCEPTED`, `CANDIDATE_HIRED`, `AUTOMATION_STARTED`, `AUTOMATION_ACTION_COMPLETED`, `AUTOMATION_FAILED`, `NOTIFICATION_REQUESTED`, `NOTIFICATION_DELIVERED`, `NOTIFICATION_FAILED`.

Every event carries `event_id`, `event_version`, `occurred_at`, `tenant_id`, `actor`, `correlation_id`, resource ID/version, and a privacy-safe payload. Consumers must be idempotent; schemas are versioned and contract-tested.

---

## 11. Canonical State & Exception Model

### 11.1 Application state categories
The stage **ID** is tenant-configurable; the state **category** is engine-defined and never inferred from a display label.

| Category | Example stage | Terminal? | Human approval required? |
|---|---|---:|---:|
| `new` | Received | No | No |
| `review` | Screened, Shortlisted | No | Configurable |
| `assessment` | Applied Interview | No | Invitation/configurable |
| `offer` | Offer | No | Yes |
| `hired` | Hired | Yes | Yes |
| `rejected` | Rejected | Yes | Yes |
| `withdrawn` | Withdrawn | Yes | Candidate or authorized staff |
| `closed` | Job closed/cancelled | Yes | Yes |

### 11.2 Candidate-facing status mapping
Candidates never see internal stage names or private deliberation. Every organization maps its internal stages to the four candidate-facing states: `Application received → Under review → Interview → Decision`, each showing Completed/Current/Upcoming, a last-updated time, and the next expected action.

### 11.3 Cross-cutting exception model
All async or AI-driven operations use one of two visible state paths:
`Queued → Processing → Completed` or `Needs attention → Retrying → Resolved/Cancelled`.
Failures appear in an exception inbox with owner, cause, safe retry, and support reference. A failed AI or integration task never silently blocks a candidate; manual fallback exists for critical hiring actions. Every override records actor, reason, timestamp, and old/new state.

---

## 12. Security & Tenancy

- Tenant context is mandatory and enforced at request, query, cache, event, object-storage, and search-index boundaries — not just at the API gateway.
- Role-based access control scoped by unit; hidden UI items are also denied server-side (never security-by-obscurity in the frontend).
- Optimistic concurrency (version numbers) on mutable workflow resources, exposed via the transition command contract (§9).
- Outbox pattern for reliable event publication from transactional changes.
- Append-only audit records for permissions, configuration, candidate decisions, score changes, exports, and overrides.
- Signed, short-lived object URLs; malware scanning and content-type/size enforcement on every upload.
- The Practical Assessment Sandbox is a separate, network-restricted runtime — never colocated with the Core API — with resource quotas and dedicated security tests as a release gate.

---

## 13. AI Implementation Boundaries

- LangChain is used behind provider-neutral application adapters; domain modules never invoke model providers directly.
- Prompt, model, pack, rubric, and policy versions are stored with every generated/evaluated artifact — full reproducibility of any score.
- Structured AI output is schema-validated; invalid output retries safely, then falls back to human review — never silently discarded or guessed at.
- Source evidence links only to permitted transcript/resume segments; no invented evidence.
- Model calls strip fields not required for the task and follow the tenant's configured data-residency/retention policy.
- Evaluation recalculation creates a new version and never overwrites the original result.
- Protected characteristics are excluded from scoring context unless a legally approved audit specifically requires them.

---

## 14. Infrastructure & Deployment

### 14.1 Initial modules/deployables (start here, split later only when justified)
1. **Web application** — Next.js employer and candidate routes, shared design system, permission-aware UI.
2. **Core API** — FastAPI auth adapter, tenancy, organizations, profiles, jobs, applications, workflow transitions, audit.
3. **AI/Interview worker** — Python/LangChain orchestration, pack calls, evaluation jobs, transcript processing, and LiveKit integration.
4. **Automation/Notification worker** — event consumption, delayed jobs, templates, retries.
5. **Sandbox runtime** — isolated, network-restricted assessment execution; never colocated with the Core API.
6. **Search indexer/query service** — async indexing with tenant and consent filters.

### 14.2 Frontend foundations
- Route groups by persona with shared domain models and design tokens (see `design.md`).
- Server state/query cache separated from local interaction state.
- Forms use shared validation schemas aligned with API contracts.
- Reusable primitives: data table, board, drawer, timeline, stepper, scorecard, filter bar, audit log, rule builder, async job status.
- Permission checks improve UX but never replace API authorization.
- Feature flags are tenant-aware, audited, and safe when disabled mid-flow.
- Analytics instrumentation uses stable event names and excludes resume/transcript content.

### 14.3 Backend foundations
See §12 (Security & Tenancy) — the backend foundation list is the same set of guarantees, enforced at the infrastructure layer rather than restated here.

---

## 15. Scalability & Performance Considerations

- Kanban/board views must remain usable at representative data volume via horizontal (columns) and vertical (cards) virtualization, with a list/table view as the accessible, bulk-friendly alternative.
- Search and matching are async-indexed, never synchronous on the write path of an application or profile update.
- Sandbox execution and AI-graded scenario tasks are the most expensive operations in the system; rate-limit retake frequency and sandbox usage from Phase 1, and track compute cost as a first-class metric, not an afterthought.
- Notification bursts (e.g. a popular posting matching thousands of candidates) must be throttled and deduplicated at the automation/notification worker, not at the client.

---

## 16. Open Architectural Questions

Track resolutions in `phases.md` §Decision Log, not in this document — this file should only ever describe the current, agreed architecture, not pending debate. Known open items entering Phase 0: exact tech stack per module, numeric performance/availability targets, data-residency requirements per target market, and whether the sandbox runtime is self-hosted or a managed third-party (Judge0-style) service.
