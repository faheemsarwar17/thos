# THOS Frontend — Parity sign-off (UI revamp)

Copied from `feature-inventory.md` (captured from `main` @ 550cd38) and signed off on `feat/ui-revamp`, 2026-10-24.

**How each item was verified:**
- `e2e:<spec>`: a Playwright spec in `Frontend/e2e/parity/` (w1366 unless noted; `signoff` = `signoff.spec.ts`). Every route is also covered by `e2e/layout.spec.ts` (5 viewports × 2 themes).
- `unit:<test>`: a Vitest test in `Frontend/tests/`.
- `manual (unchanged)`: the source file is byte-identical to 550cd38 (`git diff 550cd38 -- <file>` is empty), so the behaviour is the pre-revamp behaviour.
- `manual (code)`: I read the current code and confirmed the behaviour or endpoint is still wired. I also compared every `api.*`/`useApi` call path between 550cd38 and HEAD: the only calls that disappeared belonged to the deleted orphan `interview-session.tsx`. In the voice and sandbox components, the only strings lost were inline-style values, which moved to CSS.

The e2e suite is read-only (`readOnly()` blocks every mutating call), so items that only show after a **successful** write stay unticked unless a unit test or an unchanged file covers them. Where seed data lacks a state, `signoff.spec.ts` mocks the GET response (automation rules; a draft posting with an editable pool).

---

## 0. Shared shell & cross-cutting

### `lib/auth.ts`
- [x] localStorage keys `thos.access_token`, `thos.refresh_token`, `thos.session` (user, memberships, candidate_id, is_superadmin, has_employer_membership) — manual (unchanged); e2e fixtures seed exactly these keys
- [x] getAccessToken / getRefreshToken / getSession / saveSession / clearSession / isAuthenticated / currentSession — manual (unchanged)

### `lib/api.ts`
- [x] get/post/postForm/patch/put/delete; Bearer header — manual (unchanged)
- [x] 401 → single shared refresh (`POST /api/v1/auth/refresh`) → retry; failed refresh clears session — e2e:signoff "candidate API session survives a token refresh" (refresh + retry); clear-on-failure: manual (unchanged)
- [x] `ApiError(status, code, message)`; status 0 `network_unreachable` → "The THOS API is unreachable…" — manual (unchanged)
- [x] login / register / logout (logout clears session even if call fails); `idempotencyKey()` — e2e:signoff (login); manual (unchanged) for the rest

### `RequireAuth`
- [x] No token → `/login`; `employerOnly` without employer membership/superadmin → `/candidate`; "Checking your session…" — e2e:signoff "signed-out visitors are sent to login", "employer route guard sends candidates to their portal"; file unchanged

### `AppShell` (both personas)
- [x] Skip link → `#main-content` — e2e:shell; unit:app-shell "keeps the skip link and main landmark"
- [x] Sidebar → **icon rail** (by design, PRD). Wordmark mark, nav with `aria-current` and exact/prefix matching, avatar initials (name + role in its label), Sign out. The tenant block and persona tag are replaced: the org name heads the requisitions panel and the More sheet. No nav counts were in use. — e2e:shell; unit:app-shell
- [x] Topbar: hamburger → bottom tabs; GlobalSearch → command palette; PackChip; ThemeToggle (now in the rail); bell → `NotificationsPanel` with unread count (employer link `/admin#audit`, candidate link `/candidate/applications`); persona action — e2e:shell; unit:shell-widgets; manual (code) for the candidate link in `notifications-panel.tsx`
- [x] Mobile nav: bottom tabs + More sheet with the remaining destinations, theme and Sign out — e2e:shell "mobile bottom tabs and More sheet" (w390)
- [x] Mount APIs — employer: `GET /organizations/current`, `GET /organizations/current/domain-packs/active`; candidate: `GET /packs/catalog`; both: `GET /notifications` — manual (code) `app-shell.tsx:46-53`, `notifications-panel.tsx`

### Employer shell (`dashboard-shell.tsx`)
- [x] Primary: Home, Jobs, Pipeline, Talent, Analytics, Messages (plus Interviews → `/interviews/faculty-panel`) — e2e:shell
- [x] Manage: Automations, Administration. **Register organization moved** to Administration → Organization — e2e:shell, e2e:automations-admin
- [x] Topbar action "New job" → `/jobs?create=1`; no role-based hiding — e2e:jobs; manual (code) `dashboard-shell.tsx:44`

