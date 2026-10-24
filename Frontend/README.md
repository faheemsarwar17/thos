# THOS Frontend

This is the Next.js App Router application for both THOS personas:
- the **employer workspace**
- the **candidate portal**, including voice interviews and the proctored sandbox

It is written in TypeScript and styled with plain CSS built on the THOS design tokens. There is no CSS framework. See [`../design.md`](../design.md) (v3.0) for the design system.

## Stack

- **Next.js 15** (App Router) and **React 19**, TypeScript 5.8
- `livekit-client`, `@livekit/components-react`, `@livekit/components-styles`
- `react-icons` (Lucide set)
- Vitest + Testing Library (jsdom), Playwright for end-to-end and layout checks, ESLint 9 with `eslint-config-next`

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

Shell types:
- **rail**: the app shell (icon rail, topbar, bottom tabs on mobile)
- **focus**: `FocusLayout`, with no app shell
- **auth**: `AuthLayout`

| Route | Screen | Persona / guard | Shell |
| --- | --- | --- | --- |
| `/login`, `/register`, `/register/organization` | Sign in, candidate sign-up, organization application | Public | auth |
| `/` | **Today**: stat tiles, an agenda (Now / Today / Recent), and funnel, stage-mix, trend and score charts | Employer (`RequireAuth employerOnly`) | rail + requisitions panel |
| `/jobs` | Job list; the create form opens in a drawer (`?create=1`) | Employer | rail |
| `/jobs/[postingId]` | Job detail: question-pool curation (reorder, remove), lock, sandbox settings, publish, description and metadata | Employer | rail |
| `/pipeline` | Funnel, Board and Table views; posting filter (`?posting=`), bulk actions, undo; application drawer (`?applicationId=`) with scorecards and decision | Employer | rail + requisitions panel |
| `/talent` | Talent discovery | Employer | rail |
| `/analytics` | Funnel; SLA & bottlenecks; fairness & calibration | Employer | rail |
| `/messages` | Application-linked conversations (list → thread on mobile) | Employer | rail |
| `/automations` | Rule builder, toggle, dry-run simulation, run history | Employer | rail |
| `/admin` | Settings-style sections selected by hash (`#members`, `#packs`, `#workflows`, `#emails`, `#audit`, …); superadmin org verification | Employer / superadmin | rail |
| `/candidate` | Home: next step, applications, suggested jobs, profile snapshot | Signed in (`RequireAuth`) | rail |
| `/candidate/jobs` | Job discovery and apply | Candidate | rail |
| `/candidate/applications` | Application journey cards (stepper), withdraw, launch interview or sandbox | Candidate | rail |
| `/candidate/messages` | Conversations | Candidate | rail |
| `/candidate/profile` | Settings-style profile: details, CV upload/parse, avatar, consents | Candidate | rail |
| `/candidate/interview` | Skill screening (voice) | Candidate | focus |
| `/candidate/applied/[attemptId]` | Job interview (voice) | Candidate | focus |
| `/candidate/sandbox/[attemptId]` | Proctored coding or written sandbox | Candidate | focus (full-bleed) |
| `/interviews/[roomName]` | Legacy LiveKit lobby (room name `^[a-zA-Z0-9_-]{1,128}$`) | — | focus |
| `POST /api/interviews/token` | Server-side LiveKit token proxy | Route handler | — |

Corrections to earlier versions of this README:
- Job detail has no "matches" section.
- Analytics has no "sources" view.
- Candidate job listings show no match scores.
- To move a pipeline card without a mouse, use its **Move stage…** select. The Board view also supports drag and drop.

## Shells

- **App shell** (`components/layout/app-shell.tsx`, wrapped by `DashboardShell` and `CandidateShell`):
  - A 60px icon rail with tooltips, the theme toggle, Sign out and an avatar.
  - A sticky topbar with the page title, the command palette trigger (⌘/Ctrl K, `CommandPalette`), `NotificationsPanel`, the pack chip and the persona action.
  - At ≤820px the rail becomes bottom tabs plus a **More** sheet.
