# THOS Backend

This is the FastAPI service behind THOS. It covers:
- multi-tenant organizations, roles and verification
- domain packs and versioned workflows
- candidate profiles with CV parsing
- job postings with locked question pools
- the canonical, audited pipeline
- **voice interviews**: an AI interviewer on LiveKit, using OpenAI STT/TTS and a LangGraph turn engine
- a proctored sandbox
- matching, messaging, email, analytics and automation rules

For the system design, see [`../architecture.md`](../architecture.md).

## Stack

- **Python 3.13** (`>=3.13,<3.14`), packaged with **uv** and hatchling (`pyproject.toml`, `uv.lock`)
- FastAPI and uvicorn, pydantic-settings, PyJWT and bcrypt, loguru
- psycopg (PostgreSQL) or the stdlib `sqlite3`
- langchain, langchain-openai, openai, and langgraph (which currently comes in transitively; see `architecture.md` §13)
- livekit, livekit-api, livekit-agents, livekit-plugins-openai, livekit-plugins-silero
- pypdf, python-docx, aiosmtplib, boto3

## Setup

```powershell
# from the repository root: start PostgreSQL 17 + pgvector on host port 5433
docker compose -f infrastructure/local/docker-compose.yml up -d

cd Backend
Copy-Item .env.example .env
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000
```

- API: `http://127.0.0.1:8000`
- OpenAPI: `/docs`
- Health checks: `/health/live` and `/health/ready`

On startup the schema is created or migrated, and in `development` an empty database is seeded with demo data.

### Database

| Mode | How |
| --- | --- |
| PostgreSQL (default) | `THOS_DATABASE_URL=postgresql://thos:thos@localhost:5433/thos` |
| SQLite | Leave `THOS_DATABASE_URL` unset. Uses `THOS_DATABASE_PATH` (default `./data/thos.db`). Tests always use temporary SQLite files. |

**How the database layer works:**
- `app/db/database.py` creates the 26 tables with idempotent DDL, then applies guarded `ALTER TABLE ... ADD COLUMN` migrations, committing each one separately.
- There is no Alembic yet.
- The store layer writes SQL with `?` placeholders, and an adapter translates them for psycopg.
- Every tenant-owned query carries a `tenant_id` predicate.

### Demo accounts (password `Password123!`)

| Email | Role |
|---|---|
| `superadmin@thos.local` | Platform superadmin (verifies organizations) |
| `ayesha.khan@nut.edu.pk` | Owner / administrator, National University of Technology |
| `bilal.hassan@nut.edu.pk` | Recruiter |
| `samira.iqbal@nut.edu.pk` | Hiring manager |
| `tariq.mahmood@riverside.edu.pk` | Owner / administrator, Riverside College |
| `hira.ahmed@gmail.com`, `omar.farooq@gmail.com`, `daniyal.raza@gmail.com`, `nadia.omar@gmail.com`, `mahnoor.waheed@gmail.com` | Candidates |

The seed includes the activated Education pack, a default workflow per org, four postings, profile-interview attempts, five applications at different stages, and an evaluated job interview with a sandbox submission (Hira).

## Configuration

Copy `.env.example` to `.env`. Every setting uses the `THOS_` prefix (`app/core/config.py`). Integrations are optional at startup: when one isn't configured, the endpoints that need it return a safe error.

