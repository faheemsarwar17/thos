# THOS — Product Requirements Document (PRD)

Version: 2.0 · October 2026 (v1.0 July 2026)

Companion documents:
- `architecture.md`: technical design
- `rules.md`: binding constraints
- `phases.md`: delivery gates
- `design.md`: UX/UI system
- `implementation-plan.md`: build sequence

---

## 1. Purpose & Audience

This PRD defines **what** THOS must do and **why**, and records **how much of it is built today**. It is written for product, design and engineering leads, and for any AI coding agent that uses this repository as context. When a feature's intent is unclear, this document is the source of truth over any individual code comment.

- **Intent:** if a requirement here conflicts with `architecture.md`, this document wins.
- **Technical feasibility:** `architecture.md` wins on trade-offs.
- **Logging conflicts:** record them as a decision in `phases.md` §16.

**Build-status legend** (used in §7 and §9):
- ✅ **Built**: works end to end in the local pilot.
- 🟡 **Partial**: works in simplified form; the gap is noted.
- ⬜ **Planned**: not started.

---

## 2. Product Summary

THOS is a multi-tenant, AI-native **hiring operating system** with two layers:

- **Universal Hiring Engine.** Shared by every customer in every industry, it covers:
  - auth and tenancy
  - the ATS workflow
  - interview orchestration
  - proctored practical assessments
  - matching and search
  - messaging and analytics
- **Domain Intelligence Packs.** Swappable JSON manifests for Education, Software Engineering and future fields. Each pack supplies the ontology, resume signals, matching weights, interview configuration and grading rubrics for its field.

The platform runs a **two-stage AI interview model**, delivered as **real-time voice conversations** with an AI interviewer:
1. **Profile Screening (Profile Interview).** Self-directed, owned by the candidate, retakeable after a cooldown and specific to one domain. It produces a portable Skill Score.
2. **Job Interview (Applied Interview).** Owned by the employer and generated from a specific posting's locked question pool. Each candidate gets one attempt, followed by a **proctored sandbox** exercise (coding or written).

THOS originated as PATN (Pakistan Academic Talent Network). The Education Pack is the founding pack. The engine has been built generically from day one, and a second pack (Software Engineering) already ships.

---

## 3. Problem Statement

**Generic job portals** have reach but no domain intelligence:
- They cannot verify an academic credential, run a subject-specific interview or evaluate teaching ability.
- Once applications are collected, screening is still manual.

**Single-domain vertical tools** go deep in one field. But that caps their market, and each new industry means rebuilding a near-duplicate product.

**Pakistani academia** has its own problems:
- chronic faculty shortages
- paper-heavy recruitment
- job postings scattered across disconnected channels
- no shared visibility into which visiting faculty are available

**The question THOS answers:** can one platform be both wide and deep, and proactively connect proven candidates to roles they haven't searched for?

---

## 4. Goals & Success Metrics

| Goal | Metric | Target | Instrumented today? |
|---|---|---|---|
| Prove the two-layer architecture | Engine code changes required to add a Domain Pack | 0 | 🟡 The second pack (Software Engineering) loaded with no engine changes. Formal Phase 7 audit pending. |
| Reduce hiring time | Median time-to-hire in the Education pilot | ≥30% reduction vs. baseline | 🟡 `analytics/velocity` reports time-in-stage. No baseline captured yet. |
| Reusable proof of ability | % of candidates reusing a Profile Screening score across ≥2 applications | Track | 🟡 The score is snapshotted onto each application. No report yet. |
| Passive discovery | Notification-to-application conversion | Track | ⬜ Match notifications exist; conversion is not tracked. |
| Humans control decisions | % of reject/hire/offer decisions with a human actor of record | **100%** | ✅ Enforced by the transition command and the audit log. |
| Screening quality | Reviewer vs. AI agreement rate | Monitor | 🟡 `analytics/calibration` exists; no review workflow yet. |
| Platform trust | WCAG 2.2 AA on critical paths | 100% | 🟡 Keyboard Kanban, focus rings and labels are done. No formal audit yet. |

---

## 5. Personas

