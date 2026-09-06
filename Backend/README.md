# THOS Backend

FastAPI backend implementing the THOS pilot MVP: multi-tenant organizations and roles, Education domain pack activation, versioned hiring workflows, candidate profiles and consent, **Profile Screening** and **Job Interview** voice sessions (LiveKit + OpenAI Realtime, ported from PTS) with anti-hallucination post-session scoring, job postings with locked question pools, idempotent applications, the canonical pipeline transition command with audit, reviewer scorecards, notifications, and schema-validated LangChain helpers.

Persistence uses **PostgreSQL** by default (`THOS_DATABASE_URL`). The store layer (`app/db`) stays engine-neutral with `?` placeholders; a thin adapter translates them for psycopg. Every tenant-owned query carries an explicit `tenant_id` predicate. Unit tests still use a temporary SQLite file so they stay isolated and dependency-free.

Authentication uses **JWT access tokens** plus opaque **refresh tokens** (hashed at rest). Register/login return both; clients send `Authorization: Bearer <access>`. In development/test only, `X-Development-Identity` remains a fallback when no Bearer token is present.

## Requirements

- Python 3.13
- Docker (for local PostgreSQL)
- [`uv`](https://docs.astral.sh/uv/) (recommended) or another `pyproject.toml`-compatible installer

## Setup

```sh
# 1. Start PostgreSQL
docker compose -f infrastructure/local/docker-compose.yml up -d

# 2. Configure and run the API
cd Backend
cp .env.example .env
uv sync --dev
uv run uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`; OpenAPI docs are at `/docs`. On first start the schema is created and demo data is seeded into Postgres.

### Demo accounts (password `Password123!`)

| Email | Role |
|---|---|
| `superadmin@thos.local` | Platform superadmin (verify organizations) |
| `ayesha.khan@nut.edu.pk` | Administrator · National University |
| `bilal.hassan@nut.edu.pk` | Recruiter |
| `samira.iqbal@nut.edu.pk` | Hiring manager |
| `tariq.mahmood@riverside.edu.pk` | Administrator · Riverside College |
| `hira.ahmed@gmail.com` | Candidate |
| `omar.farooq@gmail.com` | Candidate |

## Configuration

Copy `.env.example` to `.env`. Every setting uses the `THOS_` prefix. Secrets are optional at startup and are required only when the corresponding integration is called.

- `THOS_DATABASE_URL` — PostgreSQL connection string (default in `.env.example`). When unset, `THOS_DATABASE_PATH` (SQLite) is used instead.
- `THOS_JWT_SECRET`, `THOS_JWT_ACCESS_TTL_SECONDS`, `THOS_JWT_REFRESH_TTL_SECONDS` — auth tokens
- `THOS_SUPERADMIN_EMAILS` — emails that receive platform admin on register/seed
- `THOS_CORS_ORIGINS` is a comma-separated allowlist. Wildcard CORS is rejected outside development.
- LiveKit token issuance and voice interviews require `THOS_LIVEKIT_URL`, `THOS_LIVEKIT_API_KEY`, and `THOS_LIVEKIT_API_SECRET`.
- `THOS_AI_API_KEY` is required for Profile Screening / Job Interview voice agents (OpenAI Realtime + analysis). Without it, voice start returns `503` with a clear configuration error. Optional LangChain helpers also use this key.
- Voice runtime knobs (`THOS_CONVERSATION_MODEL`, `THOS_OPENAI_VOICE`, VAD/silence settings) are documented in `.env.example`. The `pts/` tree remains a reference implementation only.

Never commit `.env`; only `.env.example` belongs in source control.

## Auth routes

- `POST /api/v1/auth/register` — personal account
- `POST /api/v1/auth/login` — email + password → access + refresh
- `POST /api/v1/auth/refresh` — rotate refresh, new access
- `POST /api/v1/auth/logout` — revoke refresh
- `GET /api/v1/auth/me` — session profile
- `POST /api/v1/organizations/applications` — company registration (pending)
- `POST /api/v1/admin/organizations/{id}/verify|reject` — platform confirmation
- `POST /api/v1/organizations/current/members` — create staff on company domain

## Local PostgreSQL

```sh
docker compose -f infrastructure/local/docker-compose.yml up -d
docker compose -f infrastructure/local/docker-compose.yml ps
```

Defaults: user/password/database `thos`, port `5432`, URL `postgresql://thos:thos@localhost:5432/thos`.

## Routes

- `GET /health/live`, `GET /health/ready` — probes
- `GET /api/v1/me` — current user, memberships, and candidate ID
- `POST /api/v1/organizations`, `/organizations/{id}/units`, `/organizations/{id}/members` — tenancy administration
- `GET /api/v1/organizations/{id}/audit-records` — configuration and decision audit trail
- `GET /api/v1/domain-packs`, `POST /api/v1/organizations/{id}/domain-packs/activations` — pack registry
- `GET|POST /api/v1/workflows`, `POST /api/v1/workflows/{id}/publish` — versioned workflows
- `GET|PATCH /api/v1/candidates/me/profile`, `PUT /api/v1/candidates/me/consents/{purpose}` — candidate self-service
- `GET|POST /api/v1/candidates/me/profile-interview-attempts` — start/resume Profile Screening attempt
- `POST .../profile-interview-attempts/{id}/voice/{livekit,start,complete}` + WS `.../voice/telemetry` — Profile Screening voice session
- `GET|POST|PATCH /api/v1/postings`, `POST .../publish`, `POST .../close` — employer job lifecycle
- `POST /api/v1/postings/{id}/question-pool/*` — generate, curate, and lock Job Interview pools
- `GET /api/v1/jobs`, `POST /api/v1/applications` — candidate discovery and idempotent application
- `GET /api/v1/pipeline`, `POST /api/v1/applications/{id}/transitions` — pipeline query and canonical transition command
- `POST /api/v1/applications/{id}/applied-interview-invitations`, `POST /api/v1/applications/{id}/scorecards` — Job Interview invite and human review
- `POST .../applied-interviews/{id}/voice/{livekit,start,complete}` + WS `.../voice/telemetry` — Job Interview voice session
- `GET /api/v1/candidates/me/applications`, `GET .../applications/{id}/timeline` — candidate-facing status
- `GET /api/v1/analytics/pipeline` — tenant funnel counts
- `GET|POST /api/v1/notifications` — in-app notices
- `POST /api/v1/interviews/token` — short-lived room-scoped LiveKit token (legacy lobby)
- `POST /api/v1/ai/interview-questions` — structured interview question generation

Full schemas are on `/docs` (OpenAPI).

## Demo data

In `development`, an empty database is seeded on startup (`THOS_SEED_DEMO_DATA=true` by default) with two organizations, employer and candidate personas, a published workflow, postings, and in-flight applications. Identities match the persona switcher in the frontend (`local-developer`, `bilal-hassan`, `samira-iqbal`, `tariq-mahmood`, `hira-ahmed`, `omar-farooq`).

## Smoke test

With the server running:

```sh
python scripts/smoke.py http://127.0.0.1:8000
```

It exercises the full hiring loop through the public API, including tenant isolation and the candidate interview lifecycle.

## Temporary interview identity

Authentication integration is intentionally not fabricated in this foundation. In `development`, the token endpoint uses `THOS_DEVELOPMENT_IDENTITY`; a caller may override it with `X-Development-Identity` using only a constrained opaque identifier. In `test`, the fixed configured identity is used and the header is ignored. In `staging` and `production`, token issuance returns `501 authentication_not_configured` until a trusted authentication dependency supplies the server-derived identity. Caller-chosen identity is therefore never accepted in production.

## Error contract

Errors use one shape and include the opaque request ID:

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

Incoming request and correlation IDs are propagated only when they are valid UUIDs. Free-text values are replaced, preventing personal or sensitive caller data from entering request context.

## Validation

```sh
uv run pytest
uv run ruff check .
```
