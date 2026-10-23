# THOS

**Talent & Hiring Operating System** is an AI-assisted, multi-tenant applicant tracking system for employer hiring teams and candidates. It has three parts:

- a FastAPI backend
- a Next.js web app with an employer workspace and a candidate portal
- AI voice interviews and proctored skill assessments that run on LiveKit and OpenAI

Industry-specific behaviour comes from swappable **domain packs** (Education and Software Engineering today).

> **Status — October 2026: working local pilot.** The full hiring loop runs end to end on a developer machine:
> organization onboarding → job + locked question pool → candidate application → AI screening → voice interview → proctored sandbox → human review and decision.
>
> AI assists with questions, evidence, scores and summaries. Final hiring decisions are always human actions, recorded with an audit trail. See [`prd.md`](prd.md) for the per-requirement build status.

## What is built

**Navigation (both personas)**
- An icon rail, with bottom tabs and a **More** sheet on phones.
- A command palette (⌘/Ctrl K) and a notifications panel in the topbar.
- Light and dark themes.
- Interviews and the sandbox open in a distraction-free **focus layout** with no app navigation.

**Employer workspace**
- A **Today** dashboard: stat tiles, an agenda (Now / Today / Recent) and charts (funnel, stage mix, trend, score distribution).
- A **requisitions panel** beside Home and Pipeline, listing every posting with its stage mix. It can be toggled and remembers its state.
- Job authoring, including AI job-description generation, an AI question-pool generator, curation and locking. New jobs are created in a drawer.
- A pipeline with **Funnel**, **Board** and **Table** views, with:
  - drag and drop on the Board, and a per-card "Move stage" select for keyboard users
  - bulk moves and undo
  - auto-screen, shortlist and invite actions
  - an application drawer with scorecards and the decision
- Talent discovery.
- Analytics: funnel, SLA & bottlenecks, and fairness & calibration.
- Automation rules, which can be built and dry-run.
- Messaging and notifications.
- Administration: units, members, roles, domain packs, workflows, email templates and the audit log.

**Candidate portal**
- A home page that leads with the next step.
- Profile and privacy consents, with a profile photo.
- CV upload: PDF, DOCX or text, which is parsed into the profile.
- Job discovery and applications.
- An application **journey** card per application (Received → Under review → Interview → Decision).
- Messages.
- Voice **Skill screening** (profile screening): retakeable, with a cooldown.
- Voice **Job interviews** from an employer's locked pool, plus a **proctored sandbox** (coding or written exercise, with webcam recording and violation tracking).

**Platform**
- Multi-tenant organizations with units, memberships and role checks. Every tenant-owned query is scoped to its tenant.
- The organization sign-up and verification flow, with superadmin approval.
- JWT access tokens plus refresh tokens. Request IDs, idempotency keys and append-only audit records.
- Matching on embeddings plus skill overlap, which only includes candidates who have given consent.
- Stage-change emails through SMTP. Without SMTP configured they are logged to the console.

## Architecture

```text
 Browser ──► Next.js 15 / React 19 (Frontend/)
   │            employer routes · candidate routes · /api/interviews/token proxy
   │ HTTP JSON (Bearer JWT)            │ WebSocket telemetry      │ WebRTC media
   ▼                                   ▼                          ▼
 FastAPI · Python 3.13 (Backend/) ◄──────────────────────► LiveKit server
   api/v1 routers → services → db/store (tenant-scoped SQL)      ▲
   ai/: LangGraph turn engine · plan generator · sandbox content  │ backend joins room as
   │                                                              │ the AI interviewer
   ├─► PostgreSQL 17 + pgvector  (SQLite fallback for tests)      │ (Silero VAD → OpenAI STT
   ├─► OpenAI (chat, embeddings, STT, TTS, vision) — optional     │  → turn engine → OpenAI TTS)
   ├─► SMTP (optional) · S3-compatible storage (optional)         │
   └─► domain-packs/*.json (Education, Software Engineering) ─────┘
```