### Candidate shell
- [x] Home, Jobs, Applications, Messages, Screening, Profile (renamed, same routes); topbar "Browse jobs" — e2e:shell "candidate shell"

### GlobalSearch → CommandPalette
- [x] ⌘K/Ctrl K opens; Esc closes; trigger shows the shortcut — e2e:shell; unit:shell-widgets "opens with Ctrl+K and lists destinations"
- [x] 220ms debounce, ≥2 chars, `GET /search?q=`; groups "Jobs & Requisitions" (→ `/jobs/{id}`) and "Candidates & Applications" (→ `/pipeline?posting=…&applicationId=…`, which now opens the drawer) — unit:shell-widgets "searches after 2 characters and links candidates to the drawer deep link"; manual (code) `command-palette.tsx:47-68`

### Theme, toasts, primitives
- [x] ThemeToggle: `localStorage thos-theme`, prefers-color-scheme fallback, `data-theme` on html — unit:theme-and-toast; e2e fixtures + layout.spec (both themes)
- [x] Toasts: success/error/info/warning, 4s auto-dismiss, dismiss button, polite live region "Notifications" — unit:theme-and-toast; manual (code) `toast-provider.tsx` (default 4000ms)
- [x] Modal & Drawer: Esc, backdrop, focus + restore, labelled close — e2e:jobs, e2e:pipeline, e2e:candidate-apps-profile (Esc); unit:primitives (Popover Esc); manual (code) focus/restore in `modal.tsx:40-44`, `drawer.tsx:43-47`
- [x] LoadingState / ErrorState (Retry) / EmptyState; Skeleton, TableSkeletonRows, TableEmpty, Tabs, Breadcrumbs, Pill tones, ScoreBadge tiers, PackChip, Badge, FormField, AttentionQueueCard, AuthedImage — unit:components, unit:primitives ("Tabs keyboard"), unit:theme-and-toast (skeletons), unit:analytics (ErrorState)
- [x] `@livekit/components-styles` global import — manual (code) `app/layout.tsx:2`

### Orphaned code (decide keep/delete)
- Decided in Task 17: **deleted** `interview-session.tsx`, `DevicePermissionGate.tsx`, `ContextBanner.tsx`, `AIVisualizer.tsx`, `TranscriptOverlay.tsx` (type moved to `voice/types.ts`), `lib/dashboard-data.ts`, `lib/persona.ts`.

---

