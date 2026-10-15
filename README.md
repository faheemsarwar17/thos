# THOS

**Talent & Hiring Operating System** is an AI-assisted, multi-tenant applicant tracking system for employer hiring teams and candidates. The repository contains a FastAPI backend, a Next.js employer/candidate application, PostgreSQL infrastructure, optional LiveKit voice interviews, and swappable domain packs.

> This repository is an internal pilot/MVP. AI can assist with questions, evidence, scoring, and summaries; final hiring decisions remain human actions recorded through the application workflow.

## What is included

- Employer workspace for dashboards, jobs, question pools, pipeline review, analytics, automations, messages, talent, administration, domain packs, workflows, and audit records.
- Candidate portal for profiles, consent, job discovery, applications, application timelines, messages, profile screening, applied interviews, and sandbox assessments.
- Multi-tenant organizations, units, memberships, role checks, tenant-scoped queries, canonical application transitions, idempotency, and request IDs.
- JWT access and refresh-token authentication, with a development-only persona fallback for local demos.
- Education and software-engineering domain-pack manifests in `domain-packs/`.
- Optional LiveKit WebRTC rooms and OpenAI-powered voice interview orchestration.
- PostgreSQL 17 with pgvector for local development; isolated SQLite-backed tests when a database URL is not supplied.

## Architecture

```text
Next.js 15 / React 19
        | HTTP JSON, server-side LiveKit token proxy, WebSocket telemetry
        v
FastAPI / Python 3.13
  auth, tenancy, jobs, applications, interviews, sandbox, analytics, AI helpers
        |                         |
        v                         v
PostgreSQL + pgvector       LiveKit + optional OpenAI services
```

The backend is the authority for authentication, authorization, tenancy, workflow transitions, persistence, and integration readiness. The frontend renders employer and candidate experiences and never stores LiveKit credentials.

## Repository map

```text
.
├── Backend/                   FastAPI app, database layer, services, tests, smoke test
├── Frontend/                  Next.js App Router app, components, client API, Vitest tests
├── domain-packs/              JSON manifests for education and software engineering
├── infrastructure/local/      PostgreSQL + pgvector Docker Compose definition
├── docker-compose.yml         Optional local LiveKit server and Redis
├── livekit.yaml               LiveKit server configuration
├── architecture.md            Technical architecture
├── design.md                  UX, accessibility, and design tokens
├── implementation-plan.md     Delivery sequence
├── phases.md                  Roadmap and phase gates
├── prd.md                     Product requirements
├── rules.md                   Binding engineering and governance rules
└── THOS_Development_Spec.md   Consolidated development specification
```

## Requirements

