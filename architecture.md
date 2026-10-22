# THOS — Architecture Document

Version: 2.0 · October 2026 (v1.0 July 2026)

Companion documents:
- `prd.md`: requirements and build status
- `rules.md`: binding constraints
- `phases.md`: delivery gates
- `design.md`: UX/UI system
- `implementation-plan.md`: build sequence

This document has three parts:
- **§2–§11**: the system **as built** today.
- **§12**: the agreed **planned evolution**.
- **§13**: known gaps.

Pending debate belongs in `phases.md` §16, not here.

---

## 1. Architectural Principles

1. **Two strict layers.** The engine never contains domain knowledge. Domain packs never implement engine mechanics. If adding an industry needs a change to both layers, treat that as architecture debt.
2. **Configuration over branching.** Domain behaviour is data loaded from the active pack. Engine services never contain an `if domain == "..."` branch.
3. **Modules first, distribution later.** Today THOS is a **modular monolith**: one FastAPI process and one Next.js app. Split out services only when load, isolation or reliability requires it (§12).
4. **Humans own decisions.** AI produces scores, evidence and suggestions. Every reject, offer or hire is a human command, and it is audited.
5. **One canonical state, many views.** An application's stage lives in exactly one place. The Kanban, the candidate timeline and analytics all derive their labels from it.
6. **Everything async is visible, and AI is optional.** Every LLM feature either has a deterministic fallback or returns a clear "not configured" error. A missing integration never breaks startup.

---

## 2. System Context (as built)

```
┌────────────────────────────── Browser ──────────────────────────────┐
│  Next.js 15 / React 19 (Frontend/)                                   │
│  AppShell ─ employer routes (/, /jobs, /pipeline, /talent, …)        │
│           ─ candidate routes (/candidate/*)                           │
│  lib/api.ts (Bearer JWT + refresh)   utils/api.ts (voice adapter)     │
│  LiveKit client (WebRTC)             WebSocket telemetry client       │
└───────┬───────────────────────────────┬──────────────────┬───────────┘
        │ HTTPS JSON /api/v1            │ WS /voice/telemetry│ WebRTC
        ▼                               ▼                  ▼
┌──────────────────────── FastAPI (Backend/app) ──────────┐  ┌──────────────┐
│ middleware: CORS · RequestContext (request/correlation)  │  │ LiveKit      │
│ api/v1/*  ─►  services/*  ─►  db/store.py (tenant SQL)   │◄►│ server       │
│ ai/runtime: in-process voice agent joins LiveKit room ───┼─►│ (+ Redis)    │
│ ai/graph · ai/plan · ai/sandbox · services/synthesis     │  └──────────────┘
└───┬───────────────┬───────────────┬───────────────┬──────┘
    ▼               ▼               ▼               ▼
 PostgreSQL 17   OpenAI API      SMTP (opt.)     S3-compatible (opt.)
 + pgvector      chat, embed,    aiosmtplib      boto3 presign
 (SQLite in      STT, TTS,
  tests)         vision
                        ▲
 domain-packs/*/manifest.json ── loaded by services/packs.py (PackRegistry)
```

---

## 3. Backend Module Map (`Backend/app`)

| Module | Responsibility |
|---|---|
| `main.py` | `create_app()`. Adds the CORS and request-context middleware, mounts `/health` and `/api/v1`, and runs the dev seed on startup. |
| `core/` | `config.py` (Pydantic settings, `THOS_` prefix), `errors.py` (the single error envelope), `ids.py` (ID generation). |
| `middleware/request_id.py` | Propagates the request ID and correlation ID, accepting only valid UUIDs. |
| `api/dependencies.py` | Resolves identity (Bearer JWT, or `X-Development-Identity` in dev/test), tenant context and role guards. |
| `api/v1/*` | HTTP and WebSocket routers (§6). |
| `domain/` | `stages.py` (canonical stage categories and transitions), `permissions.py`, `evaluation.py` (deterministic rubric scorer). |
| `db/database.py` | Opens Postgres (psycopg; `?` placeholders converted to `%s`) or SQLite (WAL, foreign keys on). Runs idempotent `CREATE TABLE IF NOT EXISTS` statements plus `ALTER TABLE ADD COLUMN` migrations, each committed on its own. |
| `db/store.py` | Every query helper. Each carries a `tenant_id` predicate. Audit, outbox and idempotency rows are written in the same transaction as the change. |
| `db/seed.py` | Demo tenants, users, postings and applications. Runs only on an empty database. |
| `services/` | `matching`, `embeddings`, `cv_extract`, `cv_parse`, `job_description`, `ai_feedback`, `sandbox`, `voice_interview`, `synthesis_service`, `identity`, `mail` + `mail_templates`, `storage` (S3), `avatars`, `livekit` (tokens), `packs` (registry), `auth_tokens`, `passwords`, `ai/` (question-generation adapter). |
| `ai/graph/` | `TurnEngine`, a LangGraph state machine: ingest_answer → assess → router → follow_up / advance / redirect / wrap_up / wait. |
| `ai/plan/` | The interview plan generator (persona and questions). Job interviews keep the locked pool questions word for word. |
| `ai/runtime/` | `session.py` (the agent joins the LiveKit room), `manager.py` (in-memory session registry), `graph_llm.py` (LiveKit LLM adapter → TurnEngine). |
| `ai/sandbox/` | Generates coding and written exercises, with a fallback problem bank. |
| `ai/prompts/`, `ai/utils/` | Analysis templates and transcript helpers. |
| `websocket/manager.py` | Tracks connections per session and queues messages until the client connects. |

