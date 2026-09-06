---
kind: dependency_management
name: Multi-Project Dependency Management (Hatch + pip + npm lockfiles)
category: dependency_management
scope:
    - '**'
source_files:
    - Backend/pyproject.toml
    - Backend/.env.example
    - pts/backend/requirements.txt
    - pts/backend/Dockerfile
    - Frontend/package.json
    - Frontend/package-lock.json
    - pts/frontend/package.json
    - pts/frontend/package-lock.json
---

## Overview

The repository contains two independent full-stack applications — the THOS Hiring Platform (`Backend/` + `Frontend/`) and a separate Performance Tracking System (`pts/backend/` + `pts/frontend/`) — each managing its own third-party dependencies with different tooling. There is no monorepo-level dependency manifest; each subproject is self-contained.

## Python Dependencies

### THOS Backend (`Backend/pyproject.toml`)
- Uses **Hatch** as the build backend (`hatchling>=1.27`) declared in `[build-system]`.
- Runtime dependencies are pinned with **upper-bound ranges** (e.g. `fastapi>=0.115,<1.0`, `langchain>=0.3,<2.0`, `openai>=1.0,<3.0`, `livekit>=1.0,<2.0`). This allows minor/patch updates while preventing breaking major upgrades.
- Development-only dependencies (`httpx`, `pytest`, `ruff`) are isolated under `[dependency-groups].dev` — Hatch's native dev-dependency feature.
- No `uv.lock` or `poetry.lock` file exists; resolution is left to the user's resolver (pip/pip-tools/uv) at install time.
- The project targets CPython `>=3.13,<3.14` and packages only the `app/` directory as the wheel package.
- A local `.venv/` exists, indicating per-project virtual environments rather than shared system-wide installs.

### Performance Tracking Backend (`pts/backend/requirements.txt`)
- Uses **pinned exact versions** via `requirements.txt` (e.g. `fastapi==0.116.1`, `uvicorn==0.35.0`, `SQLAlchemy==2.0.41`, `livekit-agents==1.6.0`).
- No `requirements.in` / `pip-compile` workflow is present; the file is the single source of truth.
- Dockerfile copies `requirements.txt` into `/tmp/requirements.txt` and runs `pip install -r /tmp/requirements.txt`, so CI/container builds depend on this file being up to date.

## Node.js Dependencies

### THOS Frontend (`Frontend/package.json`)
- Declares runtime dependencies (`next`, `react`, `livekit-client`, `@livekit/components-react`) and dev dependencies (`eslint`, `vitest`, `typescript`, testing libraries).
- A `package-lock.json` file is present (visible in the tree), providing deterministic installs for CI and reproducibility.
- Scripts include `dev`, `build`, `start`, `lint`, `typecheck`, and `test` (via Vitest).

### Performance Tracking Frontend (`pts/frontend/package.json`)
- Similar structure with Next.js, React, LiveKit, Tailwind CSS v4, and TypeScript.
- Also has a `package-lock.json` for deterministic installs.

## Vendoring & Private Registries

- No vendored third-party code is present anywhere in the repo (no `vendor/`, no `third_party/`, no `node_modules/` committed). All packages are fetched from public registries (PyPI, npm registry) at install/build time.
- No private PyPI index, GitHub Packages, or npm registry configuration is found in any config file.
- Environment-driven integrations (OpenAI, LiveKit, SMTP, S3/boto3) are configured exclusively through environment variables documented in `Backend/.env.example`; secrets are never checked in.

## Conventions Observed

1. **Per-project isolation**: Each application owns its own dependency manifest and virtual environment/lockfile. There is no shared Python package or shared `node_modules` across projects.
2. **Version pinning strategy differs by project**: the main backend uses range-based constraints in `pyproject.toml`, while the pts backend uses exact pins in `requirements.txt`. Both approaches aim to avoid unexpected major-version breaks.
3. **Lockfiles for Node**: Both frontend projects use `package-lock.json` to freeze transitive dependency trees.
4. **Containerization depends on manifests**: The pts backend `Dockerfile` reads `requirements.txt` directly, making it the authoritative artifact for container builds.
5. **No global/shared dependency policy**: Because the two Python backends use different tools (Hatch vs plain pip), there is no cross-project enforcement of a single versioning style.