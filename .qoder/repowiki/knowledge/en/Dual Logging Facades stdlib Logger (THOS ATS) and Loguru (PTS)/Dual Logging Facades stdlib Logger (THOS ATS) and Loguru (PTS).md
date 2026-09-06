---
kind: logging_system
name: 'Dual Logging Facades: stdlib Logger (THOS ATS) and Loguru (PTS)'
category: logging_system
scope:
    - '**'
source_files:
    - Backend/app/logging.py
    - Backend/app/main.py
    - Backend/app/middleware/request_id.py
    - pts/backend/app/logging/__init__.py
    - pts/backend/app/api/middleware/logging.py
    - pts/backend/app/main.py
---

## Overview

The repository contains two independent FastAPI backends, each with its own logging setup. There is no shared logging library or centralized configuration across the two apps.

### THOS ATS Backend (`Backend/`)

- **Framework**: Python `logging` module via a thin custom facade in `Backend/app/logging.py`.
- **Logger name**: A single logger instance is created under the name `thos.ai` (`logging.getLogger("thos.ai")`).
- **Handler**: One `StreamHandler` writing to stdout/stderr with the format `"%(asctime)s %(levelname)s [%(name)s] %(message)s"`.
- **Default level**: `INFO`.
- **Facade API**: The file exposes a singleton `_Logger` object named `logger` that wraps debug/info/warning/error/exception methods so callers use `from app.logging import logger` uniformly.
- **Consumers**: Dozens of modules across `ai/`, `api/v1/`, `services/`, `websocket/` import this facade — e.g. `app/ai/agents/base.py`, `app/ai/services/agent_orchestrator.py`, `app/services/voice_interview.py`, `app/websocket/manager.py`, `app/api/models/database.py`.
- **No request/response middleware**: The main app (`Backend/app/main.py`) does not install any HTTP logging middleware; request tracing is handled by a separate `RequestContextMiddleware` (adds `X-Request-ID` / `X-Correlation-ID` headers) but does not emit log lines.
- **Structured fields**: None — messages are plain strings.
- **Configuration**: No settings-driven log level or formatter; the handler is bootstrapped lazily on first access.

### Performance Tracking System Backend (`pts/backend/`)

- **Framework**: `loguru` imported directly from `loguru` inside `pts/backend/app/logging/__init__.py`, which re-exports it as `from loguru import logger`.
- **Consumers**: Modules under `pts/backend/app/ai/` (e.g. `agents/base.py`, `conversation.py`, `supervisor.py`, `prompts/generator.py`, `services/agent_orchestrator.py`, `utils/audio_recorder.py`) import either `from app.logging import logger` (the local package) or directly `from loguru import logger`.
- **HTTP middleware**: `pts/backend/app/api/middleware/logging.py` defines `setup_logging_middleware(app)` which registers a FastAPI `http` middleware that logs every incoming request (`logger.info(f"Request: {request.method} {request.url}")`) and after handling logs the status code plus elapsed seconds (`logger.info(f"Response: {response.status_code} - {process_time:.4f}s")`). It is wired into the app in `pts/backend/app/main.py` via `setup_logging_middleware(app)`.
- **Structured fields**: None — messages are formatted f-strings.
- **Configuration**: No explicit loguru configuration (no `add()`, `remove()`, `opt()` calls) is visible in the scanned files; default loguru behavior applies.

## Conventions Observed

- Each backend has its own `app/logging` entry point; there is no cross-backend shared logger package.
- Business logic never imports `logging` or `loguru` directly — it goes through `from app.logging import logger` (ATS) or the local `app.logging` package (PTS).
- Log levels used are `info` for normal flow events and `error` for failures; `debug` is available but not observed in the scanned files.
- No correlation/request IDs are attached to log records automatically in either backend; the ATS backend injects `X-Request-ID` / `X-Correlation-ID` headers at the middleware layer but does not propagate them into log records.
- No JSON/log-structured output, no sinks beyond stdout/stderr, and no rotation or external log aggregation is configured in the scanned code.