## 4. Frontend Module Map (`Frontend/`)

| Area | Contents |
|---|---|
| `app/` | App Router pages (route table in `Frontend/README.md`) and `api/interviews/token/route.ts`, the server-side LiveKit token proxy. |
| `components/layout/app-shell.tsx` | The shared shell: sidebar (full width, icon rail, or mobile drawer), top bar (search, pack chip, theme toggle, notifications, action button). |
| `components/dashboard/dashboard-shell.tsx`, `components/candidate/candidate-shell.tsx` | Persona shells with their nav items, wrapped in `RequireAuth`. |
| `components/{jobs,pipeline,talent,analytics,automations,admin,messages}` | Employer feature screens. |
| `components/candidate/*`, `components/interviews/voice/*`, `components/sandbox/*` | Candidate portal, voice interview flow (permissions → device check → setup → interview), proctored sandbox. |
| `components/ui/*` | Design-system primitives (see `design.md` §7). |
| `lib/api.ts` | The fetch client. Sends the Bearer token, refreshes once on a 401 (one refresh shared across concurrent calls), and returns typed `ApiError`s. |
| `lib/auth.ts` | The session in `localStorage` (`thos.access_token`, `thos.refresh_token`, `thos.session`). |
| `utils/api.ts` | The voice-interview adapter: picks the profile or applied endpoint base and builds the telemetry WebSocket URL. |
| `styles/*.css` | Tokens, typography, utilities, components and layout. No CSS framework. |

---

## 5. Data Model (26 tables)

| Group | Tables |
|---|---|
| Identity | `users`, `refresh_tokens` |
| Tenancy | `organizations`, `organization_invitations`, `units`, `memberships` |
| Packs & workflow | `domain_pack_activations`, `tenant_domain_packs`, `workflow_versions` |
| Candidates | `candidates` (profile, consents, avatar, identity verification, embedding as a JSON float array), `profile_interview_attempts` (responses, voice transcript, room, plan, answer assessments, score) |
| Hiring | `postings` (JD, locked pool, work mode, sandbox settings, embedding), `applications` (canonical stage and version, profile snapshot, match scores, `ai_improvement_feedback`), `application_transitions`, `applied_interview_attempts` (voice data and sandbox session), `reviewer_scorecards`, `posting_matches` |
| Operations | `notifications`, `email_templates`, `conversations`, `conversation_messages`, `automation_rules`, `automation_runs` |
| Integrity | `audit_records` (append-only), `idempotency_records`, `outbox_events` |

**Notes:**
- Embeddings are stored as JSON and compared with cosine similarity in Python. pgvector is enabled but not used as a column type yet.
- There is no Alembic. The schema is idempotent DDL in `database.py`, and new columns go through the guarded `ALTER TABLE` list.
- `outbox_events` are written but **not yet dispatched** (no consumer).

### 5.1 Domain Pack contract

Packs live in `domain-packs/<name>/manifest.json`. On load, `services/packs.py` (`PackRegistry`) validates the required keys and a semantic `pack_version`. An invalid manifest is rejected outright and is never partially activated. Tenants can also store custom packs in `tenant_domain_packs`.