## 1. `/login`
- [x] Email/password prefilled (ayesha.khan@nut.edu.pk / Password123!); demo buttons Employer / Candidate (hira.ahmed@gmail.com) — e2e:auth
- [x] `POST /auth/login` → `/` if employer else `/candidate`; inline error; loading button — e2e:signoff (wrong password shows an alert; candidate lands on `/candidate`); loading state: manual (code)
- [x] Links to `/register`, `/register/organization`; footnote "Tenant-isolated & WCAG 2.2 AA compliant" (now in the auth layout's brand panel) — e2e:auth, e2e:signoff; manual (code) `auth-layout.tsx:24`

## 2. `/register`
- [x] Full Legal Name, Email, Password (min 8) → `POST /auth/register` → `/candidate`; links to login & org registration — e2e:signoff (fields, Sign In link); submit: manual (code) `register-form.tsx:25-26` (not submitted: it would create an account)

## 3. `/register/organization`
- [x] Waits for auth check; unauthenticated shows Administrator Account (name, work email, password ≥8) — e2e:signoff
- [x] Org fields: Display Name*, Legal Entity Name, Company Domain*, Official Contact Email*, Contact Phone*, Registration/Tax Number, Address* — e2e:signoff; e2e:auth (fits at w390)
- [x] `POST /organizations/applications {…, org_type:"company", idempotency_key}` → "Application Received" + "Proceed to Sign In" — manual (code) `organization-apply-form.tsx:44-81` (not submitted: it would create an application)

## 4. `/` Employer Home → **Today**
- [x] APIs: `/analytics/pipeline`, `/postings`, `/pipeline`, `/notifications` — unit:dashboard; manual (code)
- [x] Breadcrumbs, "System operational" — **removed by design** (PRD: one PageHeader, date as meta) — e2e:home (h1 "Today")
- [x] Attention queue → stat tiles (In flight, New, To score, Hired, Live jobs) + agenda "Now" — e2e:home; unit:dashboard
- [x] Active Requisitions table → requisitions panel + "Requisitions by stage" chart; "View all jobs", "New requisition" — e2e:home; e2e:shell (panel); unit:charts
- [x] Recent Activity → agenda "Recent" (with empty state) — unit:dashboard
- [x] Next actions incl. "Live interview room" → `/interviews/faculty-panel` (now also a rail item) — e2e:home ("Join" link), e2e:shell

## 5. `/jobs`
- [x] `?create=1` shows the create form (now in a drawer; Esc → `/jobs`) — e2e:jobs
- [x] `GET /postings` table: title+location+work_mode, applicants, status, pool, Pinned Pack, Manage — e2e:signoff "jobs table columns and links"
- [x] Create form: Title*, Location, Work Mode, Domain Pack, Description — e2e:jobs
- [x] "Auto-generate with AI" → `POST /postings/generate-description` — e2e:jobs (button); endpoint: manual (code)
- [x] Sandbox checkbox; Sandbox Type, Difficulty, Time Limit — e2e:jobs
- [ ] `POST /postings {…, idempotency_key}` → `/jobs/{id}`; inline errors — endpoint still wired (manual (code)); success path not exercised: the read-only suite blocks the write

## 6. `/jobs/[postingId]`
- [x] `GET /postings/{id}`; loading / error+retry — e2e:jobs, e2e:signoff
- [x] Header: "Open Pipeline (N)" → `/pipeline?posting=`; Publish disabled until pool locked — e2e:jobs, e2e:signoff
- [ ] Publish / Close success (`POST …/publish`, `…/close` with confirm) — endpoints wired (manual (code) `job-detail-page.tsx:420-446`); not exercised: writes
- [x] Question pool: Generate button (draft without pool); reorder up/down (first "up" disabled); remove; Save Curation appears when dirty; Lock disabled while dirty; Discard; Lock confirm modal — e2e:signoff (mocked draft pool); the save/lock POSTs themselves are writes and are not exercised
- [x] Sandbox panel (draft only): Enable/Configure → format/difficulty/time — e2e:signoff
- [x] Metadata: Requisition ID + copy — e2e:jobs; e2e:signoff ("Job Metadata")
- [x] JD panel with mini-markdown — e2e:signoff (heading); renderer: manual (code) `job-detail-page.tsx:640-675`

## 7. `/pipeline`
- [x] `?posting=` filter; `GET /postings` for dropdown — e2e:signoff "posting filter…"
- [x] ~~KNOWN GAP~~ **Fixed:** `?applicationId=` opens the drawer — e2e:pipeline; unit:pipeline-deeplink
- [x] Header: Screen all received (in the Actions menu), requisition filter, Blind review (anonymises cards), views Funnel / Board / Table — e2e:pipeline
- [x] Automation bar → Actions menu: Screen / Shortlist / Invite (selected or top N) → modals — e2e:pipeline, e2e:signoff
- [x] Focus Board → Funnel view with the "Stages" group; Board view has the four lanes with counts and empty messages — e2e:pipeline
- [x] All Stages → Board with "Expand stages"; per-lane stage actions — manual (code) `pipeline-page.tsx:980-1000` (`stageAction` per column)
- [x] Drag & drop restricted to `valid_destinations`, opens transition dialog — e2e:signoff "board drag and drop"
- [x] Card: checkbox, name → drawer, stage, scores, "Move stage…" select — e2e:pipeline, e2e:signoff
- [x] Table: select-all, candidate → drawer, move select — e2e:signoff
- [x] Transition dialog: reason code (required when `requires_reason`), note; error shown inline — e2e:signoff (the blocked POST shows the error)
- [ ] `application_stage_conflict` → reload; undo toast 10s countdown → `POST …/undo-transition` — needs a successful transition; not exercised (writes blocked)
- [x] Bulk bar: count, Move to stage + Apply, Screen/Shortlist/Invite, Reject… modal, Export CSV (`pipeline_candidates_export_YYYY-MM-DD.csv`), Clear — e2e:pipeline, e2e:signoff (reject modal, CSV filename, Clear)
- [x] Shortlist modal / Invite modal open with ranked preview — e2e:signoff (when the seed has screened/shortlisted cards); the POSTs are writes, not exercised
- [x] aria-live announcements; loading / error+retry / "No pipeline stages configured" — manual (code)

### Application drawer
- [x] `GET /applications/{id}`; avatar, name, job, stage, Match, "Blind Review Active" — e2e:pipeline (deep link), unit:pipeline-deeplink
- [x] Tabs: Overview & Match · Job Interview · Scorecards · Messages · Audit Trail — e2e:signoff
- [x] Scorecard form: per-dimension 1–5, recommendation, notes, "Save Scorecard" — e2e:signoff (form present); submit is a write
- [x] Decisions: "Decide…" menu with offer, second-round, onsite — e2e:signoff (menu); submit is a write
- [x] Esc / backdrop / X close — e2e:pipeline (Esc returns to `/pipeline`)

## 8. `/talent`
- [x] Filters: Keywords, Domain Pack, Min score → `GET /talent?…` — e2e:signoff "talent filter fields"; e2e:talent-messages
- [x] "Display all discoverable talent"; result cards; empty + Clear filters — e2e:talent-messages
- [x] ~~Hard-coded white card bg~~ fixed: the colour gate passes and layout.spec runs dark mode — `npm run check:colors`, e2e:layout

## 9. `/analytics`
- [x] APIs `/analytics/overview`, `/funnel`, `/velocity`, `/fairness`, `/calibration` — manual (code)
- [x] Stat tiles: Time to hire, Active pipeline, Offer acceptance, Requisitions — **no hard-coded fallbacks** any more — e2e:signoff; unit:analytics "never shows fabricated KPI numbers when the API fails"
- [x] Sections: Funnel · SLA & bottlenecks (Inspect → `?applicationId=`, now working) · Fairness & calibration — e2e:analytics, e2e:signoff
- [x] Error states added — unit:analytics

## 10. `/messages` (employer)
- [x] `GET /conversations`; search; thread list; auto-select first — e2e:talent-messages, e2e:signoff (search → "No matching conversations found.")
- [x] "View Application" → `?applicationId=` (now working); empty state — e2e:signoff

### MessagingThreadView (shared)
- [x] `GET /conversations/{id}/messages`, 3s polling — manual (code)
- [x] Day separators, mine/theirs, read receipts, auto-scroll — manual (code); rendered in e2e:talent-messages
- [x] Ctrl/Cmd+Enter send, inline error — e2e:talent-messages (composer + Send visible on desktop and w390); send is a write

## 11. `/automations`
- [x] `GET /automations`; "Create automation" modal; 3 recipes — e2e:automations-admin
- [x] Rules table, status switch, Simulate → result modal, Delete button — e2e:signoff (mocked rule); toggle/delete calls are writes
- [x] Run log table — e2e:signoff
- [x] Modal: name, trigger, action fields — e2e:signoff
- [x] Simulation modal: verdict, sample candidate, conditions, simulated actions — e2e:signoff (mocked `/test` response)

## 12. `/admin`
- [x] `GET /organizations/current` → org name + role — manual (code)
- [x] Hash sections `#units #members #packs #workflows #emails #audit` (follow hash changes) — e2e:automations-admin; unit:admin-hash
- [x] Superadmin pending panel (Verify, Reject with reason) — manual (code); the seeded employer is not a superadmin
- [x] Units: add unit form — e2e:signoff
- [x] Staff & roles: create staff user — e2e:signoff
- [x] Domain packs section — e2e:signoff, e2e:automations-admin
- [x] Hiring workflow: always-included chips, preview — e2e:signoff
- [x] Email templates: Customized/Default — e2e:signoff
- [x] Audit log — e2e:signoff

## 13. `/candidate` Home
- [x] APIs `/candidates/me/profile`, `/me/profile-interview-attempts`, `/me/applications`, `/me/matches` — manual (code) `candidate-overview.tsx`
- [x] Profile screening: top score, Start/Resume → `/candidate/interview` — e2e:candidate-home-jobs ("Profile screening")
- [x] Profile snapshot, Edit profile — e2e:candidate-home-jobs
- [x] Suggested jobs, Browse all jobs — e2e:candidate-home-jobs
- [x] Applications + "Take Job Interview" → `/candidate/applied/{attempt_id}` — unit:candidate-next-step; e2e:candidate-home-jobs ("Your next step")
- [x] Per-section loading / error+retry — manual (code)

## 14. `/candidate/jobs`
- [x] `GET /jobs`; card, Applied / Apply now, description expand, process steps — e2e:candidate-home-jobs, e2e:signoff; apply is a write

## 15. `/candidate/applications`
- [x] Journey card: org, title, Overall match / Voice / Sandbox scores — e2e:signoff, e2e:candidate-apps-profile
- [x] Sandbox CTA logic; "Complete interview" link — unit:candidate-next-step (`sandboxState`)
- [x] Timeline via Details (lazy `GET …/timeline`, Expected Next Step) — e2e:signoff, e2e:candidate-apps-profile
- [x] Withdraw dialog (now the shared Modal: Esc + focus) — e2e:candidate-apps-profile; submit is a write
- [x] AI Career Advisor roadmap; empty state — manual (code) `candidate-applications-page.tsx:279-282`

## 16. `/candidate/messages`
- [x] Same inbox (shared `messages-inbox.tsx`) — e2e:talent-messages (candidate variants)

## 17. `/candidate/profile`
- [x] Headline, Summary, Skills, Credentials → `PATCH /candidates/me/profile` — e2e:signoff (fields); save is a write
- [x] Consents: discovery, application processing (now switches) — e2e:candidate-apps-profile, e2e:signoff
- [x] Embedding status line — manual (code) `candidate-profile-page.tsx:353`
- [x] Avatar upload / Remove — e2e:candidate-apps-profile ("Upload photo"); upload is a write
- [x] CV: file or paste → upload/parse — e2e:candidate-apps-profile, e2e:signoff; parse is a write

## 18. `/candidate/interview` (profile screening)
- [x] Resume in-progress attempt or create, inside the focus layout — e2e:focus (blocked create shows the error card in FocusLayout); create/resume logic: manual (code) `voice-portal.tsx`

## 19. `/candidate/applied/[attemptId]`
- [x] Voice flow (applied) in the focus layout — e2e:focus
- [ ] Complete screen "Continue to the sandbox" / "Back to candidate home" — reached only after a finished live interview; not exercised (no LiveKit/OpenAI keys here)

## 20. Voice interview flow (shared)
- [x] Endpoints: `GET {base}`, `POST {base}/livekit`, `/start`, `/complete`, `/identity-check`, WS `{base}/telemetry` — `utils/api.ts` manual (unchanged)
- [x] StepIndicator: Permissions → Device check → Setup → Interview — manual (code) step labels in `voice-portal.tsx`; e2e:focus (screening launcher)
- [ ] PermissionCheck, DeviceCheck (preview, meter, 10s test recording, confirm gate), InterviewSetup, LiveKitRoomWrapper, InterviewInterface, mic gating, all WS events, reconnect/backoff, identity check, MediaRecorder, EndInterviewModal — **not exercised end to end**: the live stage needs LiveKit + OpenAI keys, and starting an attempt is a write. The restyle diff dropped only inline-style values (event names, timers and endpoints all intact, checked by string comparison against 550cd38).

## 21. `/candidate/sandbox/[attemptId]`
- [x] `GET {base}`; submitted/expired → done; lobby — e2e:focus "sandbox lobby"
- [ ] Active state, proctoring, autosave, recorder, submit overlay, done score — not exercised (starting is a write and needs screen share). `use-proctoring.ts`, `sandbox-recorder.tsx`, `sandbox-timer.tsx`, `written-exercise.tsx` are unchanged; `sandbox-portal.tsx` lost only style values

## 22. `/interviews/[roomName]`
- [x] Room name regex else 404; lobby with name field and Join — e2e:signoff "legacy interview lobby"
- [x] `POST /api/interviews/token` error → inline "Unable to join" — e2e:signoff (token proxy blocked)

## 23. `app/api/interviews/token/route.ts`
- [x] Server route unchanged by the revamp — manual (unchanged)

---

## Deep-link-only entries
All reachable: `/jobs?create=1` (e2e:jobs), `/pipeline?posting=` (e2e:signoff), `/pipeline?applicationId=` (now working; e2e:pipeline), `/admin#…` (e2e:automations-admin), `/candidate/applied/{id}` and `/candidate/sandbox/{id}` (e2e:focus), `/interviews/{room}` (e2e:signoff), `/register/organization` (e2e:auth).

## README claims not matching code
**Fixed in docs (Task 19):** `Frontend/README.md` now states that job detail has no "matches", analytics has no "sources", candidate jobs show no match scores, pipeline keyboard moves use the per-card select (plus drag and drop on the Board), and the token route returns `{ token, serverUrl }`.