- **Requisitions panel** (`components/layout/requisitions-panel.tsx`). Employer Home and Pipeline only. It is toggled from the topbar, remembered in `localStorage["thos.panel"]`, and hidden at ≤1180px.
- **Focus layout** (`components/layout/focus-layout.tsx`). A 56px header (mark, title, optional steps, right slot, Exit) over either a centred card or full-bleed content. The active sandbox has no Exit, because leaving fullscreen submits.
- **Auth layout** (`components/auth/auth-layout.tsx`). A brand panel beside the form card at ≥1024px, and one column below that.

## Components

- **`components/ui/`**: the design-system primitives.
  - Buttons and labels: Button, Badge, Pill, ScoreBadge, PackChip
  - Forms and controls: FormField, Switch, SegmentedControl, Tabs, Stepper
  - Page structure: PageHeader, Breadcrumbs, StatTile, Table (`TableContainer`)
  - Overlays: Drawer, Modal, Popover, ToastProvider
  - State views: Skeleton, `LoadingState`, `EmptyState`, `ErrorState`
  - Other: ThemeToggle, AttentionQueueCard, AuthedImage
- **`components/charts/`**: ChartCard, FunnelChart, StageMixChart, TrendColumns, ScoreHistogram and the shared tooltip hook. Charts use the palette in `design.md` §3.
- **`components/layout/`**: the shells above, CommandPalette and NotificationsPanel.
- **Shared helpers**:
  - `lib/pipeline-phases.ts` (`PHASES`, `phaseOf`)
  - `lib/candidate-next-step.ts` (`nextStep`, `sandboxState`, `isTerminal`)
  - `lib/rel-time.ts`
  - `components/messages/messages-inbox.tsx` serves both Messages pages.

See `design.md` §7 for the full inventory.

## Auth and data access

- **Session storage.** `lib/auth.ts` keeps the access token, refresh token and session in `localStorage` (`thos.access_token`, `thos.refresh_token`, `thos.session`).
- **Route guard.** `RequireAuth` redirects to `/login` and runs in the browser only. Authorization itself is always enforced by the backend.
- **API client.** `lib/api.ts` reads `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) and sends `Authorization: Bearer`. On a `401` it refreshes once, sharing a single refresh across concurrent calls, then retries. Failures throw `ApiError(status, code, message)`, where status `0` means the backend is unreachable.
- **Data hook.** `lib/use-api.ts` provides `useApi<T>(path)`, which returns `{ data, error, loading, reload }`.
- **Voice adapter.** `utils/api.ts` serves the voice-interview flow. `configureVoiceApi({ kind, attemptId })` selects the profile or applied endpoints and builds the telemetry WebSocket URL. It does not refresh tokens yet.

## Voice interview flow

`components/interviews/voice/voice-portal.tsx` runs these steps in order, inside `FocusLayout`:
1. **PermissionCheck:** microphone and camera permissions.
2. **DeviceCheck:** mic level and camera preview.
3. **InterviewSetup:** live setup steps streamed over the telemetry WebSocket.
4. **InterviewInterface:** LiveKit room, video, transcript, timer, and an end-interview modal.

The backend's AI agent joins the same LiveKit room. The browser never sees LiveKit or OpenAI secrets.

## LiveKit token proxy

The browser posts `roomName` and `participantName` to `POST /api/interviews/token`. The route then:
- validates the input
- forwards the auth and session headers to `BACKEND_API_URL` + `BACKEND_LIVEKIT_TOKEN_PATH` (default `/api/v1/interviews/token`)
- returns `{ token, serverUrl }`

Errors come back as `{ error }` with the backend's status, or `502`. If the services aren't configured, the user gets a message and can recover.

## Environment

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Browser | Backend base URL (default `http://localhost:8000`) |
| `BACKEND_API_URL` | Server only | Backend base URL for the token proxy |
| `BACKEND_LIVEKIT_TOKEN_PATH` | Server only | Optional token endpoint override |
| `NEXT_DIST_DIR` | Build only | Optional output folder (for example `.next-build`), so a build doesn't overwrite a running dev server's `.next` |

Never put LiveKit or OpenAI keys in this project.

## Styling and responsive layout

- **Stylesheets.** `app/globals.css` imports these, in order:
  1. `styles/tokens.css`
  2. `theme.css`
  3. `typography.css`
  4. `utilities.css`
  5. `components.css`
  6. `charts.css`
  7. `layout.css`
  8. `styles/screens/*.css`

  It then adds the global base rules.
