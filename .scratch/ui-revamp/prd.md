# PRD: THOS UI Revamp

Status: **Locked** for planning, 2026-10-23
Branch: `feat/ui-revamp`
Wayfinder map: [map.md](map.md)

**Inputs:**
- [Feature inventory](feature-inventory.md), which is the parity checklist
- [Glitch log](assets/glitch-log.md)
- Decisions from tickets [01](issues/01-ui-glitch-audit.md), [02](issues/02-prototype-shell-home-pipeline.md), [03](issues/03-prototype-candidate-and-media-screens.md) and [04](issues/04-research-playwright-setup.md)
- Prototype source: branch `prototype/ui-revamp` (commit `44bdb14`), routes `/prototype/ui-revamp?variant=D` and `/prototype/ui-revamp-candidate`

---

## 1. Problem

Users describe the THOS web UI as **glitchy, cluttered and confusing**. The audit of 27 routes × 5 viewports × 2 themes found 17 systemic defects:

- **Overlapping and clipped content.** Every route scrolls horizontally at 390px. Controls are clipped on Messages, Register organization, candidate Jobs and the Home requisitions table. The sidebar footer is clipped at 1280×620.
- **Clutter.** Every page stacks an eyebrow, an H1 and a paragraph. The pipeline has three stacked control rows plus a floating bar.
- **Inconsistency.** There are about 800 inline `style={{}}` blocks, and page paddings and breadcrumbs differ from page to page.
- **Dishonest data.** Analytics shows hard-coded fallback numbers as if they were real.
- **Broken frontend behaviour.** Dead `?applicationId=` deep links, admin tabs that ignore hash changes, and Talent unreadable in dark mode.

## 2. Goal

Rebuild the entire frontend UI around the approved **"D" design**:
- **Shell:** an icon rail plus a requisitions context panel, with bottom tabs on mobile.
- **Employer home:** a "Today" dashboard with KPIs, charts and an agenda.
- **Pipeline:** a funnel strip over a card grid.
- **Candidate portal:** Home is "next step" first, Applications are journey cards, Profile is a settings page.
- **Interview and sandbox:** a shell-less focus layout.

This must happen with **zero functional loss**, in one execution pass, on `feat/ui-revamp`. Afterwards, update `README.md`, `Frontend/README.md` and `design.md` (v3.0).

## 3. Non-goals and constraints

- **Hard constraints:**
  - **No backend or API changes.** Only existing endpoints are used. `POST /api/v1/notifications/mark-read` already exists.
  - **Every existing URL keeps working**, including query and hash deep links (`/jobs?create=1`, `/pipeline?posting=`, `/admin#…`, `/candidate/applied/[id]`, `/candidate/sandbox/[id]`, `/interviews/[roomName]`). New routes may only be added, never replace old ones.
  - **Light and dark themes are both kept.** The `thos-theme` localStorage key and `data-theme` on `<html>` stay as they are.
  - **The styling stack stays plain CSS with custom properties.** No Tailwind, no component library. Icons stay `react-icons/lu`.
- **Business logic stays untouched.** The voice interview and sandbox get a **visual-only** restyle. LiveKit, the WebSocket protocol, mic gating, identity check, recording, proctoring, autosave and timers are not changed.
- **Out of scope:**
  - Client-side role gating
  - New product features beyond §8 and the navigation entries in §5
  - Candidate job search or filters
  - Editing automation rules
  - Removing staff members

## 4. Design system ("D")

### 4.1 Tokens

`styles/tokens.css` is rewritten.

