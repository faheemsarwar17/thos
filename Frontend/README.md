# THOS frontend

Next.js App Router application for the THOS pilot MVP, covering both personas end to end. It uses TypeScript, custom CSS based on the THOS design tokens, accessible shared primitives, and a LiveKit interview room client.

**Employer workspace** — dashboard with live attention queue (`/`), job creation and question-pool curation (`/jobs`, `/jobs/[postingId]`), pipeline list and Kanban with drag-and-drop, keyboard movement, transition dialogs, and the application drawer (`/pipeline`), and administration for units, members, packs, workflows, and audit (`/admin`).

**Candidate portal** — Skill Profile overview (`/candidate`), profile and consent management (`/candidate/profile`), job discovery and one-click apply (`/candidate/jobs`), application timelines (`/candidate/applications`), and autosaving Profile/Applied Interview sessions (`/candidate/interview`, `/candidate/applied/[attemptId]`).

Authentication is not integrated yet; a persona switcher in both shells sets the `X-Development-Identity` header the backend accepts in development. Seeded personas cover administrators, a recruiter, a hiring manager, and two candidates across two tenants.

## Requirements

- Node.js 20.9 or newer
- npm 10 or newer
- A THOS backend token endpoint for live interviews
- A backend configured with LiveKit credentials

## Start locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Start the backend first (`uvicorn app.main:app` in `Backend/`) so pages have data; the employer dashboard is at `/`, the candidate portal at `/candidate`, and an interview lobby at `/interviews/<roomName>`.

## Environment

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser | Base URL of the THOS backend; defaults to `http://localhost:8000` |
| `BACKEND_API_URL` | Server only | Base URL of the THOS backend for the LiveKit token proxy |
| `BACKEND_LIVEKIT_TOKEN_PATH` | Server only | Optional token endpoint override; defaults to `/api/v1/interviews/token` |

Do not place a LiveKit API key or secret in this project. The browser posts `roomName` and `participantName` to the frontend route at `POST /api/interviews/token`. That route validates the request, forwards the current authorization/session headers, maps the payload to the backend’s `room_name` contract, and proxies it server-side. For local development it also maps the entered name to the backend-supported `X-Development-Identity` header; production identity remains the backend’s responsibility. The backend must authenticate/authorize the participant and return:

```json
{
  "server_url": "wss://project.livekit.cloud",
  "token": "signed-livekit-access-token",
  "identity": "authenticated-participant",
  "expires_in_seconds": 900
}
```

The frontend returns the backend-issued token and LiveKit URL to the room client. If either service is unconfigured or unavailable, the lobby displays a specific recoverable error instead of exposing implementation details or secrets.

## Scripts

- `npm run dev` — start the development server
- `npm run build` — create a production build
- `npm run start` — serve the production build
- `npm run lint` — run ESLint with Next.js rules
- `npm run typecheck` — run TypeScript without emitting files
- `npm test` — run Vitest component/page smoke tests

## Structure

- `app/` — App Router pages for both personas and the server-side interview token proxy
- `components/ui/` — design-system primitives (`button`, `pill`, `score-badge`, `pack-chip`, `attention-queue-card`, `table`, loading/error/empty states)
- `components/dashboard/` — employer shell, navigation, persona switcher, and dashboard
- `components/jobs/`, `components/pipeline/`, `components/admin/` — employer feature screens
- `components/candidate/` — candidate shell, overview, profile, jobs, applications, and the shared autosaving `InterviewSession`
- `components/interviews/` — LiveKit lobby and room client
- `lib/` — API client (`api.ts`), backend response types (`types.ts`), `useApi` hook, personas
- `tests/` — component and page-level smoke coverage

All screens fetch tenant-scoped data from the backend at request time; authorization is enforced by the backend, and the client only decides what to render.