- **Colours.** Use semantic tokens (`var(--ink)`, `var(--surface)`, …), never raw colours. `npm run check:colors` fails if a `.tsx` file in `app/` or `components/` hard-codes a colour.
- **Themes.** Light and dark, through `data-theme` on `<html>`, falling back to `prefers-color-scheme`. `ThemeToggle` stores the choice in `localStorage["thos-theme"]`.
- **Breakpoints:**
  - ≤1180px: the requisitions panel hides.
  - ≤820px: the rail becomes bottom tabs.
  - ≤720px: tables stack into cards.
  - ≤600px: drawers go full-screen.

  The full table is in `design.md` §6.2.
- **Height and grid rules.** Use `100dvh`, shrinkable grids (`minmax(0, 1fr)`, `auto-fit`), and `min-width: 0` on flex children that hold text. See `design.md` §6.

## Testing

| Command | What it does |
| --- | --- |
| `npm test` | Vitest component and unit tests (`tests/`) |
| `npm run e2e` | Every Playwright spec except screenshot capture: the layout rules plus the parity specs in `e2e/parity/` |
| `npm run e2e:layout` | `e2e/layout.spec.ts` only: every route × 5 viewports × 2 themes, checked against the must-hold rules (`e2e/layout-rules.ts`) |
| `npm run e2e:capture` | Writes screenshots to `e2e/__screens__/{viewport}/{theme}/{route}.png` (gitignored) |
| `npm run check:colors` | Fails if a component or route hard-codes a colour instead of using a token |

Playwright runs five projects: `w1280` (1280×620), `w1366` (1366×768), `w1536` (1536×730), `w1920` (1920×1080) and `w390` (390×844, mobile with touch). To run only one, add `--project=w390`.

- **Servers.** By default the specs expect the backend on `:8000` and `npm run dev` on `:3000` to be running already.
  - Set `PW_START_SERVERS=1` to have Playwright start them. The backend then uses `Backend/data/e2e.db` (gitignored) with demo seed data, so the tracked `thos.db` stays clean.
  - Use `http://localhost:3000`, not `127.0.0.1`, because the backend's CORS list only has `localhost`.
- **Read-only guard.** Every spec that touches signed-in screens calls `readOnly(page)` from `e2e/fixtures.ts`. It answers every non-GET API call (except `/api/v1/auth/*`) and the token proxy with a `403 e2e_read_only`. So the suite never changes data; specs check how the UI responds to the blocked call.
- **Sign-in.** `signIn(page, persona, theme)` logs in through the API and seeds `localStorage` before the page loads. Each call gets a fresh session, because refresh tokens are single-use.
- **Skips.** Some parity specs skip when the seed data lacks what they need. For example, the messages thread test needs at least one conversation.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build. Also runs lint and type checks. While `npm run dev` is running, build with `NEXT_DIST_DIR=.next-build npm run build` instead. |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test`, `npm run e2e*`, `npm run check:colors` | See [Testing](#testing) |

## Structure

```text
app/                 routes (see table) + api/interviews/token proxy
components/
  layout/            app shell (rail, topbar, bottom tabs), requisitions panel, focus layout, command palette, notifications
  dashboard/         employer shell and Today dashboard
  charts/            funnel, stage mix, trend, histogram, chart card
  jobs/ pipeline/ talent/ analytics/ automations/ admin/ messages/
  candidate/         candidate shell, home, profile, jobs, applications, avatar
  interviews/        voice/ (portal, device checks, interface, transcript) + legacy LiveKit room
  sandbox/           sandbox portal, code editor, written exercise, recorder, timer, proctoring hook
  auth/              auth layout, login, register, organization application, RequireAuth
  ui/                design-system primitives (see design.md §7)
lib/                 api client, auth session, types, useApi, pipeline phases, candidate next step, rel-time, cn
utils/api.ts         voice-interview API adapter
styles/              tokens, theme, typography, utilities, components, charts, layout, screens/
scripts/             check-colors.mjs
tests/               Vitest tests
e2e/                 Playwright: fixtures, routes, layout rules, parity/ specs, capture
```