| Persona | Summary | Primary workspace | Seeded demo user |
|---|---|---|---|
| **Platform Superadmin** | Verifies organization applications | `/admin` (pending orgs) | `superadmin@thos.local` |
| **Organization Administrator / Owner** | Sets up units, members, roles, domain packs, workflows, email templates, automations | Employer: Administration, Automations | `ayesha.khan@nut.edu.pk` |
| **Hiring Manager** | Creates postings, curates question pools, reviews candidates, decides | Employer: Jobs, Pipeline | `samira.iqbal@nut.edu.pk` |
| **Recruiter / HR** | Runs the pipeline, screening, invitations, messages, analytics | Employer: Pipeline, Messages, Analytics | `bilal.hassan@nut.edu.pk` |
| **Candidate** | Builds a profile, uploads a CV, takes Profile Screening, applies, takes Job Interviews and the sandbox, tracks status | Candidate portal | `hira.ahmed@gmail.com` |
| **Short-term / Visiting Talent** | Lists availability for visiting engagements | Candidate: Opportunities | ⬜ Planned |
| **Specialist / Collaborator** | Research and project collaboration profile | Candidate: Profile | ⬜ Planned |

---

## 6. Scope

### 6.1 In scope (platform-wide)
- The Universal Hiring Engine, made up of:
  - multi-tenancy
  - the ATS pipeline
  - two-stage voice interviews
  - the proctored assessment sandbox
  - matching and notifications
  - talent discovery
  - analytics
  - automation
  - messaging
- The Domain Pack Registry, with the Education (founding) and Software Engineering packs.
- Human-in-the-loop control over every consequential hiring decision.

### 6.2 Later phases (see `phases.md`)
- A third pack (Business & Marketing) and a formal portability audit.
- An automation **executor**, which runs rules on live events. Today rules are authored and dry-run only.
- A fairness and calibration governance workflow, workforce planning, and an external pack-authoring SDK.
- Production identity (OIDC/MFA), row-level security, an event bus and workers, and an isolated code-execution runtime.

### 6.3 Explicitly out of scope
- AI making a final hire, reject or offer decision.
- Domain-specific logic inside engine services.
- Native mobile apps. The product is a responsive web app.
- Third-party pack authorship, payroll, background checks, or full HRIS and onboarding.

---

## 7. Functional Requirements & Build Status

### 7.1 Organization Onboarding & Configuration
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-1.1 | Tenant setup: sign-up, verification, unit tree | ✅ | `/register/organization` → pending → the superadmin verifies or rejects (`/admin/organizations/*`). Units and members are managed under `/organizations/current`. Changes are audited. |
| FR-1.2 | Domain Pack activation with manifest validation | ✅ | `PackRegistry` validates the required keys and a semantic version. Tenants can also create custom packs (`tenant_domain_packs`). |
| FR-1.3 | Versioned workflow configuration | ✅ | The `/workflows` API provides components, current/active, publish and versioning. Postings pin the workflow version. |
| FR-1.4 | Configurable candidate emails | ✅ | Per-tenant email templates (`/organizations/current/email-templates`) for stage progression, acceptance and rejection. Sent over SMTP, or logged to the console. |

### 7.2 Candidate Profile & Skill Profile
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-2.1 | Profile creation and resume parsing with review | ✅ | `cv/upload` accepts PDF, DOCX and text (≤5 MB). `cv/parse` uses an LLM or a heuristic. The candidate edits every field. |
| FR-2.2 | Domain selection from active packs | ✅ | `packs/catalog`, plus target domains on the profile. |
| FR-2.3 | Profile Screening (voice) | ✅ | A LiveKit voice session with an AI interviewer and a LangGraph turn engine with follow-ups. Post-session analysis gives a Skill Score, rubric breakdown, strengths and gaps. Resumable. Attempt cap 3, cooldown 24h. |
| FR-2.4 | Score visibility control (best / most recent) | 🟡 | Scores are snapshotted to applications. The candidate-facing best/most-recent toggle is pending. |
| FR-2.5 | Consent & cross-org visibility | ✅ | `PUT /candidates/me/consents/{purpose}`. Matching and talent search only include consenting candidates. |
| FR-2.6 | Profile photo & identity check | ✅ | Avatar upload, then a webcam-frame comparison by a vision model before the interview. If AI is unavailable the result is "unavailable"; it never blocks the candidate. |

### 7.3 Job Creation & Publishing
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-3.1 | Job authoring (unit, pack, workflow, requirements, JD) | ✅ | Includes work mode and sandbox settings per posting. |
| FR-3.2 | AI-generated question pool | ✅ | `question-pool/generate`. Returns `disabled` without an AI key. |
| FR-3.3 | Curation (keep / edit / reorder / remove / add) | ✅ | `PATCH question-pool`. |
| FR-3.4 | Lock & publish | ✅ | `question-pool/lock` and `publish`. Every applicant draws from the same locked pool. |
| FR-3.5 | AI job-description generator | ✅ | `postings/generate-description`, with a template fallback. |

