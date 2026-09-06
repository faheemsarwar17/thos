# Getting Started

<cite>
**Referenced Files in This Document**
- [Backend README](file://Backend/README.md)
- [Frontend README](file://Frontend/README.md)
- [docker-compose.yml](file://infrastructure/local/docker-compose.yml)
- [Backend main application](file://Backend/app/main.py)
- [Backend configuration](file://Backend/app/core/config.py)
- [Backend seed data](file://Backend/app/db/seed.py)
- [Backend smoke test](file://Backend/scripts/smoke.py)
- [Backend package manifest](file://Backend/pyproject.toml)
- [Frontend environment example](file://Frontend/.env.example)
- [Frontend package manifest](file://Frontend/package.json)
</cite>

## Table of Contents
1. Introduction
2. Project Structure
3. Core Components
4. Architecture Overview
5. Detailed Component Analysis
6. Dependency Analysis
7. Performance Considerations
8. Troubleshooting Guide
9. Conclusion
10. Appendices

## Introduction
This guide helps you set up the ATS development environment end-to-end: install prerequisites, run a local PostgreSQL database with Docker, configure environment variables, start the backend and frontend servers, access API documentation, verify your setup with the smoke test, and understand the demo accounts for testing. It also outlines the development workflow for making changes to both backend and frontend components.

## Project Structure
The project is organized into three primary areas:
- Backend (FastAPI): Python-based API server with configuration, seeding, and services.
- Frontend (Next.js): TypeScript-based UI for employer and candidate personas.
- Infrastructure: Local Docker Compose file to run PostgreSQL.

```mermaid
graph TB
subgraph "Infrastructure"
PG["PostgreSQL (Docker)"]
end
subgraph "Backend"
API["FastAPI App<br/>app/main.py"]
CFG["Settings & Env<br/>app/core/config.py"]
SEED["Demo Data Seeder<br/>app/db/seed.py"]
end
subgraph "Frontend"
NEXT["Next.js Dev Server<br/>package.json scripts"]
ENV[".env.local / .env.example"]
end
NEXT --> API
API --> PG
API --> CFG
API --> SEED
NEXT --> ENV
```

**Diagram sources**
- [Backend main application:15-58](file://Backend/app/main.py#L15-L58)
- [Backend configuration:16-40](file://Backend/app/core/config.py#L16-L40)
- [Backend seed data:70-85](file://Backend/app/db/seed.py#L70-L85)
- [Frontend package manifest:5-11](file://Frontend/package.json#L5-L11)
- [Frontend environment example:1-12](file://Frontend/.env.example#L1-L12)

**Section sources**
- [Backend README:15-28](file://Backend/README.md#L15-L28)
- [Frontend README:18-26](file://Frontend/README.md#L18-L26)
- [docker-compose.yml:1-24](file://infrastructure/local/docker-compose.yml#L1-L24)

## Core Components
- Backend FastAPI app: Creates the app, registers CORS and request context middleware, includes routers, and seeds demo data on first start in development.
- Configuration: Loads settings from environment variables prefixed with THOS_, validates values, and exposes helpers for integrations like LiveKit and AI.
- Demo data seeder: Creates organizations, users, workflows, and domain packs when the database is empty; uses a stable demo password for all seeded identities.
- Frontend Next.js app: Provides employer and candidate interfaces, integrates with the backend via API URL, and proxies LiveKit token requests server-side.

Key responsibilities and entry points:
- Backend entrypoint: creates and returns the FastAPI app instance and wires lifecycle events.
- Settings: centralizes all runtime configuration, including database target, CORS origins, JWT tokens, and optional integrations.
- Seed: ensures consistent demo data for local development and tests.

**Section sources**
- [Backend main application:15-58](file://Backend/app/main.py#L15-L58)
- [Backend configuration:16-178](file://Backend/app/core/config.py#L16-L178)
- [Backend seed data:70-85](file://Backend/app/db/seed.py#L70-L85)
- [Frontend README:1-16](file://Frontend/README.md#L1-L16)

## Architecture Overview
At runtime, the frontend calls the backend’s REST API. The backend connects to PostgreSQL and optionally integrates with LiveKit and AI services based on configuration. In development, demo data is seeded automatically if the database is empty.

```mermaid
sequenceDiagram
participant Dev as "Developer"
participant FE as "Frontend (Next.js)"
participant BE as "Backend (FastAPI)"
participant DB as "PostgreSQL"
participant LK as "LiveKit (optional)"
participant AI as "AI Provider (optional)"
Dev->>BE : Start uvicorn
BE->>DB : Connect (database_url or SQLite)
BE->>BE : Seed demo data if empty (development)
Dev->>FE : npm run dev
FE->>BE : HTTP requests (e.g., /api/v1/*)
BE-->>FE : JSON responses
FE->>BE : POST /api/interviews/token (server proxy)
BE->>LK : Issue room token (if configured)
BE-->>FE : {server_url, token, identity}
FE->>LK : WebSocket connection (voice interview)
Note over BE,AI : Voice interviews require AI key and LiveKit config
```

**Diagram sources**
- [Backend main application:15-58](file://Backend/app/main.py#L15-L58)
- [Backend configuration:72-178](file://Backend/app/core/config.py#L72-L178)
- [Frontend README:28-47](file://Frontend/README.md#L28-L47)

## Detailed Component Analysis

### Prerequisites and Installation
- Python 3.13+ and uv are required for the backend.
- Node.js 20.9+ and npm 10+ are required for the frontend.
- Docker is used to run PostgreSQL locally.

Install steps:
- Install Python 3.13+, uv, Node.js, and Docker per your OS instructions.
- Verify installations by running version checks for each tool.

**Section sources**
- [Backend README:9-13](file://Backend/README.md#L9-L13)
- [Frontend README:11-16](file://Frontend/README.md#L11-L16)

### Start Local PostgreSQL with Docker
Run the provided compose file to start PostgreSQL with pgvector enabled.

Commands:
- Start the database: docker compose -f infrastructure/local/docker-compose.yml up -d
- Check status: docker compose -f infrastructure/local/docker-compose.yml ps

Defaults:
- User/password/database: thos/thos/thos
- Port: 5432
- Connection string format: postgresql://thos:thos@localhost:5432/thos

**Section sources**
- [docker-compose.yml:1-24](file://infrastructure/local/docker-compose.yml#L1-L24)
- [Backend README:67-74](file://Backend/README.md#L67-L74)

### Configure Environment Variables
- Backend: Copy .env.example to .env in the Backend directory. All backend settings use the THOS_ prefix. Key items include database URL, JWT secrets, CORS origins, and optional integrations (LiveKit, AI).
- Frontend: Copy .env.example to .env.local in the Frontend directory. Set NEXT_PUBLIC_API_URL and BACKEND_API_URL to point at your backend.

Important notes:
- Never commit .env or .env.local.
- In development, the backend accepts X-Development-Identity for persona switching.

**Section sources**
- [Backend README:42-54](file://Backend/README.md#L42-L54)
- [Backend configuration:16-40](file://Backend/app/core/config.py#L16-L40)
- [Frontend README:28-47](file://Frontend/README.md#L28-L47)
- [Frontend environment example:1-12](file://Frontend/.env.example#L1-L12)

### Start the Backend Server
Steps:
- Navigate to Backend.
- Ensure .env is present.
- Install dependencies with uv sync --dev.
- Run the server with hot reload: uv run uvicorn app.main:app --reload

What happens on first start:
- The app reads settings, sets up middleware, includes routers, and seeds demo data if the database is empty and running in development mode.

Access:
- API base: http://127.0.0.1:8000
- OpenAPI docs: http://127.0.0.1:8000/docs

**Section sources**
- [Backend README:15-28](file://Backend/README.md#L15-L28)
- [Backend main application:15-58](file://Backend/app/main.py#L15-L58)
- [Backend configuration:16-40](file://Backend/app/core/config.py#L16-L40)

### Start the Frontend Server
Steps:
- Navigate to Frontend.
- Ensure .env.local exists and points to the backend.
- Install dependencies: npm install
- Start dev server: npm run dev

Open:
- http://localhost:3000

Notes:
- The frontend proxies LiveKit token requests server-side to the backend endpoint configured by BACKEND_LIVEKIT_TOKEN_PATH (default path documented in the frontend README).

**Section sources**
- [Frontend README:18-26](file://Frontend/README.md#L18-L26)
- [Frontend README:28-47](file://Frontend/README.md#L28-L47)
- [Frontend package manifest:5-11](file://Frontend/package.json#L5-L11)

### Demo Accounts and Roles
All seeded demo accounts share the same password. Use these to log in or switch personas via the frontend persona switcher.

Accounts:
- superadmin@thos.local — Platform superadmin (verify organizations)
- ayesha.khan@nut.edu.pk — Administrator · National University
- bilal.hassan@nut.edu.pk — Recruiter
- samira.iqbal@nut.edu.pk — Hiring manager
- tariq.mahmood@riverside.edu.pk — Administrator · Riverside College
- hira.ahmed@gmail.com — Candidate
- omar.farooq@gmail.com — Candidate

Note:
- In development, the backend can accept X-Development-Identity to simulate different users without full auth flows.

**Section sources**
- [Backend README:30-40](file://Backend/README.md#L30-L40)
- [Backend seed data:95-112](file://Backend/app/db/seed.py#L95-L112)

### Verify Setup with the Smoke Test
Run the smoke test against the running backend to validate core flows:

Command:
- python scripts/smoke.py http://127.0.0.1:8000

What it exercises:
- Health readiness
- Employer identity and postings
- Pipeline and analytics endpoints
- Tenant isolation across pipelines
- Candidate job discovery and profile creation/update
- Profile interview attempt lifecycle
- Application submission and timeline retrieval
- Authorization boundaries for candidate vs employer endpoints

Exit behavior:
- Exits with non-zero status if any check fails.

**Section sources**
- [Backend README:105-113](file://Backend/README.md#L105-L113)
- [Backend smoke test:1-134](file://Backend/scripts/smoke.py#L1-L134)

### Development Workflow
- Backend changes:
  - Edit code under Backend/app.
  - Restart the uvicorn server (hot reload is enabled).
  - Re-run smoke tests or pytest to validate behavior.
- Frontend changes:
  - Edit files under Frontend/app and components.
  - The dev server reloads automatically.
  - Use npm run lint and npm run typecheck to catch issues early.
- Database:
  - If needed, reset or inspect the local Postgres container.
  - Demo data is seeded only when the database is empty; existing data persists across restarts.

Best practices:
- Keep .env and .env.local out of version control.
- Use the frontend persona switcher to test multi-tenant scenarios quickly.
- When adding new features that depend on external services (LiveKit, AI), ensure corresponding THOS_ settings are present.

[No sources needed since this section provides general guidance]

## Dependency Analysis
Runtime dependencies:
- Backend depends on FastAPI, Pydantic settings, PostgreSQL (or SQLite fallback), and optional integrations (LiveKit, AI providers).
- Frontend depends on Next.js and communicates with the backend via HTTP.

Local infrastructure dependency:
- PostgreSQL runs via Docker Compose and is required unless using the SQLite fallback.

```mermaid
graph LR
FE["Frontend (Next.js)"] --> |HTTP| BE["Backend (FastAPI)"]
BE --> |SQL| PG["PostgreSQL (Docker)"]
BE --> |Optional| LK["LiveKit"]
BE --> |Optional| AI["AI Provider"]
```

**Diagram sources**
- [Backend main application:15-58](file://Backend/app/main.py#L15-L58)
- [Backend configuration:72-178](file://Backend/app/core/config.py#L72-L178)
- [docker-compose.yml:1-24](file://infrastructure/local/docker-compose.yml#L1-L24)

**Section sources**
- [Backend package manifest:11-33](file://Backend/pyproject.toml#L11-L33)
- [Frontend package manifest:13-20](file://Frontend/package.json#L13-L20)

## Performance Considerations
- Use PostgreSQL for production-like performance and features (pgvector).
- Avoid wildcard CORS outside development; restrict origins explicitly.
- Tune JWT TTLs and timeouts according to your environment.
- For voice interviews, ensure sufficient timeout and model settings to avoid latency issues.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Cannot connect to PostgreSQL:
  - Ensure the Docker container is running and port 5432 is available.
  - Confirm the database URL matches the defaults or your configuration.
- Backend starts but no demo data:
  - Demo data is seeded only when the database is empty. If data already exists, the seeder skips insertion.
- Frontend cannot reach backend:
  - Verify NEXT_PUBLIC_API_URL and BACKEND_API_URL in .env.local.
  - Ensure CORS allows your frontend origin (defaults include localhost:3000).
- LiveKit or AI features unavailable:
  - These require explicit configuration (THOS_LIVEKIT_URL, THOS_LIVEKIT_API_KEY, THOS_LIVEKIT_API_SECRET, THOS_AI_API_KEY). Without them, related endpoints return configuration errors.
- Smoke test failures:
  - Check health/readiness endpoints and ensure the backend is fully started before running the test.
  - Inspect tenant isolation by verifying pipeline results differ between tenants.

Helpful commands:
- Backend: uv run uvicorn app.main:app --reload
- Frontend: npm run dev
- Database: docker compose -f infrastructure/local/docker-compose.yml up -d

**Section sources**
- [Backend README:42-54](file://Backend/README.md#L42-L54)
- [Backend README:105-113](file://Backend/README.md#L105-L113)
- [Backend configuration:16-40](file://Backend/app/core/config.py#L16-L40)
- [Frontend README:28-47](file://Frontend/README.md#L28-L47)

## Conclusion
You now have the essential steps to set up the ATS development environment, run local PostgreSQL, configure environment variables, start both servers, explore API documentation, and validate your setup with the smoke test. Use the demo accounts to test multi-tenant workflows and iterate confidently across backend and frontend changes.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Quick Commands Reference
- Start PostgreSQL: docker compose -f infrastructure/local/docker-compose.yml up -d
- Start Backend: cd Backend && uv sync --dev && uv run uvicorn app.main:app --reload
- Start Frontend: cd Frontend && npm install && npm run dev
- Access API docs: http://127.0.0.1:8000/docs
- Run smoke test: python Backend/scripts/smoke.py http://127.0.0.1:8000

**Section sources**
- [Backend README:15-28](file://Backend/README.md#L15-L28)
- [Backend README:105-113](file://Backend/README.md#L105-L113)
- [Frontend README:18-26](file://Frontend/README.md#L18-L26)