**Token names:**
- The existing **canonical names stay**, e.g. `--surface-app`, `--surface-card`, `--ink-900`, `--brand-500`, `--border`, `--radius-*` and `--shadow-*`, so existing CSS keeps resolving. Their values change to the approved palette.
- New semantic aliases are added for new code: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--border-strong`, `--ink`, `--ink-2`, `--ink-3`, `--brand`, `--brand-ink`, `--brand-soft`, `--brand-line`, and `--{teal,amber,red,green,violet}` / `--{…}-soft`.
- The deprecated compatibility aliases in `tokens.css` are kept until §9 cleanup confirms nothing references them.

| Role | Light | Dark |
|---|---|---|
| bg (page) | `#f7f7f8` | `#0c0d10` |
| surface (card) | `#ffffff` | `#141519` |
| surface-2 | `#f2f3f5` | `#1a1c21` |
| surface-3 | `#eaebee` | `#22252b` |
| border / border-strong | `#e5e6ea` / `#d4d6dc` | `#25282f` / `#343842` |
| ink / ink-2 / ink-3 | `#111318` / `#4b505b` / `#767c88` | `#eceef2` / `#b0b5bf` / `#7d838f` |
| brand / brand-ink / soft / line | `#2f5bea` / `#ffffff` / `#eef2fe` / `#c9d5fb` | `#7090ff` / `#0c0d10` / `#1b2340` / `#2e3d73` |
| teal (verified/packs only) / soft | `#0f7f74` / `#e5f4f1` | `#4cc7b8` / `#11302c` |
| amber / soft | `#9a5b00` / `#fcf1de` | `#e7a94a` / `#33260f` |
| red / soft | `#b8322a` / `#fbeceb` | `#f0837a` / `#3a1a18` |
| green / soft | `#1d7a45` / `#e6f4ec` | `#5fcf8e` / `#12301f` |
| violet / soft | `#6247b8` / `#f0ecfb` | `#a996f2` / `#251f3d` |

**Other tokens:**
- **Radii:** 6 / 8 / 12, plus 16 for dialogs and focus cards, plus full.
- **Shadows:** `--shadow-1` for in-flow content, `--shadow-pop` for overlays.
- **Focus:** `0 0 0 2px surface, 0 0 0 4px brand` on `:focus-visible`.
- **Motion:** 120–180ms on opacity and transform only, with `prefers-reduced-motion` respected.
- **Typography:**
  - **Inter** for everything. Poppins is removed. JetBrains Mono is used for code and IDs.
  - Sizes: base 13.5px on employer screens, 14px on candidate screens; page H1 20px/650; section H2 13.5–15px/600.
  - Tabular numbers for metrics.

### 4.2 Chart palette

This palette was validated with the dataviz validator.

- **Categorical, 4 slots** (Received / Shortlisted / Interview / Results):
  - Light: `#2a78d6, #eb6834, #1baf7a, #eda100`
  - Dark: `#3987e5, #d95926, #199e70, #c98500`
- **Magnitude:** a single blue, `#2a78d6` light / `#3987e5` dark.
- **Grid / axis lines:** light `#ececef` / `#d4d6dc`; dark `#22252b` / `#343842`.
- **Light-mode contrast:** aqua and yellow are below 3:1. Every chart therefore shows visible counts or a legend, and has a Table view.

### 4.3 Shared components

These live in `components/ui`. Existing APIs are kept; new ones are added.

- **Restyled with the same API:** `Button`, `Badge`, `Pill`, `ScoreBadge`, `PackChip`, `Modal`, `Drawer`, `Tabs`, `Breadcrumbs`, `FormField`, `Table*`, `Skeleton*`, `LoadingState`, `ErrorState`, `EmptyState`, `ToastProvider`, `ThemeToggle`, `AuthedImage`.
- **`Tabs` gains** arrow-key, Home and End roving focus.
- **New components:**
  - `PageHeader`: title, optional meta line and actions slot. One per page; it replaces eyebrow + H1 + paragraph.
  - `Switch`: an accessible `role="switch"` checkbox.
  - `Stepper`: horizontal or vertical progress.
  - `StatTile`: label, value, optional link.
  - `Popover`: anchored, closes on Esc or outside click.
  - `SegmentedControl`: `aria-pressed` buttons.
  - `NotificationsPanel`, `CommandPalette` and `FocusLayout`, specified in §5.
- **Charts** (`components/charts`):
  - `ChartCard` with a Table toggle, and `useChartTooltip` (hover plus focus; values via `textContent`).
  - `FunnelChart`, `StageMixChart` (full and compact), `TrendColumns` and `ScoreHistogram`.
  - Ported from `prototype/ui-revamp:Frontend/app/prototype/ui-revamp/charts.tsx`.

## 5. Shells and navigation

### 5.1 Employer shell (`DashboardShell` → `AppShell persona="employer"`)