### 7.4 Application, Screening & Pipeline
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-4.1 | Apply idempotently with a profile snapshot | ✅ | `POST /applications` with an idempotency key. |
| FR-4.2 | AI CV screening and ranking | ✅ | `pipeline/screen-received` and `pipeline/shortlist` use embedding similarity, skill overlap and the pack's matching weights. The result is a suggestion; a human applies it. |
| FR-4.3 | Pipeline movement (Kanban + list) | ✅ | One canonical transition command. Drag-and-drop or keyboard. Bulk transition and undo. Reasons are required on consequential moves. Everything is audited. |
| FR-4.4 | Candidate-facing 4-step status | ✅ | `/candidates/me/applications/{id}/timeline`. Internal stage names and notes are never exposed. |
| FR-4.5 | AI improvement feedback on rejection | ✅ | Stored as `applications.ai_improvement_feedback`, with a heuristic fallback. |
| FR-4.6 | Candidate withdrawal | ✅ | `POST .../applications/{id}/withdraw`. |

### 7.5 Job Interview (Applied Interview) & Sandbox
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-5.1 | Invitation from the locked pool | ✅ | Single invite or bulk (`pipeline/invite-interviews`), plus an email. |
| FR-5.2 | One-shot, immutable submission | ✅ | A voice session keeps the locked questions word for word, then submits explicitly. No candidate-initiated retake. |
| FR-5.3 | Evaluation with evidence and a human decision | ✅ | Transcript synthesis with guards against thin transcripts, plus reviewer scorecards and `POST /applications/{id}/decision`. AI never moves a stage by itself. |
| FR-5.4 | Proctored practical sandbox | 🟡 | A coding or written exercise (AI-generated or from the fallback bank), with timer, autosave, tab and focus violations, and webcam recording. **Grading is done by an LLM or by keyword coverage. Code is not executed against test cases yet.** |
| FR-5.5 | Org-authorized technical reset | ⬜ | Planned. |

### 7.6 Proactive Matching & Notifications
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-6.1 | Automatic matching on publish | ✅ | Runs on publish and is stored in `posting_matches`. Candidates see `/candidates/me/matches`; employers see `/postings/{id}/matches`. |
| FR-6.2 | Candidate notification preferences | ⬜ | Planned. |
| FR-6.3 | Employer score-threshold watch | 🟡 | Possible as an automation trigger (`score_threshold`); it runs only as a dry run. |
| FR-6.4 | In-app notifications | ✅ | `/notifications` and `mark-read`, with a bell count in the top bar. |

### 7.7 Talent Discovery
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-7.1 | Faceted talent search | 🟡 | `/talent` and global `/search`. Filters are basic; OpenSearch is planned. |
| FR-7.2 | Explainable match | 🟡 | Match score and skill overlap. The full required/preferred/missing split is pending. |
| FR-7.3 | Comparison tray | ⬜ | Planned. |

### 7.8 Messaging
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-11.1 | Conversations tied to an application | ✅ | `/conversations` (by application, messages, read receipts). Employer and candidate inboxes. |

### 7.9 Automation
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-8.1 | Rule builder (WHEN / IF / THEN) | ✅ | CRUD and toggle in `/automations`. Triggers: stage entered, score threshold, SLA exceeded. |
| FR-8.2 | Safety: dry run, pause, versioning, loop detection | 🟡 | Dry-run (`/automations/{id}/test`) and per-rule toggle are built. **No executor runs rules on live events yet.** Versioning and loop detection are planned. |

### 7.10 Analytics & Governance
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-9.1 | Operational dashboards | ✅ | `analytics/overview`, `funnel`, `velocity`, `sources`, plus `analytics/pipeline`. |
| FR-9.2 | Fairness monitoring and appeals | 🟡 | `analytics/fairness` and `calibration` show score distributions. Restricted access, sample thresholds and an appeals path are planned. |

### 7.11 Domain Pack System
| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-10.1 | Pack contract | ✅ | Manifest keys: `pack_id`, `pack_version`, `display_name`, `domain`, `ontology`, `resume_extraction_rules`, `matching_weights`, `profile_interview`, `applied_interview`, `evaluation_rubric`, `compliance_rules`. |
| FR-10.2 | Zero engine changes for a new pack | 🟡 | The Software Engineering pack was added as a manifest only. A formal audit is part of Phase 7. |