- Python 3.13 (the backend requires `>=3.13,<3.14`)
- [`uv`](https://docs.astral.sh/uv/)
- Node.js 20.9 or newer and npm 10 or newer
- Docker Desktop with Docker Compose

## Quickstart

Run each long-lived process in its own terminal from the repository root.

### 1. Start PostgreSQL

```powershell
docker compose -f infrastructure/local/docker-compose.yml up -d
docker compose -f infrastructure/local/docker-compose.yml ps
```

The local database uses `thos` as the user, password, and database name, on port `5432`. Its default URL is `postgresql://thos:thos@localhost:5432/thos`.

### 2. Configure and start the backend

```powershell
cd Backend
Copy-Item .env.example .env
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000
```

The API is available at `http://127.0.0.1:8000`.

- OpenAPI UI: `http://127.0.0.1:8000/docs`
- Liveness: `http://127.0.0.1:8000/health/live`
- Readiness: `http://127.0.0.1:8000/health/ready`

In development, an empty database is seeded automatically when `THOS_SEED_DEMO_DATA=true`.

### 3. Configure and start the frontend

In a second terminal:

```powershell
cd Frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

| Area | URL |
| --- | --- |
| Employer dashboard | `/` |
| Jobs and question pools | `/jobs` |
| Pipeline | `/pipeline` |
| Analytics | `/analytics` |
| Administration | `/admin` |
| Candidate portal | `/candidate` |
| Candidate jobs | `/candidate/jobs` |
| Candidate applications | `/candidate/applications` |
| Profile screening | `/candidate/interview` |
| LiveKit room lobby | `/interviews/<roomName>` |

## Demo access

All seeded accounts use the password `Password123!`.

| Email | Role |
| --- | --- |
| `superadmin@thos.local` | Platform superadmin |
| `ayesha.khan@nut.edu.pk` | Organization administrator |
| `bilal.hassan@nut.edu.pk` | Recruiter |
| `samira.iqbal@nut.edu.pk` | Hiring manager |
| `tariq.mahmood@riverside.edu.pk` | Organization administrator |
| `hira.ahmed@gmail.com` | Candidate |
| `omar.farooq@gmail.com` | Candidate |

The frontend includes a development persona switcher. The backend accepts `X-Development-Identity` only in development/test scenarios; production must use server-derived authentication.

## Configuration

Backend settings are in [`Backend/.env.example`](Backend/.env.example), and frontend settings are in [`Frontend/.env.example`](Frontend/.env.example). Never commit `.env` or `.env.local`.

Important backend settings:

| Variable | Purpose |
| --- | --- |
| `THOS_DATABASE_URL` | PostgreSQL connection string; falls back to SQLite when unset |
| `THOS_CORS_ORIGINS` | Comma-separated frontend origin allowlist |
| `THOS_JWT_SECRET` | JWT signing secret; replace the development value outside local work |
| `THOS_SEED_DEMO_DATA` | Seed demo data on an empty development database |
| `THOS_DOMAIN_PACKS_PATH` | Domain-pack manifest directory, normally `../domain-packs` from `Backend/` |
| `THOS_LIVEKIT_URL`, `THOS_LIVEKIT_API_KEY`, `THOS_LIVEKIT_API_SECRET` | LiveKit token issuance and voice rooms |
| `THOS_AI_API_KEY` | OpenAI-backed question generation and voice interview processing |

Frontend settings:

- `NEXT_PUBLIC_API_URL` — browser API base URL, normally `http://localhost:8000`.
- `BACKEND_API_URL` — server-only backend URL used by the LiveKit token proxy.
- `BACKEND_LIVEKIT_TOKEN_PATH` — optional backend token endpoint override.

### Optional LiveKit

The web application and backend run without voice integrations. To run the local LiveKit server and Redis:

```powershell
docker compose up -d
```

Set the `THOS_LIVEKIT_*` values in `Backend/.env`; voice interviews also require `THOS_AI_API_KEY`. Missing integration configuration is reported as a safe API error rather than failing backend startup. For LiveKit Cloud, use the project URL and credentials instead of the local compose service.

## Testing and quality checks

Backend tests use isolated temporary databases by default:

```powershell
cd Backend
uv run pytest
uv run ruff check .
python scripts/smoke.py http://127.0.0.1:8000  # backend must be running
```

Frontend checks:

```powershell
cd Frontend
npm test
npm run typecheck
npm run lint
npm run build
```

The smoke test exercises health checks, seeded employer data, tenant isolation, candidate profiles, profile interviews, applications, timelines, and authorization boundaries.

## API overview

The versioned API is under `/api/v1`. Main areas are:

- `auth`, `me`, organizations, memberships, units, audit records, and domain-pack activation
- workflows, postings, question-pool generation/curation/locking, jobs, applications, and pipeline transitions
- candidate profiles, consents, profile/applied interviews, scorecards, sandbox attempts, and timelines
- analytics, notifications, messages, automations, storage, search, and AI question generation
- LiveKit token issuance plus voice-session lifecycle and telemetry WebSockets

Use `/docs` for the complete schemas and endpoint contracts. Backend-specific route and error details are in [`Backend/README.md`](Backend/README.md); frontend behavior and token-proxy details are in [`Frontend/README.md`](Frontend/README.md).

## Engineering rules

- Keep domain-specific knowledge in domain packs, not in the core engine.
- Route application stage changes through the canonical transition command so audit and authorization checks are preserved.
- Include tenant scope in tenant-owned persistence and service operations.
- Treat AI output as assistive evidence; human actors own final hiring decisions.
- Preserve keyboard-accessible alternatives for interactive pipeline controls.
- Do not expose provider secrets in browser code or commit local environment files.

See [`rules.md`](rules.md) for the binding constraints and [`architecture.md`](architecture.md) for the system design.

## Further reading

- [`prd.md`](prd.md) — product goals, personas, and requirements
- [`design.md`](design.md) — visual system and accessibility guidance
- [`implementation-plan.md`](implementation-plan.md) — implementation sequence
- [`phases.md`](phases.md) — milestones and delivery gates
- [`THOS_Development_Spec.md`](THOS_Development_Spec.md) — consolidated technical reference

## License

This is proprietary/internal software. No public license is granted.