- The backend is the authority for authentication, authorization, tenancy, workflow transitions and persistence.
- The frontend never holds LiveKit or OpenAI secrets.
- Full details are in [`architecture.md`](architecture.md).

## Repository map

```text
.
├── Backend/                   FastAPI app (app/), tests/, scripts/smoke.py, pyproject.toml, uv.lock
│   └── app/
│       ├── api/v1/            HTTP + WebSocket routers (auth, postings, pipeline, sandbox, voice…)
│       ├── services/          Business services (matching, CV, mail, sandbox, voice, identity…)
│       ├── ai/                graph/ (LangGraph turn engine), plan/, runtime/ (LiveKit agent), sandbox/, prompts/
│       ├── db/                database.py (Postgres/SQLite + schema), store.py (queries), seed.py
│       └── domain/            stages, permissions, evaluation rules
├── Frontend/                  Next.js App Router app, components, styles (design tokens), Vitest + Playwright tests
├── domain-packs/              education/ and software-engineering/ manifests
├── infrastructure/local/      PostgreSQL 17 + pgvector Docker Compose (host port 5433)
├── docker-compose.yml         Optional local LiveKit server + Redis (livekit-docker-compose.yml is a copy)
├── livekit.yaml               Local LiveKit server config (dev key/secret)
├── prd.md                     Product requirements and build status
├── architecture.md            As-built technical architecture and planned evolution
├── design.md                  Design system, tokens, responsive layout rules
├── phases.md                  Roadmap, phase gates, decision log
├── implementation-plan.md     Build sequence and vertical-slice status
├── rules.md                   Binding engineering and governance rules
└── THOS_Development_Spec.md   Original consolidated spec (historical reference)
```

## Requirements