| Group | Variables |
| --- | --- |
| App | `THOS_ENVIRONMENT` (development / test / staging / production), `THOS_DEBUG`, `THOS_CORS_ORIGINS`, `THOS_DEVELOPMENT_IDENTITY` |
| Data | `THOS_DATABASE_URL`, `THOS_DATABASE_PATH`, `THOS_SEED_DEMO_DATA`, `THOS_DOMAIN_PACKS_PATH` |
| Auth | `THOS_JWT_SECRET`, `THOS_JWT_ACCESS_TTL_SECONDS` (900), `THOS_JWT_REFRESH_TTL_SECONDS` (14 days), `THOS_SUPERADMIN_EMAILS`, `THOS_AUTO_VERIFY_ORGANIZATIONS` |
| Interview policy | `THOS_PROFILE_INTERVIEW_ATTEMPT_CAP` (3), `THOS_PROFILE_INTERVIEW_COOLDOWN_HOURS` (24) |
| Mail | `THOS_SMTP_HOST`/`PORT`/`USER`/`PASSWORD`/`FROM_EMAIL`, `THOS_PUBLIC_BASE_URL`. An empty host means mail is logged to the console. |
| Files | `THOS_AVATARS_DIR`, `THOS_RECORDINGS_DIR`, `THOS_VIDEOS_DIR` |
| S3 (optional) | `THOS_S3_ENDPOINT`, `THOS_S3_ACCESS_KEY`, `THOS_S3_SECRET_KEY`, `THOS_S3_BUCKET_NAME`, `THOS_S3_REGION` |
| LiveKit | `THOS_LIVEKIT_URL`, `THOS_LIVEKIT_API_KEY`, `THOS_LIVEKIT_API_SECRET`, `THOS_LIVEKIT_TOKEN_TTL_SECONDS` |
| AI (OpenAI only) | `THOS_AI_PROVIDER=openai`, `THOS_AI_API_KEY`, `THOS_AI_MODEL` (gpt-4o-mini), `THOS_EMBEDDING_MODEL`, `THOS_AI_TIMEOUT_SECONDS` |
| Voice runtime | `THOS_VOICE_INTERVIEW_ENABLED`, `THOS_STT_MODEL`, `THOS_TTS_MODEL`, `THOS_TTS_VOICE`, `THOS_TURN_ASSESSMENT_MODEL`, `THOS_TURN_ASSESSMENT_MAX_TOKENS`, `THOS_ENDPOINTING_DELAY_SECONDS`, `THOS_VAD_MIN_SILENCE_SECONDS`, `THOS_ANSWER_MAX_WORDS_FOLLOWUP_THRESHOLD`, `THOS_PLAN_GENERATION_MODEL`, `THOS_ANALYSIS_MODEL`, `THOS_DEFAULT_INTERVIEW_LANGUAGE`, `THOS_DEFAULT_INTERVIEW_LENGTH_MINUTES` |

Voice interviews are ready only when voice is enabled **and** both LiveKit and the AI key are set. The default local LiveKit (root `docker-compose.yml`) uses `ws://localhost:7880` with key `devkey` and the secret from `livekit.yaml`.

Never commit `.env`.

## Code layout

```text
app/
├── main.py              create_app(): middleware, routers, dev seed
├── core/                config, error envelope, id generation
├── middleware/          request/correlation IDs
├── api/dependencies.py  identity (Bearer JWT / dev header), tenant + role guards
├── api/v1/              routers (see below)
├── domain/              stages, permissions, deterministic evaluation
├── db/                  database.py (connection + schema), store.py (queries), seed.py
├── services/            matching, embeddings, cv_extract/cv_parse, job_description, ai_feedback,
│                        sandbox, voice_interview, synthesis_service, identity, mail(+templates),
│                        storage (S3), avatars, livekit, packs, auth_tokens, passwords, ai/
├── ai/                  graph/ (LangGraph TurnEngine), plan/ (interview plans), runtime/ (LiveKit agent
│                        session + manager + GraphLLM adapter), sandbox/ (exercise generation), prompts/
└── websocket/           per-session connection manager for voice telemetry
```

## Routes (`/api/v1`)