```json
{
  "pack_id": "education",
  "pack_version": "1.0.0",
  "display_name": "Education",
  "domain": "education",
  "ontology": { "skills": [], "certifications": [], "concepts": [] },
  "resume_extraction_rules": { "signals": ["publications", "teaching_experience"] },
  "matching_weights": { "cv_match": 0.4, "profile_interview_score": 0.6 },
  "profile_interview": { "task_style": "scenario", "competencies": [] },
  "applied_interview": { "task_style": "scenario" },
  "evaluation_rubric": { "dimensions": ["structure", "reasoning", "domain_correctness"] },
  "compliance_rules": []
}
```

**How the engine uses a pack:**
- **Activation.** An org activates a pack, and each posting records its pack ID.
- **Content and scoring.** Interviews, matching weights, embedding text and rubrics are all read from the pack. The engine never branches on the pack's name.
- **Task style.** `task_style` picks the sandbox flavour: `code` gives a coding exercise, `scenario` a written one.

### 5.2 Domain events (outbox)

Events are written to `outbox_events` in the same transaction as the state change. Each one carries the event name, `tenant_id`, actor, `correlation_id`, the resource, and a privacy-safe payload.

**Events emitted today:**
- **Organizations:** `ORGANIZATION_APPLICATION_SUBMITTED`, `ORGANIZATION_CREATED`, `ORGANIZATION_VERIFIED`, `DOMAIN_PACK_ACTIVATED`
- **Postings:** `POSTING_CREATED`, `QUESTION_POOL_LOCKED`, `POSTING_PUBLISHED`, `POSTING_MATCHES_GENERATED`, `POSTING_CLOSED`
- **Applications:** `APPLICATION_CREATED`, `APPLICATION_STAGE_CHANGED`, `APPLICATION_REJECTED`, `APPLICATION_WITHDRAWN`, `OFFER_CREATED`, `CANDIDATE_HIRED`
- **Interviews:** `APPLIED_INTERVIEW_INVITED`, `APPLIED_INTERVIEW_SUBMITTED`
- **Messaging:** `CONVERSATION_MESSAGE_SENT`

**Planned events:**
- profile-interview lifecycle events
- automation events
- notification delivery events

Nothing consumes these events yet. A dispatcher is planned (§12).

---

## 6. API Surface (`/api/v1`, plus `/health/live` and `/health/ready`)

| Router | Main endpoints |
|---|---|
| `auth.py` | `POST auth/register`, `auth/login`, `auth/refresh`, `auth/logout`; `GET auth/me` |
| `me.py` | `GET me`; `POST/GET/DELETE me/avatar` |
| `organizations.py` | `POST organizations`, `organizations/applications`; `GET organizations/applications/mine`; `admin/organizations/pending`, `{id}/verify`, `{id}/reject`; `organizations/current` + `units`, `members`, `members/{id}/roles`, `audit`, `email-templates[/{key}]` |
| `packs.py` | `domain-packs` CRUD; `organizations/current/domain-packs/activations` and `active` |
| `workflows.py` | `workflows/components`, `workflows`, `workflows/current` (and alias `active`), `PUT workflows/current` |
| `postings.py` | `postings` CRUD, `publish` (runs matching), `matches`, `close`; `question-pool/generate`, `PATCH question-pool`, `question-pool/lock`; `postings/generate-description` |
| `jobs.py` | `GET jobs`, `jobs/{id}`; `POST applications`; `candidates/me/matches`, `me/applications`, `{id}/timeline`, `{id}/withdraw`; `me/applied-interviews/{id}` (+ `responses`, `submit`) |
| `candidates.py` | `candidates/me/profile` (GET/PATCH), `me/cv/upload`, `me/cv/parse`, `me/consents/{purpose}`, `me/profile-interview-attempts`; `profile-interview-attempts/{id}` (+ `responses`, `submit`) |
| `voice_interviews.py` | For both `…/profile-interview-attempts/{id}/voice` and `…/applied-interviews/{id}/voice`: `GET` status, `POST identity-check`, `livekit`, `start`, `complete`, plus **WS** `telemetry` |
| `sandbox.py` | `candidates/me/applied-interviews/{id}/sandbox`: `GET`, `start`, `PUT progress`, `violations`, `recording`, `submit` |
| `pipeline.py` | `GET pipeline`, `applications/{id}`; `POST applications/{id}/transitions` (canonical); `pipeline/bulk-transition`, `applications/{id}/undo-transition`, `screen-received`, `shortlist`, `invite-interviews`; `applied-interview-invitations`, `scorecards`, `decision`; `candidate-avatar`; `analytics/pipeline` |
| `analytics.py` | `analytics/overview`, `funnel`, `velocity`, `sources`, `fairness`, `calibration` |
| `automations.py` | CRUD, `{id}/toggle`, `{id}/test` (dry run, records an `automation_run`) |
| `messages.py` | `conversations` (list/create, by application, read), `conversations/{id}/messages`; `candidates/me/conversations` |
| `notifications.py`, `search.py`, `storage.py` | `notifications`, `mark-read`; `search`, `talent`, `packs/catalog`; `storage/presigned-url` |
| `router.py` | `POST interviews/token` (LiveKit token), `POST ai/interview-questions` |

