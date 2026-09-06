---
kind: build_system
name: Multi-Project Build & Local Dev Orchestration (Hatch, Next.js, Docker Compose)
category: build_system
scope:
    - '**'
source_files:
    - Backend/pyproject.toml
    - Backend/.env.example
    - Backend/README.md
    - Frontend/package.json
    - Frontend/vitest.config.ts
    - Frontend/.env.example
    - pts/backend/Dockerfile
    - pts/backend/requirements.txt
    - infrastructure/local/docker-compose.yml
    - livekit-docker-compose.yml
---

## What system/approach is used

The repository is a multi-project monorepo with no top-level build orchestration tool. Each sub-application manages its own build and packaging independently:

- **THOS Backend** (`Backend/`): Python FastAPI app built with **Hatchling** (`pyproject.toml`, `build-backend = "hatchling.build"`). Dependencies are declared in `[project]` and dev-only dependencies in `[dependency-groups]`. The wheel package targets the `app/` directory.
- **PTS Backend** (`pts/backend/`): A separate FastAPI application using **pip + `requirements.txt`** (pinned versions) and a standalone `Dockerfile` that installs into an isolated `/opt/venv` virtual environment.
- **THOS Frontend** (`Frontend/`): **Next.js 15** App Router project. Build/dev/test/lint/typecheck scripts are defined in `package.json` (`next build`, `next dev`, `vitest run`, `eslint .`, `tsc --noEmit`).
- **PTS Frontend** (`pts/frontend/`): Another independent Next.js application with its own `package.json`, `next.config.ts`, and `postcss.config.mjs`.

Local infrastructure services (PostgreSQL with pgvector, LiveKit + Redis) are composed via **Docker Compose** files at `infrastructure/local/docker-compose.yml` and `livekit-docker-compose.yml`.

There is no CI/CD pipeline definition (no `.github/workflows`, no Jenkinsfile, no GitLab CI). No Makefile or shell wrapper exists at the repository root.

## Key files and packages

- `Backend/pyproject.toml` — Hatch build config, dependency declarations, pytest and ruff tooling.
- `Backend/.env.example` — All runtime configuration keys prefixed with `THOS_`; documents defaults and environment-specific behavior.
- `Backend/README.md` — Documents local setup: `docker compose -f infrastructure/local/docker-compose.yml up -d`, then running the backend (uvicorn).
- `Frontend/package.json` — Next.js scripts, dependencies, and devDependencies; `vitest.config.ts` configures jsdom-based unit tests.
- `Frontend/.env.example` — `NEXT_PUBLIC_API_URL` and server-only `BACKEND_API_URL` for the LiveKit token proxy.
- `pts/backend/Dockerfile` — Multi-stage-style single-stage image based on `python:3.13-slim`, installs `requirements.txt`, runs `uvicorn app.main:app` on port 8000.
- `pts/backend/requirements.txt` — Pinned dependency list for the PTS backend.
- `infrastructure/local/docker-compose.yml` — Defines the `thos-local` project with a `pgvector/pgvector:pg17` service named `thos-postgres`, health-checked via `pg_isready`.
- `livekit-docker-compose.yml` — Standalone compose file spinning up `redis:7-alpine` and `livekit/livekit-server:latest` with a hardcoded dev key.

## Architecture and conventions

- **Per-app build manifests**: Each application owns its own dependency and build declaration. There is no shared lockfile or workspace manager across the two backends or between frontend/backend.
- **Environment variables as configuration boundary**: Both backends rely on environment variables rather than config files at runtime. The THOS backend enforces a `THOS_` prefix convention documented in `Backend/.env.example`; optional integrations (SMTP, LiveKit, AI providers) stay disabled when unset and return safe “not configured” responses instead of failing startup.
- **Database fallback strategy**: The THOS backend defaults to PostgreSQL (via `THOS_DATABASE_URL`) but falls back to SQLite (`THOS_DATABASE_PATH=./data/thos.db`) when the URL is unset, enabling unit tests to run without a live database.
- **Domain packs as externalized configuration**: The path to domain pack manifests is configurable via `THOS_DOMAIN_PACKS_PATH=../domain-packs`, keeping pack definitions outside the backend package.
- **Local-first deployment model**: The only containerization present is for development/runtime composition. The THOS backend is intended to be run directly from source (the README instructs starting Postgres via docker compose and then running the app), while the PTS backend ships a `Dockerfile` suitable for container deployment.
- **No cross-component build**: The frontend does not invoke the backend build, and vice versa. They are started as separate processes during development.

## Conventions and constraints

- **Python version pinning**: The THOS backend requires `requires-python = ">=3.13,<3.14"`; the PTS Dockerfile uses `python:3.13-slim`. Both backends target Python 3.13.
- **Dependency management style differs per app**: THOS Backend uses declarative `pyproject.toml` with Hatchling; PTS Backend uses pinned `requirements.txt`. This is an observed convention, not enforced centrally.
- **Linting/formatting per project**: THOS Backend uses Ruff (`tool.ruff.lint.select = ["E", "F", "I", "UP", "B", "SIM"]`, line length 100); Frontend uses ESLint (`eslint.config.mjs`) and TypeScript type checking via `tsc --noEmit`.
- **Test runner per project**: THOS Backend uses pytest (`[tool.pytest.ini_options]`, testpaths `tests`); Frontend uses Vitest with jsdom environment and a `tests/setup.ts` setup file.
- **Configuration safety rule**: Optional third-party integrations (SMTP, LiveKit, AI providers) must remain disabled when their env vars are unset — the code returns safe “not configured” responses rather than raising at startup. This is documented in `Backend/.env.example` and enforced by the backend’s configuration loading.
- **Development identity bypass**: In development mode, authentication can be bypassed via the `X-Development-Identity` header; this is ignored in staging/production where real auth is required (documented in `Backend/.env.example`).
- **No CI/CD**: No continuous integration or automated release pipeline is present in the repository. Artifacts are produced locally via `hatch` (backend wheel) and `next build` (frontend static output).