| Router | Endpoints |
| --- | --- |
| `auth` | `POST auth/register`, `auth/login`, `auth/refresh`, `auth/logout`; `GET auth/me` |
| `me` | `GET me`; `POST/GET/DELETE me/avatar` |
| `organizations` | `POST organizations`, `organizations/applications`; `GET organizations/applications/mine`; `GET admin/organizations/pending`; `POST admin/organizations/{id}/verify`, `/reject`; `GET organizations/current`; `POST current/units`; `GET/POST current/members`; `POST current/members/{id}/roles`; `GET current/audit`; `GET/PUT/DELETE current/email-templates[/{key}]` |
| `packs` | `GET/POST domain-packs`, `GET/PATCH/DELETE domain-packs/{id}`; `POST organizations/current/domain-packs/activations`; `GET …/active` |
| `workflows` | `GET workflows/components`, `GET/POST workflows`, `GET workflows/current` (alias `active`), `PUT workflows/current` |
| `postings` | `GET/POST postings`, `GET/PATCH postings/{id}`, `POST {id}/publish` (runs matching), `GET {id}/matches`, `POST {id}/close`, `POST {id}/question-pool/generate`, `PATCH {id}/question-pool`, `POST {id}/question-pool/lock`, `POST postings/generate-description` |
| `jobs` | `GET jobs`, `jobs/{id}`; `POST applications`; `GET candidates/me/matches`, `me/applications`, `me/applications/{id}/timeline`; `POST me/applications/{id}/withdraw`; `GET/PATCH responses/POST submit` on `me/applied-interviews/{id}` |
| `candidates` | `GET/PATCH candidates/me/profile`, `POST me/cv/upload`, `POST me/cv/parse`, `PUT me/consents/{purpose}`, `GET/POST me/profile-interview-attempts`; `GET profile-interview-attempts/{id}`, `PATCH …/responses`, `POST …/submit` |
| `voice_interviews` | For both `…/profile-interview-attempts/{id}/voice` and `…/applied-interviews/{id}/voice`: `GET` status, `POST identity-check`, `POST livekit`, `POST start`, `POST complete`, **WS** `telemetry` |
| `sandbox` | `candidates/me/applied-interviews/{id}/sandbox`: `GET`, `POST start`, `PUT progress`, `POST violations`, `POST recording`, `POST submit` |
| `pipeline` | `GET pipeline`, `GET applications/{id}`, `POST applications/{id}/transitions`, `POST pipeline/bulk-transition`, `POST pipeline/applications/{id}/undo-transition`, `POST pipeline/screen-received`, `pipeline/shortlist`, `pipeline/invite-interviews`, `POST applications/{id}/applied-interview-invitations`, `/scorecards`, `/decision`, `GET applications/{id}/candidate-avatar`, `GET analytics/pipeline` |
| `analytics` | `GET analytics/overview`, `funnel`, `velocity`, `sources`, `fairness`, `calibration` |
| `automations` | `GET/POST automations`, `GET/PUT/DELETE automations/{id}`, `POST {id}/toggle`, `POST {id}/test` (dry run only; no live executor yet) |
| `messages` | `GET/POST conversations`, `GET candidates/me/conversations`, `GET conversations/by-application/{id}`, `GET conversations/{id}`, `GET/POST conversations/{id}/messages`, `POST conversations/{id}/read` |
| `notifications` · `search` · `storage` | `GET notifications`, `POST notifications/mark-read`; `GET search`, `talent`, `packs/catalog`; `POST storage/presigned-url` |
| `router.py` | `POST interviews/token` (room-scoped LiveKit token), `POST ai/interview-questions` |

### Voice telemetry WebSocket
- **Server → client events:**
  - setup steps: `connecting_to_room`, `generating_persona`, `initializing_agents`
  - `interviewer_identity`, `transcript_history`, `new_transcript_message`
  - `agent_speech_started`/`ended`, `user_speech_started`/`ended`
  - `agent_turn_pending`, `agent_turn_cleared`, `user_turn_granted`
- **Client → server:** `user_requested_end`. `user_audio_activity` is accepted as a keepalive.

## AI behaviour without a key

| Feature | Fallback |
| --- | --- |
| CV parse | Heuristic parser |
| Embeddings / matching | `local-hash-v1` hash embedding + skill overlap |
| Job description | Template |
| Sandbox content / grading | Built-in problem bank / keyword coverage |
| Rejection feedback | Heuristic |
| Identity check | `unavailable` (non-blocking) |
| Question-pool generator | `status="disabled"` |
| Turn assessment / interview plan | Word-count heuristic / template plan |
| Voice start | `503` with a clear configuration error |

## Authentication

- Register and login return a JWT **access token** (HS256, 15 min) and an opaque **refresh token**. The refresh token is hashed at rest and rotated on each refresh.
- Clients send `Authorization: Bearer <access>`.
- In `development` and `test` only, `X-Development-Identity` (a constrained opaque ID) works as a fallback when no Bearer token is sent. In `staging` and `production`, caller-chosen identity is refused.
- Organizations register through `POST organizations/applications`, which creates a pending org. A superadmin then verifies or rejects it. `THOS_AUTO_VERIFY_ORGANIZATIONS=true` skips that step in development.

## Error contract

```json
{
  "error": {
    "code": "integration_not_configured",
    "message": "LiveKit is not configured for this environment.",
    "request_id": "6f4f06b3-c622-4663-a677-d654f25ee42b",
    "details": []
  }
}
```

Incoming request and correlation IDs are propagated only when they are valid UUIDs.

## Testing

```powershell
uv run pytest            # ~100 tests; each uses a temporary SQLite database
uv run ruff check .
python scripts/smoke.py http://127.0.0.1:8000   # end-to-end smoke against a running server
```

**What the suite covers:**
- health and request IDs
- auth and org onboarding
- tenant isolation
- workflows and packs
- CV upload, parsing and matching
- AI helpers and job descriptions
- pipeline automation (screen, shortlist, invite, feedback)
- the full hiring loop
- profile interviews and identity/emails
- LiveKit tokens and voice configuration
- the interview engine (plan generator + turn engine)
- the GraphLLM adapter
- the sandbox flow and sandbox content

`test_postgres.py` runs against `postgresql://thos:thos@localhost:5433/thos` and skips when it can't connect.