**Icon rail** (60px):
- Mark, then Home, Jobs, Pipeline, Talent, Messages, Analytics, Interviews (→ `/interviews/faculty-panel`), Automations and Administration.
- Every item has a tooltip label and `aria-label`. The active item gets `aria-current="page"`.
- At the bottom: ThemeToggle, Sign out and an avatar showing name and role in a tooltip.
- **Register organization moves out of the rail.** It is linked from Administration (Organization section) and from the login page.

**Requisitions context panel** (248px):
- **Shown only on `/` and `/pipeline`.** It can be toggled from the topbar, and the toggle is remembered in localStorage `thos.panel`. It hides at ≤1180px.
- Contents:
  - The org name, then "All requisitions (n)".
  - Each posting: title, count, a status line ("Draft · finish setup" or the location), and a compact stage-mix bar.
  - "+ New requisition" (→ `/jobs?create=1`).
- Clicking a posting navigates to `/pipeline?posting={id}`.

**Topbar** (52px, sticky):
- Panel toggle (Home and Pipeline only), then the page title.
- Search button with ⌘/Ctrl K hint, which opens the CommandPalette.
- NotificationsPanel, PackChip, and the "New job" primary button (→ `/jobs?create=1`).

**At ≤820px:**
- The rail is replaced by a **bottom tab bar**: Home, Jobs, Pipeline, Messages, More.
- **More** opens a sheet with Talent, Analytics, Interviews, Automations, Administration, Theme and Sign out.
- The topbar keeps title, search icon, bell and a compact "New job" icon button.
- Content gets bottom padding so nothing hides behind the tabs.

**CommandPalette** (replaces GlobalSearch, keeps its behaviour):
- ⌘/Ctrl K opens or closes it, and Esc closes it. Arrow keys and Enter navigate the list.
- Static groups: **Go to** (every nav destination) and **Actions** (Create job, Toggle theme).
- Typing 2+ characters calls `GET /api/v1/search?q=` with a 220ms debounce. It shows "Jobs & Requisitions" (→ `/jobs/{id}`) and "Candidates & Applications" (→ `/pipeline?posting={posting_id}&applicationId={id}` (search result `applications[].id`)), plus the existing "Searching…" and "No matches" states.
- It is available to both personas.

**NotificationsPanel:**
- A popover from the bell. It loads `GET /api/v1/notifications` on open and on mount (for the unread count).
- Each item shows title, body, relative time and an unread dot. Clicking an item navigates to `item.link`.
- "Mark all read" calls `POST /api/v1/notifications/mark-read`, then refreshes.
- Footer link: employer "Open audit log" (→ `/admin#audit`); candidate "View applications" (→ `/candidate/applications`).

### 5.2 Candidate shell (`CandidateShell`)

**Desktop:**
- The same rail: Home, Jobs, Applications, Messages, Screening, Profile, plus theme, sign out and avatar.
- No context panel.
- Topbar: title, search, NotificationsPanel, PackChip and "Browse jobs".
- Comfortable density, max content width 1120px.

**At ≤820px:** bottom tabs for Home, Jobs, Applications, Screening and Profile. Messages is reachable via the topbar mail icon.

### 5.3 Focus layout (`FocusLayout`)

- **Used by:** `/candidate/interview`, `/candidate/applied/[id]`, `/candidate/sandbox/[id]` and `/interviews/[roomName]`.
- **No app shell.** It still sits inside `RequireAuth`, except `/interviews/[roomName]`, which stays public as today.
- **Header** (56px): mark, title, optional step indicator, optional right slot (timer, REC, End, Submit), and Exit.
- **Content:** centered state cards, or the full-bleed sandbox IDE.

### 5.4 Shared shell behaviour (kept)

- Skip link → `#main-content`, and `<main id="main-content" tabIndex={-1}>`.
- The wordmark links to `/` (employer) or `/candidate` (candidate).
- Active matching: exact match for `/` and `/candidate`, prefix match otherwise.
- `RequireAuth` redirects stay as they are.
- The mount APIs for org name, active pack (employer) or catalog pack (candidate), and unread count stay.
- Sign out calls `logout()` and then `router.replace("/login")`.

## 6. Screen specifications

Every screen must keep every checkbox in its section of the [feature inventory](feature-inventory.md). Each screen:
- uses `PageHeader`
- replaces its inline styles with classes, keeping a style only when it carries a dynamic value (for example a bar width)
- uses `minmax(0,1fr)` / `auto-fit` grids
- shows its own loading, error-with-retry and empty states

