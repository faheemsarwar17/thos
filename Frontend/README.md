# THOS Frontend

This is the Next.js App Router application for both THOS personas:
- the **employer workspace**
- the **candidate portal**, including voice interviews and the proctored sandbox

It is written in TypeScript and styled with plain CSS built on the THOS design tokens. There is no CSS framework. See [`../design.md`](../design.md).

## Stack

- **Next.js 15** (App Router) and **React 19**, TypeScript 5.8
- `livekit-client`, `@livekit/components-react`, `@livekit/components-styles`
- `react-icons` (Lucide set)
- Vitest + Testing Library (jsdom), ESLint 9 with `eslint-config-next`

## Start locally

The backend must be running first (see `../Backend/README.md`).

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and sign in with a seeded account (password `Password123!`):
- **Employer:** `ayesha.khan@nut.edu.pk`
- **Candidate:** `hira.ahmed@gmail.com`

## Routes

| Route | Screen | Persona / guard |
| --- | --- | --- |
| `/login`, `/register`, `/register/organization` | Sign in, candidate sign-up, organization application | Public |
| `/` | Employer dashboard with attention queue | Employer (`RequireAuth employerOnly`) |
| `/jobs`, `/jobs/[postingId]` | Job list and creation (`?create=1`); job detail with question-pool curation, lock, publish and matches | Employer |
| `/pipeline` | List + 4-lane Kanban, drag/keyboard moves, bulk actions, undo, application drawer (scorecards, decision) | Employer |
| `/talent` | Talent discovery | Employer |
| `/analytics` | Overview, funnel, velocity, sources, fairness, calibration | Employer |
| `/messages` | Application-linked conversations | Employer |
| `/automations` | Rule builder, toggle, dry-run simulation, run history | Employer |
| `/admin` | Units, members, roles, domain packs, workflows, email templates, audit; superadmin org verification | Employer / superadmin |
| `/candidate` | Overview (Skill Score, applications, matches) | Signed in (`RequireAuth`) |
| `/candidate/jobs` | Job discovery with match scores, apply | Candidate |
| `/candidate/applications` | Applications, 4-step timeline, withdraw, launch interview or sandbox | Candidate |
| `/candidate/messages` | Conversations | Candidate |
| `/candidate/profile` | Profile, CV upload/parse, avatar, consents | Candidate |
| `/candidate/interview` | Profile Screening (voice) launcher | Candidate |
| `/candidate/applied/[attemptId]` | Job Interview (voice) | Candidate |
| `/candidate/sandbox/[attemptId]` | Proctored coding or written sandbox | Candidate |
| `/interviews/[roomName]` | Legacy LiveKit lobby (room name `^[a-zA-Z0-9_-]{1,128}$`) | — |
| `POST /api/interviews/token` | Server-side LiveKit token proxy | Route handler |

## Auth and data access

- **Session storage.** `lib/auth.ts` keeps the access token, refresh token and session in `localStorage` (`thos.access_token`, `thos.refresh_token`, `thos.session`).
- **Route guard.** `RequireAuth` redirects to `/login` and runs in the browser only. Authorization itself is always enforced by the backend.
- **API client.** `lib/api.ts` reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) and sends `Authorization: Bearer`. On a `401` it refreshes once, sharing a single refresh across concurrent calls, then retries. Failures throw `ApiError(status, code, message)`, where status `0` means the backend is unreachable.
- **Data hook.** `lib/use-api.ts` provides `useApi<T>(path)`, which returns `{ data, error, loading, reload }`.
- **Voice adapter.** `utils/api.ts` serves the voice-interview flow. `configureVoiceApi({ kind, attemptId })` selects the profile or applied endpoints and builds the telemetry WebSocket URL. It does not refresh tokens yet.

## Voice interview flow

`components/interviews/voice/voice-portal.tsx` runs these steps in order:
1. **PermissionCheck:** microphone and camera permissions.
2. **DeviceCheck:** mic level and camera preview.
3. **InterviewSetup:** live setup steps streamed over the telemetry WebSocket.
4. **InterviewInterface:** LiveKit room, video, transcript overlay, timer, and an end-interview modal.

The backend's AI agent joins the same LiveKit room. The browser never sees LiveKit or OpenAI secrets.

## LiveKit token proxy

The browser posts `roomName` and `participantName` to `POST /api/interviews/token`. The route then:
- validates the input
- forwards the auth and session headers to `BACKEND_API_URL` + `BACKEND_LIVEKIT_TOKEN_PATH` (default `/api/v1/interviews/token`)
- returns `{ server_url, token, identity, expires_in_seconds }`

Unconfigured services produce a recoverable error message.

## Environment

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser | Backend base URL (default `http://localhost:8000`) |
| `BACKEND_API_URL` | Server only | Backend base URL for the token proxy |
| `BACKEND_LIVEKIT_TOKEN_PATH` | Server only | Optional token endpoint override |

Never put LiveKit or OpenAI keys in this project.

## Styling and responsive layout

- **Stylesheets.** `app/globals.css` imports `styles/tokens.css`, `typography.css`, `utilities.css`, `components.css` and `layout.css`, then adds its screen-specific rules, with its responsive overrides **at the end**.
- **Themes.** Light and dark, through `data-theme` on `<html>` (`ThemeToggle`), falling back to `prefers-color-scheme`.
- **Sidebar.** The shell sidebar adapts to the viewport width:

| Viewport width | Sidebar |
| --- | --- |
| > 1366px | Full 256px |
| 821–1366px | **72px icon rail** with tooltips |
| ≤ 820px | Hidden; the hamburger opens a full-screen nav |

  This keeps laptops and scaled displays usable. For example, 1600×900 at 125% is 1280px in CSS.
- **Height and grid rules:**
  - Use `100dvh`. Full-height screens scroll instead of clipping, and dialogs cap at the viewport height.
  - Use shrinkable grids (`minmax(0, 1fr)`, `auto-fit`).
  - See `design.md` §6 for the full rules and the viewports to check.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build. Also runs lint and type checks, so it fails on lint errors. |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest component and page tests (`tests/`) |

## Structure

```text
app/                 routes (see table) + api/interviews/token proxy
components/
  layout/            app-shell (sidebar / icon rail / mobile nav, top bar)
  dashboard/         employer shell, dashboard, global search
  jobs/ pipeline/ talent/ analytics/ automations/ admin/ messages/
  candidate/         candidate shell, overview, profile, jobs, applications, avatar
  interviews/        voice/ (portal, device checks, interface, transcript) + legacy LiveKit room
  sandbox/           sandbox portal, code editor, written exercise, recorder, timer, proctoring hook
  auth/              login, register, organization application, RequireAuth
  ui/                design-system primitives (see design.md §7)
lib/                 api client, auth session, types, useApi, cn
utils/api.ts         voice-interview API adapter
styles/              tokens, typography, utilities, components, layout
tests/               Vitest tests
```