- Python 3.13 (the backend requires `>=3.13,<3.14`) and [`uv`](https://docs.astral.sh/uv/)
- Node.js 20.9+ and npm 10+
- Docker Desktop with Docker Compose
- Optional: an OpenAI API key, plus LiveKit (local via Docker or LiveKit Cloud) for voice interviews

## Quickstart (Windows PowerShell; the same commands work in bash)

Run each long-lived process in its own terminal from the repository root.

### 1. Start PostgreSQL

```powershell
docker compose -f infrastructure/local/docker-compose.yml up -d
docker compose -f infrastructure/local/docker-compose.yml ps
```

The container listens on **host port 5433**, which avoids clashing with a locally installed Postgres. The user, password and database are all `thos`.
URL: `postgresql://thos:thos@localhost:5433/thos`.

### 2. Backend

```powershell
cd Backend
Copy-Item .env.example .env      # then add THOS_AI_API_KEY / LiveKit values if you have them
uv sync --dev
uv run uvicorn app.main:app --reload --port 8000
```

- API: `http://127.0.0.1:8000`
- Swagger UI: `/docs`
- Health checks: `/health/live` and `/health/ready`

On first start the schema is created and, in development, demo data is seeded into an empty database (`THOS_SEED_DEMO_DATA=true`).

### 3. Frontend

```powershell
cd Frontend
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` and sign in with a demo account.

### 4. (Optional) Voice interviews

```powershell
docker compose up -d     # LiveKit on :7880 + Redis
```

Set the following in `Backend/.env`:
- `THOS_LIVEKIT_URL=ws://localhost:7880`
- `THOS_LIVEKIT_API_KEY=devkey`
- `THOS_LIVEKIT_API_SECRET=<secret from livekit.yaml>`
- `THOS_AI_API_KEY`

Without these values, voice endpoints return a clear `503`. Everything else keeps working.

## Demo accounts

Every seeded account uses the password `Password123!`.

| Email | Role | Organization |
| --- | --- | --- |
| `superadmin@thos.local` | Platform superadmin (verifies organizations) | — |
| `ayesha.khan@nut.edu.pk` | Owner / administrator | National University of Technology |
| `bilal.hassan@nut.edu.pk` | Recruiter | National University of Technology |
| `samira.iqbal@nut.edu.pk` | Hiring manager | National University of Technology |
| `tariq.mahmood@riverside.edu.pk` | Owner / administrator | Riverside College |
| `hira.ahmed@gmail.com` | Candidate (has an evaluated job interview + sandbox) | — |
| `omar.farooq@gmail.com` | Candidate | — |
| `daniyal.raza@gmail.com`, `nadia.omar@gmail.com`, `mahnoor.waheed@gmail.com` | Candidates | — |

**Seeded postings:**
- Assistant Professor, Computer Science
- Lecturer, Data Science
- Visiting Faculty, Cybersecurity (draft)
- Lecturer, Business Analytics (Riverside)

## Application routes

| Area | URL | Persona |
| --- | --- | --- |
| Sign in / register | `/login`, `/register` | Public |
| Organization application | `/register/organization` | Public |
| Employer dashboard (Today) | `/` | Employer |
| Jobs, job detail and question pool | `/jobs`, `/jobs/<postingId>` | Employer |
| Pipeline (funnel, board, table) | `/pipeline` | Employer |
| Talent discovery | `/talent` | Employer |
| Analytics | `/analytics` | Employer |
| Messages | `/messages` | Employer |
| Automations | `/automations` | Employer admin |
| Administration | `/admin` | Employer admin |
| Candidate overview | `/candidate` | Candidate |
| Find jobs / my applications | `/candidate/jobs`, `/candidate/applications` | Candidate |
| Messages | `/candidate/messages` | Candidate |
| Profile & privacy | `/candidate/profile` | Candidate |
| Skill screening (voice) | `/candidate/interview` | Candidate |
| Job interview (voice) | `/candidate/applied/<attemptId>` | Candidate |
| Proctored sandbox | `/candidate/sandbox/<attemptId>` | Candidate |
| Legacy LiveKit lobby | `/interviews/<roomName>` | — |

## Configuration

Backend settings live in [`Backend/.env.example`](Backend/.env.example) and frontend settings in [`Frontend/.env.example`](Frontend/.env.example). Never commit `.env` or `.env.local`.

| Backend variable | Purpose |
| --- | --- |
| `THOS_DATABASE_URL` | PostgreSQL URL. When it is unset, SQLite at `THOS_DATABASE_PATH` is used. |
| `THOS_CORS_ORIGINS` | Comma-separated list of allowed origins. A `*` wildcard is rejected outside development. |
| `THOS_JWT_SECRET`, `THOS_JWT_*_TTL_SECONDS` | Token signing secret and lifetimes |
| `THOS_SUPERADMIN_EMAILS` | Emails that get platform superadmin |
| `THOS_SEED_DEMO_DATA` | Seed an empty development database |
| `THOS_DOMAIN_PACKS_PATH` | Manifest directory (`../domain-packs`) |
| `THOS_SMTP_*`, `THOS_PUBLIC_BASE_URL` | Outbound email. An empty host means mail is logged to the console. |
| `THOS_S3_ENDPOINT`, `THOS_S3_ACCESS_KEY`, `THOS_S3_SECRET_KEY`, `THOS_S3_BUCKET_NAME`, `THOS_S3_REGION` | Optional S3 presigned uploads |
| `THOS_LIVEKIT_URL`, `THOS_LIVEKIT_API_KEY`, `THOS_LIVEKIT_API_SECRET` | Voice rooms and tokens |
| `THOS_AI_API_KEY`, `THOS_AI_MODEL`, `THOS_EMBEDDING_MODEL` | OpenAI. It is the only supported provider. |
| `THOS_STT_MODEL`, `THOS_TTS_MODEL`, `THOS_TTS_VOICE`, `THOS_PLAN_GENERATION_MODEL`, `THOS_ANALYSIS_MODEL`, `THOS_TURN_ASSESSMENT_*` | Voice-interview runtime |
| `THOS_PROFILE_INTERVIEW_ATTEMPT_CAP`, `THOS_PROFILE_INTERVIEW_COOLDOWN_HOURS` | Retake policy for profile screening |

**Frontend variables:**
- `NEXT_PUBLIC_API_URL`: the browser API base URL.
- `BACKEND_API_URL`: the server-only URL for the LiveKit token proxy.
- `BACKEND_LIVEKIT_TOKEN_PATH`: an optional override for the token path.

### Running without an AI key

Most features have a deterministic fallback, so the app is fully demoable offline:

| Feature | With `THOS_AI_API_KEY` | Without |
| --- | --- | --- |
| CV parsing | LLM extraction | Heuristic parser |
| Embeddings / matching | `text-embedding-3-small` | Local hash embedding + skill overlap |
| Job description generator | LLM | Template |
| Sandbox problem + grading | LLM-generated / LLM-graded | Built-in problem bank, keyword-coverage scoring |
| Rejection feedback | LLM | Heuristic |
| Identity photo check | Vision model | Recorded as "unavailable" (never blocks) |
| Question-pool generator | LLM | Returns `disabled` |
| Voice interviews | OpenAI STT/TTS + turn assessment | `503 integration_not_configured` |

## Testing

```powershell
cd Backend
uv run pytest                 # ~100 tests on isolated temp SQLite DBs; test_postgres.py skips if Postgres is unreachable
uv run ruff check .
python scripts/smoke.py http://127.0.0.1:8000   # backend must be running

cd ..\Frontend
npm test                      # Vitest
npm run typecheck
npm run lint
npm run build
npm run check:colors          # no hard-coded colours outside the design tokens

# End-to-end (Playwright): needs the backend on :8000 and `npm run dev` on :3000,
# or set PW_START_SERVERS=1 to have Playwright start both (backend on Backend/data/e2e.db).
npx playwright install chromium   # once
npm run e2e                   # layout rules + parity specs, 5 viewports × light/dark
npm run e2e:layout            # layout rules only
npm run e2e:capture           # screenshots to e2e/__screens__/ (gitignored)
```

The e2e suite is read-only: it blocks every mutating API call, so it never changes data. See [`Frontend/README.md`](Frontend/README.md#testing) for details.

## API overview

The versioned API is under `/api/v1`. Use `/docs` for the full schemas. The router map is in [`Backend/README.md`](Backend/README.md).

| Group | What it covers |
| --- | --- |
| Identity and organizations | `auth`, `me` (with avatar), organizations, applications and verification, units, members, audit, email templates |
| Configuration | `domain-packs` and activation, `workflows` |
| Hiring | `postings` (generate description, question pool generate/curate/lock, publish, matches, close), `jobs`, `applications` |
| Pipeline | `pipeline` transitions, bulk moves and undo, screening, shortlist, invitations, scorecards, decisions |
| Candidates | profile, CV upload and parse, consents, matches, applications, timelines, withdraw |
| Interviews | profile-interview attempts, applied interviews, `/voice` (status, identity-check, livekit, start, complete, WebSocket telemetry), sandbox (start, progress, violations, recording, submit) |
| Operations | `analytics/*`, `automations` (CRUD, toggle, dry-run test), `conversations`/messages, `notifications`, `search`, `talent`, `storage/presigned-url` |

## Engineering rules (summary)

- Domain knowledge belongs in domain packs, not in engine code.
- Every stage change goes through the canonical transition command, so it is authorized and audited.
- Every tenant-owned query and command carries a tenant scope.
- AI output is evidence. Humans own reject, offer and hire decisions.
- Every LLM feature needs a safe fallback or a clear "not configured" error.
- The frontend uses design tokens only, layouts must hold from 1280×620 CSS px upward, and `100dvh` replaces `100vh`. See [`design.md`](design.md).
- Never expose provider secrets to the browser or commit environment files.

The binding version is [`rules.md`](rules.md).

## Further reading

- [`prd.md`](prd.md): product goals, personas, requirements and build status
- [`architecture.md`](architecture.md): modules, data model, AI and voice pipeline, planned evolution
- [`design.md`](design.md): tokens, components, responsive and accessibility rules
- [`phases.md`](phases.md) and [`implementation-plan.md`](implementation-plan.md): roadmap, gates, decisions
- [`Backend/README.md`](Backend/README.md) and [`Frontend/README.md`](Frontend/README.md): per-app details

## License

Proprietary and internal software. No public license is granted.