---

## 8. Non-Functional Requirements

| Category | Requirement | Current state |
|---|---|---|
| **Accessibility** | WCAG 2.2 AA on critical paths; keyboard equivalents for drag-and-drop; visible focus; never color alone | 🟡 Keyboard Kanban, focus rings, skip link, labelled pills and reduced-motion support. No formal audit yet. |
| **Responsive layout** | Usable from 360px phones to wide desktops; **no horizontal page scroll or clipped controls at 1280×620 CSS px** (e.g. 1600×900 at 125% scaling) | ✅ Icon-rail sidebar between 821 and 1366px, `dvh` heights, scrollable dialogs. See `design.md` §6. |
| **Privacy & consent** | Consent for cross-org sharing; revocation honoured; retention configurable | 🟡 Consent is enforced in matching and search. Retention and export are planned. |
| **Security** | Tenant context on every query; sandboxed execution; signed URLs; upload checks | 🟡 Tenant predicates on every store query, plus a cross-tenant test suite. Uploads are type- and size-checked. S3 presigned URLs are optional. RLS and malware scanning are planned. |
| **AI governance** | Version stamps; schema-validated output; protected characteristics excluded; AI never decides | 🟡 Structured outputs are validated and every LLM path has a fallback. Full prompt and model version stamping is partial. |
| **Reliability** | Async work is visible; no silent failure; manual fallback | 🟡 Voice setup steps are streamed over WebSocket, and safe errors return 503s. No job queue yet. |
| **Auditability** | Append-only audit for permissions, config, decisions, overrides | ✅ `audit_records`, written in the same transaction as the change. |
| **Localization** | English first; ready for localization | 🟡 English only. The interview language is configurable (`THOS_DEFAULT_INTERVIEW_LANGUAGE`). |

---

## 9. Release Criteria (Pilot MVP)

| Criterion | Status |
|---|---|
| A candidate completes onboarding, Profile Screening, an application, a Job Interview and the sandbox end to end | ✅ Requires LiveKit and OpenAI for the voice steps. |
| A hiring team moves a candidate from Received to Hired or Rejected, with every move authorized, validated and audited | ✅ |
| No internal-only status or note is ever exposed to a candidate | ✅ Covered by the timeline mapping. |
| Tenant isolation is proven by an automated cross-tenant denial suite | ✅ `Backend/tests/test_tenancy.py` |
| WCAG 2.2 AA passes on the critical paths | 🟡 No formal audit yet. |
| Production identity (OIDC), RLS, and isolated code execution | ⬜ Required before staging. |

---

## 10. Assumptions & Dependencies

- The initial market is Pakistani academic hiring (Education Pack), in English.
- One tenant contains multiple units.
- Responsive web only; no native app.
- Human approval is required for reject, offer and hire.
- Notification channels are in-app and email (SMTP).
- **OpenAI is the only AI provider today.** LiveKit (self-hosted or Cloud) carries real-time media. Both are optional for non-voice features.

---

## 11. Risks

These are tracked in `phases.md` §15. The headline product risks are:
- Domain logic leaking into the engine.
- Inconsistent AI grading of open-ended tasks. This matters more now that sandbox grading is LLM- or keyword-based rather than test-based.
- Candidate trust eroding if status communication goes silent.
- The compute and API cost of voice interviews and AI grading at scale.
- Depending on a single AI provider.

---

## 12. Glossary

| Term | Definition |
|---|---|
| **Engine** | Domain-agnostic services shared by every tenant and pack |
| **Domain Pack** | A JSON manifest that supplies the ontology, signals, weights, interview config and rubrics for one field |
| **Profile Screening / Profile Interview** | A voice interview owned by the candidate, retakeable, that produces a portable Skill Score |
| **Job Interview / Applied Interview** | A one-shot voice interview owned by the employer, drawn from a posting's locked pool |
| **Sandbox** | A proctored coding or written exercise that follows a Job Interview |
| **Skill Score** | The evidence-backed score from Profile Screening, shown with a tier (Gold / Silver / Bronze) |
| **Locked pool** | The finalized, immutable Job Interview question set for one posting |
| **Canonical transition** | The single authorized and audited command for every pipeline stage change |
| **Turn engine** | The LangGraph state machine that decides whether to follow up, advance, redirect or wrap up after each spoken answer |