### 6.1 Employer

**Home (`/`), "Today":**
- `PageHeader`: "Today", with the date as meta.
- **KPI row** of `StatTile`s, using no fabricated numbers ("—" when data is missing):
  - In flight (`analytics.in_flight`)
  - New (count of `new`-category cards)
  - To score (`applied_interview_status === "evaluated"`)
  - Hired
  - Live jobs (`published_postings`)
- **Charts grid** (`auto-fit, minmax(min(100%,340px),1fr)`): FunnelChart, StageMixChart, TrendColumns (applications per day over the last 14 days, from `applied_at`) and ScoreHistogram (`profile_interview_score`).
- **Agenda** with three columns that stack ≤1180px:
  - **Now:** the new-applications task (→ `/pipeline`) and the interviews-to-score task (→ `/pipeline`).
  - **Today:** "Finish {draft}" tasks (→ `/jobs/{id}`) and Live interview room (→ `/interviews/faculty-panel`).
  - **Recent:** up to 6 notifications, each with an optional View link.
- **Parity:**
  - The attention queue and Next actions content map into the agenda.
  - The Active Requisitions table becomes the StageMix card plus the context panel. Its **"View all jobs"** and **"New requisition"** actions stay in the StageMix card header.
  - Every requisition row link (→ `/jobs/{id}`) stays, via StageMix row links.
- **APIs:** unchanged (`/analytics/pipeline`, `/postings`, `/pipeline`, `/notifications`).

**Pipeline (`/pipeline`):**
- `PageHeader` "Pipeline". Meta: "{n} candidates · {requisition title or 'All requisitions'}".
- Actions:
  - `SegmentedControl` view: **Funnel** (default) / **Board** / **Table**.
  - Blind review `Switch`.
  - Requisition `select` (keeps `?posting=` and the full-reload behaviour).
  - **Actions** menu: Screen all received (n) / Auto-shortlist top N… / Invite top N to interview….
- **Funnel view:**
  - A clickable stage strip (one step per workflow column, with counts), with the selected stage in `aria-pressed`.
  - Below it, a card grid. Each card shows: checkbox, avatar (hidden when blind), name button (opens the drawer), job, AI match reasoning (2-line clamp, or "Not screened yet"), Match and Screen `ScoreBadge`s, interview and sandbox status line, and a "Move stage…" select (`valid_destinations`, or "Final stage").
  - The stage's primary column action (Screen all / Shortlist / Invite) sits at the right of the strip.
- **Board view:**
  - The four macro lanes (Received, Shortlisted, Interview, Results), each with a count and sub-stage filter chips. One primary lane action sits in the header, which wraps under the title so it never truncates it.
  - An **"Expand stages"** toggle shows one lane per workflow stage. This replaces the old "All Stages" view.
  - Drag and drop is kept as-is (`valid_destinations`, drag-over highlight, and the drop opens the transition dialog), as is the keyboard Move select.
- **Table view:** unchanged columns, inside `TableContainer`, with select-all and the inline "Screen (N)".
- **Bulk bar:** appears only when something is selected. It is fixed at the bottom centre, above the mobile tabs. It contains: count, Move to stage… + Apply, Screen, Shortlist…, Invite…, Export CSV, Reject… and Clear.
- **Unchanged:** transition dialog, undo toast (10s countdown) and the shortlist/invite modals.
- **Bulk and automation errors** now also raise a visible error toast (they were previously screen-reader-only).
- **Deep link (fix):** `?applicationId={id}` opens the ApplicationDrawer on load and on param change. Closing the drawer removes the param with `router.replace`.
- **ApplicationDrawer:** same content and tabs, restyled. The header shows avatar, name, job, stage and ScoreBadges. The footer is sticky: Move stage select, Save scorecard (in the Scorecards tab) and the "Decide…" menu (Extend offer / Invite round 2 / Invite onsite, each with a confirm).

**Jobs (`/jobs`):**
- `PageHeader` "Jobs", with the "New job" action.
- The table becomes a stacked card list at ≤720px.
- **`?create=1` opens CreateJobForm in a right `Drawer`** (wide, `min(640px,100vw)`) over the list, instead of inline. Closing it navigates to `/jobs`. Submitting navigates to `/jobs/{id}`. Fields and AI generation are unchanged.

