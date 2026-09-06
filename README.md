# THOS — Talent & Hiring Operating System

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15.4-black.svg?style=flat&logo=next.js&logoColor=white)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.13-blue.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector%2017-336791.svg?style=flat&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC%20Voice-00E599.svg?style=flat&logo=livekit&logoColor=white)](https://livekit.io)
[![License](https://img.shields.io/badge/license-Proprietary%20%2F%20Internal-lightgrey.svg)]()

> **THOS** is an AI-native, multi-tenant hiring operating system designed to combine the broad scale of a universal ATS with deep, vertical domain intelligence.

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Key Architectural Pillars](#-key-architectural-pillars)
- [System Architecture](#-system-architecture)
- [Repository Structure](#-repository-structure)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Quickstart Guide](#-quickstart-guide)
  - [1. Infrastructure Services (Postgres + LiveKit)](#1-infrastructure-services-postgres--livekit)
  - [2. Backend Setup (FastAPI)](#2-backend-setup-fastapi)
  - [3. Frontend Setup (Next.js)](#3-frontend-setup-nextjs)
- [Demo Personas & Credentials](#-demo-personas--credentials)
- [Environment Variables](#-environment-variables)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Architecture & Design Rules](#-architecture--design-rules)
- [Specification Documents](#-specification-documents)

---

## 🌟 Overview

Traditional hiring platforms either offer shallow reach with no subject-matter depth or build isolated point solutions for a single vertical. **THOS** decouples hiring into two clean layers:

1. **Universal Hiring Engine**: Multi-tenancy, RBAC, ATS pipelines, interview orchestration, sandboxed assessments, matching, notifications, analytics, and audit logging.
2. **Domain Intelligence Packs**: Swappable domain modules (starting with **Education** and expanding to **Software Engineering**) that supply ontologies, structured question generation, and objective grading rubrics.

### Two-Stage AI Interview Model

- **Profile Interview**: Candidate-owned, self-directed, retakeable voice screening. Establishes a verified, portable **Skill Score**.
- **Applied Interview**: Employer-owned, job-specific interview generated from the job description and curated by hiring managers with locked question pools (one attempt per candidate).

---

## 🏛 Key Architectural Pillars

- 🧩 **Engine & Pack Decoupling**: The core engine contains zero industry-specific code. Adding a new industry never touches the engine services.
- 🎙️ **Real-Time Voice Sessions**: LiveKit-backed conversational interviews integrated with OpenAI Realtime models, featuring live telemetry, anti-hallucination rubric scoring, and evidence citation.
- 🛡️ **Human-in-the-Loop Authority**: AI assists with evaluations, evidence extraction, and recommendations. **Final reject, hire, or offer decisions strictly require a human actor of record.**
- 🏢 **Multi-Tenancy & Unit Hierarchy**: Tenant isolation on every database query, cache key, and event, with hierarchical units (campuses, departments, business units).
- 📜 **Audit & Canonical Transitions**: All application stage updates flow through a single, validated transition command path with append-only audit records.
- ♿ **Accessibility First**: WCAG 2.2 AA target across critical flows, complete keyboard equivalents for Kanban drag-and-drop, and accessible fallback lists.

---

## 📐 System Architecture

```text
                 ┌─────────────────────────────────────────────────────────┐
                 │                   Web Application                       │
                 │     Employer Workspace     │     Candidate Portal       │
                 │     (Next.js 15 + React 19 App Router + Custom Tokens)  │
                 └────────────────────────────┬────────────────────────────┘
                                              │ HTTP / JSON & WebSocket
                                              ▼
                 ┌─────────────────────────────────────────────────────────┐
                 │                     THOS Core API                       │
                 │             (FastAPI · Python 3.13 · JWT RBAC)          │
                 │  Auth · Tenancy · ATS Pipeline · Applications · Audit   │
                 └──────┬─────────────┬─────────────┬─────────────┬────────┘
                        │             │             │             │
        ┌───────────────▼┐     ┌──────▼──────┐   ┌──▼──────────┐ ┌▼──────────────┐
        │  Domain Pack   │     │  Interview  │   │ Assessment  │ │ Notifications │
        │    Registry    │     │ Orchestrator│   │   Sandbox   │ │  & Matching   │
        └──────┬─────────┘     └──────┬──────┘   └─────────────┘ └───────────────┘
               │                      │
        ┌──────▼──────┐        ┌──────▼───────────────────────────────────┐
        │ Active Pack │        │ LiveKit WebRTC Server + OpenAI Realtime  │
        │  Manifests  │        │ (Voice Streaming, VAD, Telemetry)        │
        └─────────────┘        └──────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌────────────────────────────┐
                        │   PostgreSQL + pgvector    │
                        │ (Vector similarity search) │
                        └────────────────────────────┘
```

---

## 📂 Repository Structure

```text
.
├── Backend/                       # FastAPI REST & WebSocket backend
│   ├── app/                       # Application code
│   │   ├── api/                   # API route handlers (v1 endpoints)
│   │   ├── core/                  # Core config, security, exceptions
│   │   ├── db/                    # DB layer, migrations, schema setup
│   │   ├── models/                # Pydantic & persistence models
│   │   └── services/              # Business logic (ATS, Interviews, Packs)
│   ├── scripts/                   # Utility and smoke test scripts
│   ├── tests/                     # Unit and integration test suite
│   ├── pyproject.toml             # Python dependencies & Ruff config
│   └── README.md                  # Backend-specific documentation
│
├── Frontend/                      # Next.js App Router frontend application
│   ├── app/                       # Employer, candidate, & interview routes
│   ├── components/                # React components
│   │   ├── ui/                    # Design system primitives & tokens
│   │   ├── dashboard/             # Employer dashboard & attention queue
│   │   ├── candidate/             # Candidate portal & skill profile
│   │   ├── pipeline/              # Kanban board & application drawer
│   │   └── interviews/            # LiveKit voice room client
│   ├── lib/                       # API clients, types, and hooks
│   ├── tests/                     # Vitest component & page tests
│   ├── package.json               # Node.js dependencies & scripts
│   └── README.md                  # Frontend-specific documentation
│
├── domain-packs/                  # Swappable domain intelligence modules
│   ├── education/                 # Founding flagship pack (Higher Ed/K-12)
│   │   └── manifest.json          # Ontologies, question pools, rubrics
│   └── software-engineering/      # Software engineering domain pack
│       └── manifest.json          # Tech stack rubrics & coding questions
│
├── infrastructure/                # Local container orchestration
│   └── local/
│       └── docker-compose.yml     # PostgreSQL with pgvector (pg17)
│
├── docker-compose.yml             # Local LiveKit WebRTC server + Redis
├── livekit.yaml                   # LiveKit server configuration
├── prd.md                         # Product Requirements Document
├── architecture.md                # System Architecture & Technical Design
├── rules.md                       # Binding Architectural & Governance Constraints
├── phases.md                      # Roadmap, milestones, & delivery gates
├── design.md                      # Design tokens, accessibility, & UX rules
├── implementation-plan.md         # Implementation roadmap & build sequence
└── THOS_Development_Spec.md       # Comprehensive system specification
```

---

## 🛠 Tech Stack

| Layer | Technology | Key Highlights |
|---|---|---|
| **Backend** | **Python 3.13**, **FastAPI** | High-performance async API, Pydantic v2 settings & schemas, Uvicorn |
| **Frontend** | **Next.js 15**, **React 19**, **TypeScript** | App Router, SSR/CSR, zero Tailwind (custom design tokens), WCAG AA |
| **Database** | **PostgreSQL 17** + **pgvector** | Relational integrity, tenant-isolated queries, vector embeddings |
| **Real-Time Voice**| **LiveKit**, **OpenAI Realtime API** | Low-latency WebRTC audio streaming, VAD, Silero, voice telemetry |
| **AI / Orchestration**| **LangChain Core**, **OpenAI** | Structured question generation, rubric evaluations, citation tracking |
| **Testing & Linting** | **Pytest**, **Ruff**, **Vitest**, **ESLint** | Strict type-checking, automated linting, unit & smoke coverage |

---

## 📋 Prerequisites

Ensure the following tools are installed on your workstation:

- [Python 3.13](https://www.python.org/downloads/)
- [`uv`](https://docs.astral.sh/uv/) (strongly recommended) or standard `pip`
- [Node.js 20.9+](https://nodejs.org/) & `npm 10+`
- [Docker & Docker Compose](https://www.docker.com/)

---

## 🚀 Quickstart Guide

### 1. Infrastructure Services (Postgres + LiveKit)

Start PostgreSQL (with `pgvector`) and the LiveKit WebRTC server in separate containers:

```bash
# 1. Start PostgreSQL (pgvector)
docker compose -f infrastructure/local/docker-compose.yml up -d

# 2. (Optional) Start local LiveKit WebRTC Server & Redis
docker compose up -d
```

Verify services are healthy:
- **PostgreSQL**: `localhost:5432` (`thos`/`thos` user & DB)
- **LiveKit Server**: `localhost:7880` (HTTP/WebSocket)

---

### 2. Backend Setup (FastAPI)

Navigate to the `Backend` directory, configure environment variables, install dependencies, and launch the API server:

```bash
cd Backend

# Copy example environment configuration
cp .env.example .env

# Install dependencies using uv
uv sync --dev

# Run the backend with hot reload
uv run uvicorn app.main:app --reload --port 8000
```

- **API Base URL**: `http://127.0.0.1:8000`
- **Interactive OpenAPI Documentation**: `http://127.0.0.1:8000/docs`
- On initial launch with `THOS_SEED_DEMO_DATA=true`, the database schema is created and demo data is seeded automatically.

---

### 3. Frontend Setup (Next.js)

In a new terminal window, navigate to the `Frontend` directory:

```bash
cd Frontend

# Install npm packages
npm install

# Copy local environment configuration
cp .env.example .env.local

# Run the Next.js development server
npm run dev
```

Open your browser to:
- **Employer Workspace**: [http://localhost:3000/](http://localhost:3000/)
- **Candidate Portal**: [http://localhost:3000/candidate](http://localhost:3000/candidate)
- **LiveKit Interview Room**: [http://localhost:3000/interviews/demo-room](http://localhost:3000/interviews/demo-room)

---

## 👥 Demo Personas & Credentials

The application includes pre-seeded accounts and a built-in development persona switcher.

Default password for all seeded users: **`Password123!`**

| Persona | Email | Role | Organization |
|---|---|---|---|
| **Platform Superadmin** | `superadmin@thos.local` | Platform Superadmin | System-wide (Org verification) |
| **Ayesha Khan** | `ayesha.khan@nut.edu.pk` | Org Administrator | National University of Technology |
| **Bilal Hassan** | `bilal.hassan@nut.edu.pk` | Recruiter | National University of Technology |
| **Samira Iqbal** | `samira.iqbal@nut.edu.pk` | Hiring Manager | National University of Technology |
| **Tariq Mahmood** | `tariq.mahmood@riverside.edu.pk` | Org Administrator | Riverside College |
| **Hira Ahmed** | `hira.ahmed@gmail.com` | Candidate | Academic / CS Candidate |
| **Omar Farooq** | `omar.farooq@gmail.com` | Candidate | Engineering Candidate |

---

## ⚙️ Environment Variables

### Backend (`Backend/.env`)

| Variable | Description | Default |
|---|---|---|
| `THOS_DATABASE_URL` | PostgreSQL connection string | `postgresql://thos:thos@localhost:5432/thos` |
| `THOS_JWT_SECRET` | Secret key for signing JWT tokens | (Change in production) |
| `THOS_JWT_ACCESS_TTL_SECONDS` | Access token lifespan in seconds | `3600` |
| `THOS_CORS_ORIGINS` | Comma-separated list of allowed origins | `http://localhost:3000` |
| `THOS_LIVEKIT_URL` | LiveKit server endpoint | `ws://localhost:7880` |
| `THOS_LIVEKIT_API_KEY` | LiveKit API Key | `devkey` |
| `THOS_LIVEKIT_API_SECRET` | LiveKit API Secret | `secret` |
| `THOS_AI_API_KEY` | OpenAI API Key for voice agents & evaluation | `sk-...` |
| `THOS_SEED_DEMO_DATA` | Automatically seed demo tenants & users on start | `true` |

### Frontend (`Frontend/.env.local`)

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Browser-accessible base URL of the FastAPI backend | `http://localhost:8000` |
| `BACKEND_API_URL` | Server-side base URL used for token proxying | `http://127.0.0.1:8000` |
| `BACKEND_LIVEKIT_TOKEN_PATH` | Backend endpoint for LiveKit participant tokens | `/api/v1/interviews/token` |

---

## 🧪 Testing & Quality Assurance

### Backend Validation

```bash
cd Backend

# Run unit and integration tests
uv run pytest

# Run linting with Ruff
uv run ruff check .

# Execute full end-to-end hiring loop smoke test (server must be running)
python scripts/smoke.py http://127.0.0.1:8000
```

### Frontend Validation

```bash
cd Frontend

# Run unit tests via Vitest
npm test

# Run TypeScript typecheck
npm run typecheck

# Run Next.js ESLint
npm run lint

# Validate production build
npm run build
```

---

## 📜 Architecture & Design Rules

This codebase follows mandatory constraints defined in [rules.md](rules.md):

1. **No Domain Knowledge in Core Engine**: Never write `if (domain === "...")` in the backend engine. Domain specificities live strictly in Domain Pack manifests.
2. **Canonical Pipeline Transitions**: State updates to applications must execute through `POST /api/v1/applications/{id}/transitions` to maintain audit integrity.
3. **Mandatory Tenant Isolation**: Every DB query, cache operation, and event emission must carry an explicit `tenant_id` predicate.
4. **Human Authority on Decisions**: AI may score and summarize; only authenticated humans may trigger final `hire`, `reject`, or `offer` stage changes.
5. **Polite Real-Time Updates**: Screen-reader polite regions and explicit keyboard support across all dynamic drag-and-drop interactions.

---

## 📚 Specification Documents

For in-depth architectural decisions, domain specifications, and UX guidelines:

- 📄 [PRD (`prd.md`)](prd.md) — Product requirements, personas, and problem statement.
- 🏗️ [Architecture (`architecture.md`)](architecture.md) — Technical specifications, service decomposition, and event boundaries.
- ⚖️ [Rules (`rules.md`)](rules.md) — Non-negotiable architectural and ethical constraints.
- 🗺️ [Phases (`phases.md`)](phases.md) — Delivery roadmap, phase gates, and backlog breakdown.
- 🎨 [Design System (`design.md`)](design.md) — UX principles, color palettes, and accessible component tokens.
- 📖 [THOS Development Spec (`THOS_Development_Spec.md`)](THOS_Development_Spec.md) — Unified technical reference manual.

---

## 🤝 Contributing & Workflow

1. Create a feature branch (`git checkout -b feature/domain-pack-expansion`).
2. Verify all tests pass (`uv run pytest` & `npm test`).
3. Ensure no linting violations exist (`uv run ruff check .` & `npm run lint`).
4. Commit your changes with descriptive messages adhering to project rules.
5. Open a Pull Request targeting `main`.

---

© 2026 THOS Team. All rights reserved.