**Conventions**
- **Errors.** Every error uses one envelope, `{"error": {"code", "message", "request_id", "details"}}`.
- **Idempotency.** Applications and transitions take idempotency keys.
- **Optimistic concurrency.** Transitions carry `from_stage_version`. A mismatch returns `409` with the current state.
- **Identity.** In staging and production, caller-chosen identity headers are refused.

### Transition command (all stage changes)
```json
{
  "from_stage_version": 14,
  "to_stage_id": "shortlisted",
  "reason_code": "meets_requirements",
  "note": "Optional reviewer context",
  "idempotency_key": "client-generated-id"
}
```
In one transaction, the handler does the following:
- checks the version (`409 application_stage_conflict` on a mismatch)
- records the transition and the audit row
- emits `APPLICATION_STAGE_CHANGED`, plus a category event, to the outbox

When the destination is a review stage, it also runs AI screening. Stage-progression emails go out through `services/mail.py`.

---

## 7. Canonical State

| Category | Example stage | Terminal | Human required |
|---|---|---:|---:|
| `new` | Received | No | No |
| `review` | Screened, Shortlisted | No | Configurable |
| `assessment` | Applied Interview | No | Invitation |
| `offer` | Offer | No | Yes |
| `hired` | Hired | Yes | Yes |
| `rejected` | Rejected | Yes | Yes |
| `withdrawn` | Withdrawn | Yes | Candidate or staff |
| `closed` | Job closed | Yes | Yes |

Candidates only ever see the four-step mapping, **Application received → Under review → Interview → Decision**, served by `/timeline`. The Kanban groups stages into four macro lanes.

---

## 8. Two-Stage Voice Interview Architecture

### 8.1 Session sequence
```
Candidate UI                 Backend                                   LiveKit
 │ permissions → device check (mic/cam) → setup                         │
 │ POST …/voice/identity-check (webcam frame vs avatar, vision model)   │
 │ POST …/voice/livekit ───────────► mint room token ─────────────────► │
 │ WS   …/voice/telemetry ◄──────── setup steps: connecting_to_room,    │
 │                                  generating_persona, initializing…   │
 │ POST …/voice/start ─────────────► PlanGenerator (persona + questions)│
 │                                  ai/runtime/session joins room ────► │
 │ ◄═══════════ audio ═══════════► Silero VAD → OpenAI STT             │
 │                                  → GraphLLM → TurnEngine (assess:    │
 │                                    follow-up / advance / redirect /  │
 │                                    wrap-up) → OpenAI TTS             │
 │ WS events: new_transcript_message, agent/user_speech_*, user_turn_*  │
 │ POST …/voice/complete ──────────► synthesis_service: transcript      │
 │                                  analysis → score, rubric, evidence  │
```
- **Profile Screening.** Owned by the candidate. The attempt cap (3) and cooldown (24h) come from settings. Question content comes from the pack's `profile_interview` config.
- **Job Interview.** Owned by the employer. Questions come from the posting's **locked pool**, word for word, and there is one attempt. It then hands off to the sandbox.
- **Fallbacks.** Without OpenAI, the turn assessor falls back to a word-count heuristic and the plan generator uses a template. Voice `start` returns `503` when LiveKit or AI is missing.
- **Session state.** It lives in memory (`ai/runtime/manager.py`), so voice sessions do not survive a backend restart.

### 8.2 Proctored sandbox
- The exercise is a **coding** or **written** task. It is generated per posting by an LLM, or drawn from the fallback bank.
- Proctoring covers:
  - server-side timer
  - autosaved progress (`PUT progress`)
  - focus and tab violations (`POST violations`)
  - webcam recording upload, stored under `THOS_VIDEOS_DIR`
- **Grading** is LLM rubric review, or keyword coverage without a key. **Code is not executed.** An isolated runtime with hidden tests is planned (§12).