**Job detail (`/jobs/[postingId]`):**
- `PageHeader`: title, meta (location · work mode · status pill) and actions (Open pipeline (N), Publish (disabled with tooltip until the pool is locked), Close (confirm)).
- Two columns, `minmax(0,1fr) 320px`, stacking ≤1120px:
  - **Main:** Question pool panel (everything unchanged), Sandbox panel and Job description.
  - **Aside:** metadata list with copyable ID.

**Talent (`/talent`):**
- `PageHeader`.
- A single **filter bar** row (Keywords, Domain pack, Min score, Search, Clear) that wraps on mobile.
- Results in a responsive card grid using tokens only. This fixes dark mode.
- The empty state keeps "Display all discoverable talent".

**Messages (`/messages` and `/candidate/messages`):**
- Two panes at ≥900px: thread list 320px, conversation flexible.
- **At <900px the pair becomes list → thread.** Selecting a thread shows the conversation full-width with a Back button; the selected thread is held in state and `?c={id}`.
- The composer is always visible (sticky bottom inside the pane), and the page uses `100dvh` minus topbar and tabs.
- **"View Application"** (employer) links to `/pipeline?applicationId={id}`, which now works.
- `MessagingThreadView` is unchanged in behaviour (3s polling, Ctrl/Cmd+Enter, receipts, day separators).

**Analytics (`/analytics`):**
- `PageHeader` with a `SegmentedControl` for tabs (Funnel / SLA & bottlenecks / Fairness & calibration).
- KPI `StatTile`s **without hard-coded fallbacks**. A missing value shows "—" with "Not enough data".
- **Funnel tab:** FunnelChart plus a pass-through and drop-off table.
- **SLA tab:** stage SLA cards with status icon and label, and the bottleneck table. "Inspect" → `/pipeline?applicationId=` (now working).
- **Fairness tab:** parity and calibration figures. The "Passed" pill is derived from data, never hard-coded.
- **All five requests** get loading and error-with-retry states.

**Automations (`/automations`):**
- `PageHeader` with the "Create automation" action.
- Recipes become a 3-card row ("Use recipe").
- Rules table: status `Switch` (toggle), Simulate, Delete (confirm).
- Run log table.
- Create and Simulation modals restyled with the same fields.
- Toggle and delete errors raise an error toast.

**Administration (`/admin`):**
- `PageHeader`: org name, meta "Your role: X".
- The superadmin pending panel stays above (Verify, Reject with a reason via a `Modal` instead of `window.prompt`).
- **Settings layout:**
  - Section nav on the left at ≥960px: Units, Staff & roles, Domain packs, Hiring workflow, Email templates, Audit log and **Organization** (a new section that links to Register organization).
  - At <960px the nav becomes a horizontal scroller.
- **Hash sync fix:** the section is read from `location.hash` on mount **and on `hashchange`**, and writes `#…` on change.
- Every form and list in the sections stays unchanged.

### 6.2 Candidate

**Home (`/candidate`):**
- **"Your next step" hero:**
  - Invited or in-progress interview → "Take your job interview" (`/candidate/applied/{attempt_id}`).
  - Required sandbox, interview submitted or evaluated, sandbox not done → "Complete the proctored sandbox" (`/candidate/sandbox/{attempt_id}`).
  - Otherwise "You're all caught up".
- **Tiles:** Profile screening best score (Start/Resume/Retake → `/candidate/interview`), Active applications (→ applications), Open jobs (→ `/candidate/jobs`) and Discoverable on/off (→ profile privacy).
- **Two panels:**
  - **Applications:** job, org, status pill, "Take job interview" CTA.
  - **Suggested jobs:** from `/me/matches` (title, location, first reason, Match score, "View role" → `/candidate/jobs`), with a fallback to open jobs.
- **Kept:** the profile screening attempts list (in a collapsible "Screening history" inside the Screening tile or panel) and the Edit profile link.

**Jobs (`/candidate/jobs`):**
- Card list with a wrapping header: org, title, location, type, "Screening required" chip, and Apply now / Applied.
- Description expand ("Read full description / Show less") and the process steps line are kept.

