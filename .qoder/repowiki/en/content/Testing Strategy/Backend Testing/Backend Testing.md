# Backend Testing

<cite>
**Referenced Files in This Document**
- [conftest.py](file://Backend/tests/conftest.py)
- [pyproject.toml](file://Backend/pyproject.toml)
- [main.py](file://Backend/app/main.py)
- [config.py](file://Backend/app/core/config.py)
- [auth.py](file://Backend/app/api/v1/auth.py)
- [voice_interview.py](file://Backend/app/services/voice_interview.py)
- [test_auth.py](file://Backend/tests/test_auth.py)
- [test_voice_interview.py](file://Backend/tests/test_voice_interview.py)
- [test_livekit.py](file://Backend/tests/test_livekit.py)
- [test_ai.py](file://Backend/tests/test_ai.py)
- [test_postgres.py](file://Backend/tests/test_postgres.py)
- [test_tenancy.py](file://Backend/tests/test_tenancy.py)
- [test_hiring_loop.py](file://Backend/tests/test_hiring_loop.py)
- [test_cv_upload.py](file://Backend/tests/test_cv_upload.py)
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

## Introduction
This document explains how the ATS backend is tested with pytest. It covers unit testing strategies for services and business logic, integration tests for API endpoints and database interactions, and approaches for mocking external integrations such as AI providers and LiveKit. It also documents shared test fixtures, configuration patterns, and best practices for FastAPI-based applications.

## Project Structure
The backend uses a standard FastAPI layout with feature-oriented modules under app/. Tests live under Backend/tests/ and are configured via pyproject.toml. The application factory create_app builds the FastAPI instance with CORS, request context middleware, exception handlers, and routers. A minimal TestClient fixture is provided to run requests against an isolated in-memory SQLite database during tests.

```mermaid
graph TB
subgraph "Tests"
T1["tests/conftest.py"]
T2["tests/*.py"]
end
subgraph "App"
M["app/main.py"]
C["app/core/config.py"]
A["app/api/v1/auth.py"]
V["app/services/voice_interview.py"]
end
T1 --> M
T2 --> M
M --> C
A --> C
V --> C
```

**Diagram sources**
- [main.py:15-58](file://Backend/app/main.py#L15-L58)
- [config.py:16-215](file://Backend/app/core/config.py#L16-L215)
- [auth.py:74-185](file://Backend/app/api/v1/auth.py#L74-L185)
- [voice_interview.py:154-167](file://Backend/app/services/voice_interview.py#L154-L167)

**Section sources**
- [pyproject.toml:45-48](file://Backend/pyproject.toml#L45-L48)
- [main.py:15-58](file://Backend/app/main.py#L15-L58)

## Core Components
- Test client and settings: A reusable TestClient fixture creates an isolated FastAPI app per test using Settings configured for the TEST environment with SQLite and disabled external services.
- Development identity header: Tests can bypass authentication by sending X-Development-Identity when appropriate, enabling fast multi-user scenarios without tokens.
- Optional live PostgreSQL smoke tests: A separate test module conditionally runs against a real Postgres if reachable, seeding demo data for broader validation.

Key responsibilities:
- conftest.py provides settings and client fixtures and helper headers.
- main.py wires middleware, routers, and lifespan behavior.
- config.py defines Settings with validators and properties used across tests to assert readiness and environment-specific behavior.

**Section sources**
- [conftest.py:14-49](file://Backend/tests/conftest.py#L14-L49)
- [main.py:15-58](file://Backend/app/main.py#L15-L58)
- [config.py:16-215](file://Backend/app/core/config.py#L16-L215)
- [test_postgres.py:20-55](file://Backend/tests/test_postgres.py#L20-L55)

## Architecture Overview
The testing architecture centers on a lightweight TestClient that exercises FastAPI routes against an isolated database. External dependencies (AI, LiveKit, SMTP, S3) are intentionally disabled or mocked via Settings so tests remain deterministic and fast. Integration tests validate cross-cutting concerns like tenancy, role enforcement, and workflow transitions.

```mermaid
sequenceDiagram
participant PyTest as "pytest"
participant Client as "TestClient"
participant App as "FastAPI app"
participant DB as "SQLite/PostgreSQL"
participant Ext as "External Services"
PyTest->>Client : send HTTP request
Client->>App : route handler
App->>DB : read/write entities
App-->>Ext : optional calls (disabled in tests)
App-->>Client : JSON response
Client-->>PyTest : assertions
```

[No sources needed since this diagram shows conceptual workflow, not actual code structure]

## Detailed Component Analysis

### Authentication Flow Testing
Strategy:
- Use the shared TestClient to register users, log in, refresh tokens, and logout.
- Validate token rotation semantics and replay protection.
- Verify development identity header works for quick access in tests.
- Assert error codes for invalid credentials and account state.

```mermaid
sequenceDiagram
participant T as "Test"
participant C as "TestClient"
participant R as "Auth Router"
participant D as "Database"
T->>C : POST /api/v1/auth/register
C->>R : register(payload)
R->>D : create user + candidate
D-->>R : user record
R-->>C : {access_token, refresh_token, user}
T->>C : GET /api/v1/me (Bearer)
C->>R : me()
R->>D : memberships, applications
D-->>R : data
R-->>C : user profile + memberships
T->>C : POST /api/v1/auth/refresh
C->>R : refresh(refresh_token)
R->>D : rotate token
D-->>R : new tokens
R-->>C : {new_refresh_token}
```

**Diagram sources**
- [auth.py:74-148](file://Backend/app/api/v1/auth.py#L74-L148)
- [test_auth.py:21-53](file://Backend/tests/test_auth.py#L21-L53)

Best practices:
- Always assert both status codes and structured error codes/messages.
- Use idempotency keys where applicable to verify safe retries.
- Leverage development identity header for non-authenticated flows in tests.

**Section sources**
- [test_auth.py:21-166](file://Backend/tests/test_auth.py#L21-L166)
- [auth.py:74-185](file://Backend/app/api/v1/auth.py#L74-L185)

### Voice Interview Processing and Readiness Checks
Strategy:
- Validate strategy selection and evaluation mapping for different interview types.
- Ensure voice interviews fail gracefully when LiveKit or AI are not configured.
- Confirm that production rejects caller-chosen identities for security.

```mermaid
flowchart TD
Start(["ensure_voice_ready(settings)"]) --> CheckLK{"LiveKit configured?"}
CheckLK --> |No| RaiseLK["Raise ApiError(503)"]
CheckLK --> |Yes| CheckAI{"AI configured?"}
CheckAI --> |No| RaiseAI["Raise ApiError(503)"]
CheckAI --> |Yes| Ready["Proceed to start session"]
```

**Diagram sources**
- [voice_interview.py:154-167](file://Backend/app/services/voice_interview.py#L154-L167)

Additional notes:
- Strategy functions return human-readable descriptions tailored to interview type; tests assert language and focus.
- Evaluation mapping normalizes scores and flags human review requirements.

**Section sources**
- [test_voice_interview.py:12-49](file://Backend/tests/test_voice_interview.py#L12-L49)
- [voice_interview.py:53-151](file://Backend/app/services/voice_interview.py#L53-L151)
- [voice_interview.py:154-167](file://Backend/app/services/voice_interview.py#L154-L167)

### AI Service Mocking and Fallbacks
Strategy:
- When AI is disabled, endpoints return a deterministic disabled status with empty results and metadata preserved.
- In production-like settings, unauthenticated requests are rejected even if provider keys are present.

```mermaid
sequenceDiagram
participant T as "Test"
participant C as "TestClient"
participant AI as "AI Endpoint"
T->>C : POST /api/v1/ai/interview-questions
C->>AI : generate questions
AI-->>C : {status : "disabled", questions : [], requires_human_review : true}
Note over AI : No external call made
```

**Diagram sources**
- [test_ai.py:9-27](file://Backend/tests/test_ai.py#L9-L27)

**Section sources**
- [test_ai.py:9-55](file://Backend/tests/test_ai.py#L9-L55)

### LiveKit Token Issuance and Security
Strategy:
- Without credentials, token issuance returns a clear integration-not-configured error with consistent shape and request ID correlation.
- Production enforces trusted identity; caller-selected identities are rejected.

```mermaid
sequenceDiagram
participant T as "Test"
participant C as "TestClient"
participant LK as "Token Endpoint"
T->>C : POST /api/v1/interviews/token
C->>LK : issue token
LK-->>C : 503 {error.code : "integration_not_configured"}
Note over LK : Validates settings before issuing token
```

**Diagram sources**
- [test_livekit.py:7-18](file://Backend/tests/test_livekit.py#L7-L18)

**Section sources**
- [test_livekit.py:7-37](file://Backend/tests/test_livekit.py#L7-L37)

### Multi-Tenant Isolation and Role Enforcement
Strategy:
- Create organizations per tenant and assert strict isolation of postings, pipeline, and direct object access.
- Non-existent org IDs must not leak existence information; responses match forbidden semantics.
- Role checks block non-admin configuration actions.

```mermaid
flowchart TD
A["Admin A creates org"] --> B["Admin B attempts cross-tenant access"]
B --> C{"Org exists for Admin B?"}
C --> |No| D["Return 403 forbidden (no leakage)"]
C --> |Yes| E["Return 403 forbidden (cross-tenant)"]
D --> F["Assertions on error shape"]
E --> F
```

**Diagram sources**
- [test_tenancy.py:27-48](file://Backend/tests/test_tenancy.py#L27-L48)

**Section sources**
- [test_tenancy.py:19-116](file://Backend/tests/test_tenancy.py#L19-L116)

### End-to-End Hiring Loop
Strategy:
- Exercise full lifecycle: organization setup, domain pack activation, workflow creation, job posting, question pool generation/lock/publish, application submission, stage transitions, applied interview invitation/response/submit, scorecard creation, decision path, notifications, and audit trail.
- Validate idempotency, versioned transitions, and terminal stage constraints.

```mermaid
sequenceDiagram
participant E as "Employer"
participant K as "Candidate"
participant API as "ATS API"
E->>API : create org, activate pack, create workflow
E->>API : create & publish job
K->>API : apply (idempotent)
E->>API : transition stages (versioned)
E->>API : invite applied interview
K->>API : submit responses
E->>API : create scorecard, transition to offer/hired
API-->>E : notifications + audit records
```

**Diagram sources**
- [test_hiring_loop.py:9-54](file://Backend/tests/test_hiring_loop.py#L9-L54)
- [test_hiring_loop.py:57-275](file://Backend/tests/test_hiring_loop.py#L57-L275)

**Section sources**
- [test_hiring_loop.py:57-275](file://Backend/tests/test_hiring_loop.py#L57-L275)

### CV Upload and Extraction
Strategy:
- Unit-test extraction from DOCX and PDF with synthetic content.
- Reject unsupported legacy formats with a specific error code.
- End-to-end upload endpoint validates parsing and embedding availability.

```mermaid
flowchart TD
U["Upload file"] --> X["Extract text/format"]
X --> Valid{"Supported format?"}
Valid --> |No| Err["ApiError(cv_format_unsupported)"]
Valid --> |Yes| P["Parse sections + embeddings"]
P --> R["Return parsed result"]
```

**Diagram sources**
- [test_cv_upload.py:73-113](file://Backend/tests/test_cv_upload.py#L73-L113)

**Section sources**
- [test_cv_upload.py:73-113](file://Backend/tests/test_cv_upload.py#L73-L113)

### Optional Live PostgreSQL Smoke Tests
Strategy:
- Skip unless THOS_DATABASE_URL points to a reachable Postgres.
- Seed demo data and assert employer data availability through API endpoints.

```mermaid
flowchart TD
S["Start test module"] --> R{"Postgres reachable?"}
R --> |No| Skip["Skip all tests"]
R --> |Yes| Run["Run with live DB"]
Run --> A["Assert seeded data via API"]
```

**Diagram sources**
- [test_postgres.py:20-36](file://Backend/tests/test_postgres.py#L20-L36)
- [test_postgres.py:58-72](file://Backend/tests/test_postgres.py#L58-L72)

**Section sources**
- [test_postgres.py:20-72](file://Backend/tests/test_postgres.py#L20-L72)

## Dependency Analysis
- Test client depends on create_app which wires middleware and routers.
- Settings drive behavior: environment, database target, AI/LiveKit readiness, and CORS.
- Auth endpoints depend on store operations and token services; tests assert both success and failure paths.
- Voice interview service depends on AI and LiveKit readiness; tests assert graceful failures.

```mermaid
graph LR
Conf["Settings (config.py)"] --> App["create_app (main.py)"]
App --> Routes["Routers (e.g., auth.py)"]
Routes --> Store["Store/DB"]
Routes --> Ext["External Services (AI/LiveKit)"]
Tests["pytest tests"] --> App
Tests --> Conf
```

**Diagram sources**
- [config.py:16-215](file://Backend/app/core/config.py#L16-L215)
- [main.py:15-58](file://Backend/app/main.py#L15-L58)
- [auth.py:74-185](file://Backend/app/api/v1/auth.py#L74-L185)

**Section sources**
- [config.py:16-215](file://Backend/app/core/config.py#L16-L215)
- [main.py:15-58](file://Backend/app/main.py#L15-L58)

## Performance Considerations
- Prefer in-memory SQLite for most tests to avoid I/O overhead; only use live Postgres for targeted smoke tests.
- Disable external integrations via Settings to eliminate network latency and flakiness.
- Keep fixtures minimal and reuse them; avoid heavy setup inside individual tests.
- Use idempotency keys in tests to validate retry safety without side effects.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and resolutions:
- Missing external configuration:
  - LiveKit/AI not configured leads to 503 errors with explicit codes; ensure Settings include required keys or assert expected failures in tests.
- Unexpected authentication behavior:
  - In production-like environments, unauthenticated requests are rejected; use development identity header only in tests where appropriate.
- Tenancy leaks:
  - Cross-tenant access should always return forbidden with no leakage; verify error shapes and messages.
- Database connectivity:
  - For live Postgres tests, ensure THOS_DATABASE_URL is set and reachable; otherwise tests skip automatically.

**Section sources**
- [test_livekit.py:7-37](file://Backend/tests/test_livekit.py#L7-L37)
- [test_ai.py:30-55](file://Backend/tests/test_ai.py#L30-L55)
- [test_tenancy.py:27-48](file://Backend/tests/test_tenancy.py#L27-L48)
- [test_postgres.py:20-36](file://Backend/tests/test_postgres.py#L20-L36)

## Conclusion
The ATS backend employs a robust pytest strategy combining isolated unit tests, focused integration tests, and optional live-database smoke tests. Shared fixtures centralize configuration and client setup, while Settings enable deterministic behavior by disabling external dependencies. Tests cover authentication, voice interview readiness, AI fallbacks, LiveKit security, multi-tenancy, and end-to-end hiring workflows, ensuring reliability and clarity across the system.