---

## 9. Matching, Screening & AI Services

| Service | LLM path | Fallback |
|---|---|---|
| `embeddings.py` | OpenAI `text-embedding-3-small` | `local-hash-v1` SHA-256 hash embedding |
| `matching.py` | AI screening evaluation | Cosine similarity + skill overlap. Only candidates who have consented. |
| `cv_extract.py` / `cv_parse.py` | `ChatOpenAI` structured extraction | pypdf / python-docx text + heuristic parser |
| `job_description.py` | LLM | Template |
| `ai_feedback.py` | LLM rejection feedback | Heuristic |
| `identity.py` | Vision comparison (`THOS_ANALYSIS_MODEL`) | "unavailable" (non-blocking) |
| `services/ai/*` | Question-pool generation | `status="disabled"` |

The only provider is **OpenAI**, used through `langchain-openai`, the `openai` SDK and `livekit-plugins-openai`. Domain modules never call providers directly. They go through these services.

---

## 10. Security & Tenancy (as built)

- **Auth.** Password (bcrypt) login issues an HS256 JWT access token (15 min) and an opaque refresh token. The refresh token is hashed at rest and rotated on each refresh.
- **Development identity.** The `X-Development-Identity` header works only in development and test.
- **Tenancy.** Every tenant-owned query has an explicit `tenant_id` predicate, and `test_tenancy.py` proves cross-tenant denial. Role checks use `domain/permissions.py`. Hidden UI is also denied on the server.
- **Audit.** Configuration, membership, transition and decision changes write `audit_records` in the same transaction.
- **Uploads.** CVs are checked for type and size (≤5 MB). Avatars and recordings are stored on local disk; S3 presign is optional.
- **Secrets.** LiveKit and OpenAI keys stay on the backend. The frontend token route only proxies.

---

## 11. Infrastructure (local)

| Component | Definition |
|---|---|
| PostgreSQL 17 + pgvector | `infrastructure/local/docker-compose.yml`, container `thos-postgres`, **host port 5433** |
| LiveKit + Redis | Root `docker-compose.yml` (`livekit-docker-compose.yml` is an identical copy). LiveKit ports 7880/7881/7882. Config in `livekit.yaml`. |
| Backend | `uv run uvicorn app.main:app --reload` on :8000 |
| Frontend | `npm run dev` on :3000 |

There is no CI pipeline, container image or deployment target in the repo yet.

---

## 12. Planned Evolution (target architecture)

These are agreed directions, not yet built:

1. **Identity.** OIDC/SSO with an MFA-ready design replaces password + JWT as the production identity (ADR-003).
2. **Data.** PostgreSQL row-level security as defence in depth (ADR-005), pgvector columns for embeddings, and Alembic migrations.
3. **Events and workers.** An outbox dispatcher feeding an event bus (Kafka or a managed equivalent). Separate workers for automation execution, notifications and email retries, and analytics projections.
4. **Automation executor.** It runs published rules on live events, with versioning, loop detection, duplicate suppression and global pause. Consequential actions create human tasks.
5. **Sandbox runtime.** An isolated, network-restricted code-execution service (Judge0-style) with hidden test cases. It is never colocated with the Core API.
6. **Search.** OpenSearch, or an equivalent tenant- and consent-filtered index, for talent discovery.
7. **Voice scale-out.** Move the in-process LiveKit agent to a dedicated agent worker, so sessions survive API restarts and scale on their own.
8. **Storage.** S3 for all recordings, avatars and CVs, with signed short-lived URLs and malware scanning.
9. **Observability and delivery.** Structured logs (loguru is already used) shipped to a backend, plus metrics, tracing, CI and container images.

---

## 13. Known Gaps & Debt

- `langgraph` is imported by `ai/graph/engine.py` but not declared in `pyproject.toml`. It arrives only transitively through `langchain`. Declare it explicitly.
- `docker-compose.yml` and `livekit-docker-compose.yml` are duplicates. Keep one.
- `Backend/.env.example` differs from the code defaults for `THOS_TURN_ASSESSMENT_MAX_TOKENS` (200 vs 500) and `THOS_ANSWER_MAX_WORDS_FOLLOWUP_THRESHOLD` (12 vs 2).
- In the frontend, `lib/persona.ts` is unused, and `utils/api.ts` (the voice adapter) does not refresh expired tokens.
- `Backend/data/*.db` and a sample recording are tracked in git. Local data should be git-ignored.