**Applications (`/candidate/applications`):**
- **Journey cards:** header (title, org, applied/updated, status pill), then a vertical timeline of `status_order`.
- The current step carries the inline action: Complete interview / Take sandbox / "Sandbox pending" / "Sandbox complete", or "Waiting on the employer".
- Scores row: Overall match, Voice interview, Technical sandbox.
- **"Details"** toggle (`aria-expanded`) lazy-loads `GET …/{id}/timeline` (dated steps plus Expected next step) and shows the AI growth roadmap markdown.
- **Withdraw** uses the shared `Modal` (Esc, focus trap), with Keep / Confirm withdrawal.

**Profile (`/candidate/profile`):**
- Settings layout with section nav: Profile, Photo, Resume, Privacy.
- Same fields, limits and endpoints.
- Native file inputs are replaced by styled `<label>` buttons and a drop zone (input hidden but focusable).
- Consents become `Switch`es.

**Screening (`/candidate/interview`):**
- An explainer card, then the existing launcher logic (resume an `in_progress` attempt or create one), then the focus-layout voice flow.

### 6.3 Voice interview and sandbox (focus layout, visual only)

**Voice flow** (`VoicePortal` and its children). Same components and state machine, new markup and classes:
- **`StepIndicator`** moves into the focus header.
- **PermissionCheck:** a centred card with an amber help alert and Retry.
- **DeviceCheck:** preview and mic meter side by side, stacking ≤900px. The 10s test, playback, confirm checkbox and Continue gating are kept.
- **InterviewSetup:** details and instructions, then 3-stage progress; the failure card is kept.
- **InterviewInterface:**
  - Header: title (**"Skill screening"** for `kind="profile"`, "Job interview" for applied; this fixes the hard-coded title), timer, End.
  - Stage: AI tile (wave and state chip), self tile (mirrored video), mic bar.
  - Transcript panel. Everything stacks ≤900px with no fixed-height clipping.
- **EndInterviewModal** uses the restyled `Modal` semantics.
- **Complete screen:** success card with "Continue to the sandbox" / "Back to candidate home".

**Sandbox:**
- **Lobby** card: config, rules, Share screen / Enable camera & mic as check buttons, and Start/Resume in fullscreen.
- **Active:** focus header (difficulty, title, REC, timer, Submit) above the problem pane | editor, stacking ≤960px. Written mode keeps per-prompt textareas and word counts.
- The violation notice is a pill above the bottom edge.
- **Done:** score card. The analyzing overlay is kept.

**Interviews room (`/interviews/[roomName]`):** focus layout lobby card; the LiveKit `VideoConference` is unchanged.

### 6.4 Public

`/login`, `/register` and `/register/organization` use an auth layout:
- At ≥1024px: a left brand panel (wordmark, one-line value statement, the trust line "Tenant-isolated & WCAG 2.2 AA compliant") and a right form card.
- Below that, a single column.

Everything else is kept:
- **Login:** prefilled credentials, Quick Demo Accounts and links.
- **Register:** fields and links.
- **Register organization:** auth-check gating, admin account block, org fields, success panel and back targets. The org form uses a 2-column grid at ≥720px and 1 column below.

## 7. Responsive and accessibility acceptance

The must-hold rules come from the glitch log. They are checked at **1280×620, 1366×768, 1536×730, 1920×1080 and 390×844**, in light and dark:

1. **No horizontal page scroll** (`documentElement.scrollWidth ≤ innerWidth`) on any route.
2. **Every interactive control is visible and unclipped.** No control is off-screen or clipped by an `overflow: hidden` ancestor, unless it is inside an intentional horizontal scroller.
3. **No text or controls escape their bordered container.** Titles are never truncated by sibling actions; actions wrap below.
4. **Messages:** list → thread on mobile, with the composer reachable.
5. **Admin:** tabs follow hash changes. **Analytics:** never shows fabricated numbers.
6. **All native controls are themed in both modes:** selects, checkboxes (`accent-color`), file inputs and switches.
7. **One `PageHeader` per page.** Media routes use `FocusLayout`.

**Accessibility baseline (kept and extended):**
- Skip link and `:focus-visible` rings everywhere.
- 44px minimum touch targets on mobile tabs and nav.
- Icon-only buttons carry `aria-label`.
- Status is never shown by colour alone.
- Live regions: polite toasts and pipeline announcements.
- `prefers-reduced-motion` is respected.
- `Tabs` support arrow keys.
- Charts have Table views and focusable marks.

## 8. Frontend defect fixes (in scope)

1. **`?applicationId=` deep link** opens the ApplicationDrawer on `/pipeline`. This affects the Messages "View Application", Analytics "Inspect" and CommandPalette candidate results.
2. **Talent:** cards follow theme tokens.
3. **Candidate Withdraw** uses the shared `Modal`.
4. **Analytics:** no fabricated fallbacks; error states for every request.
5. **Visible error toasts** for pipeline bulk and automation actions, and for automation toggle and delete.
6. **Admin hash sync** on `hashchange`.
7. **Voice interview header title** reflects the kind (profile vs applied).
8. **Superadmin reject reason** via `Modal` instead of `window.prompt`.
9. **Next.js dev indicator:** set `devIndicators: { position: "bottom-left" }` (dev only) so it never covers topbar actions.

## 9. Cleanup

- **Delete the orphaned files:**
  - `components/candidate/interview-session.tsx`
  - `components/interviews/voice/DevicePermissionGate.tsx`, `ContextBanner.tsx` and `AIVisualizer.tsx`
  - `lib/dashboard-data.ts` and `lib/persona.ts`
- **`TranscriptOverlay.tsx`:** keep it, or move its exported type into the file that uses it.
- **`GlobalSearch`** is replaced by `CommandPalette`; the old file is deleted once nothing imports it.
- **Old stylesheets:** remove dead classes from `components.css`, `layout.css` and `globals.css`. The goal is that no class is left unused (check with grep).
- **Compatibility aliases:** remove a deprecated alias in `tokens.css` once grep shows it has no references.

## 10. Verification ("done")

1. `npm run typecheck`, `npm run lint`, `npm test` (Vitest) and `npm run build` all pass.
2. **Vitest unit tests** for the new primitives (PageHeader, Switch, Stepper, Popover, SegmentedControl, CommandPalette, NotificationsPanel, the charts) and for the defect fixes (applicationId drawer, admin hashchange, analytics no-fallback). The existing tests are updated to the new markup.
3. **Playwright suite** in `Frontend/e2e/`, set up per [research-playwright.md](assets/research-playwright.md):
   - API login per worker into storageState; `baseURL` `http://localhost:3000`; Chromium.
   - `e2e/parity/*.spec.ts`: per route, the key controls from the feature inventory exist and work, read-only where possible.
   - `e2e/layout.spec.ts`: rules 1–3 (overflow, clipped, escapes-container) across 5 viewports × 2 themes on every route.
   - `e2e/visual.spec.ts`: `CAPTURE_ONLY=1` screenshot capture into `e2e/__screens__/`.
   - Media routes use fake-device flags and stubs for `getDisplayMedia` and `requestFullscreen`.
4. **The feature inventory is ticked** box by box in a copy at `.scratch/ui-revamp/parity-signoff.md`.
5. **A manual pass of the real voice interview and sandbox**, if keys are available; otherwise a recorded note.

## 11. Documentation

- **`design.md` v3.0:** rewritten to describe the D system (tokens, charts palette, shells, focus layout, components, breakpoints, acceptance rules, verification sizes).
- **`Frontend/README.md`:**
  - Route map, shells, components and the testing commands (`npm run e2e`, `npm run e2e:capture`).
  - Correct the README claims that don't match the code: job detail "matches", analytics "sources", candidate job match scores, pipeline "keyboard moves" (now the Move select plus the board), and the token route response `{token, serverUrl}`.
- **Root `README.md`:** the frontend overview and screenshots section updated, plus the e2e commands.

## 12. Risks

- **`pipeline-page.tsx` (1,936 lines) and `InterviewInterface.tsx` (1,534 lines):** restyle in place by swapping markup and classes inside the existing component, never rewriting state logic. Diffs must leave hooks, effects and handlers byte-identical except for JSX.
- **Context-panel data on Pipeline:** the panel needs postings plus pipeline columns. The pipeline page already loads both, and Home loads both. The panel fetches its own (`/postings`, `/pipeline`) and accepts the cost of one extra request.
- **Dark-mode drift from hard-coded colours:** lint check with a grep gate (no `#fff`/`white`/hex in component TSX except chart and media surfaces).
