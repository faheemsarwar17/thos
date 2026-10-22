# THOS Frontend — Feature Inventory (parity checklist)

Captured 2026-10-23 from `main` @ 550cd38. Every box must still be reachable and working after the UI revamp.
Root: `Frontend/` (Next 15 App Router, React 19, plain CSS). No middleware / loading / error / not-found files; all auth is client-side.

API: `lib/api.ts` → `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`); `useApi(path)` = GET `{data,error,loading,reload}`. `utils/api.ts` (`publicApi`) is used only by the voice flow (no refresh).

---

## 0. Shared shell & cross-cutting

### `lib/auth.ts`
- [ ] localStorage keys `thos.access_token`, `thos.refresh_token`, `thos.session` (user, memberships, candidate_id, is_superadmin, has_employer_membership)
- [ ] getAccessToken / getRefreshToken / getSession / saveSession / clearSession / isAuthenticated / currentSession

### `lib/api.ts`
- [ ] get/post/postForm/patch/put/delete; Bearer header
- [ ] 401 → single shared refresh (`POST /api/v1/auth/refresh`) → retry; failed refresh clears session
- [ ] `ApiError(status, code, message)`; status 0 `network_unreachable` → "The THOS API is unreachable…"
- [ ] login / register / logout (logout clears session even if call fails); `idempotencyKey()`

### `RequireAuth`
- [ ] No token → `/login`; `employerOnly` without employer membership/superadmin → `/candidate`; "Checking your session…"

### `AppShell` (both personas)
- [ ] Skip link → `#main-content`
- [ ] Sidebar: wordmark (→ `/` or `/candidate`) + persona tag; tenant block (initials, org name, "Hiring workspace"/"Candidate portal"); nav groups "Workspace" + "Manage"; active matching (exact for `/` & `/candidate`, prefix otherwise, `aria-current`); optional nav count; footer avatar initials, name, role label, Sign out
- [ ] Topbar: mobile hamburger (aria-expanded/controls), mobile wordmark, GlobalSearch, PackChip, ThemeToggle, bell with unread count (employer → `/admin#audit`, candidate → `/candidate/applications`), persona topbar action
- [ ] Mobile nav: same nav, closes on navigate, user name + Sign out
- [ ] Mount APIs — employer: `GET /organizations/current`, `GET /organizations/current/domain-packs/active`; candidate: `GET /packs/catalog`; both: `GET /notifications` (unread_count)

### Employer shell (`dashboard-shell.tsx`)
- [ ] Primary: Home `/`, Jobs `/jobs`, Pipeline `/pipeline`, Talent `/talent`, Analytics `/analytics`, Messages `/messages`
- [ ] Manage: Automations `/automations`, Administration `/admin`, Register organization `/register/organization`
- [ ] Topbar action "Create job" → `/jobs?create=1`; no role-based hiding

### Candidate shell
- [ ] Overview `/candidate`, Find jobs `/candidate/jobs`, My applications, Messages, Skill screening `/candidate/interview`, Profile & privacy; topbar "Browse jobs"

### GlobalSearch
- [ ] Placeholder "Search candidates, jobs, applications…", ⌘K/Ctrl K hint; Cmd/Ctrl+K focus; Esc / outside click close
- [ ] 220ms debounce, ≥2 chars, `GET /search?q=`; states Searching / No matches; groups Jobs (→ `/jobs/{id}`) and Candidates & Applications (→ `/pipeline?posting=`)

### Theme, toasts, primitives
- [ ] ThemeToggle: `localStorage thos-theme`, prefers-color-scheme fallback, `data-theme` on html
- [ ] Toasts: success/error/info/warning, 4s auto-dismiss, dismiss button, polite live region "Notifications"
- [ ] Modal & Drawer: Esc, backdrop, focus + restore, labelled close
- [ ] LoadingState / ErrorState (Retry) / EmptyState; Skeleton, TableSkeletonRows, TableEmpty, Tabs, Breadcrumbs, Pill tones, ScoreBadge tiers, PackChip, Badge, FormField, AttentionQueueCard, AuthedImage
- [ ] `@livekit/components-styles` global import

### Orphaned code (decide keep/delete)
- `components/candidate/interview-session.tsx` (legacy text interview, unimported)
- `voice/DevicePermissionGate.tsx`, `ContextBanner.tsx`, `AIVisualizer.tsx` (unimported); `TranscriptOverlay.tsx` (type only)
- `lib/dashboard-data.ts`, `lib/persona.ts` (unused)

---

## 1. `/login`
- [ ] Email/password prefilled (ayesha.khan@nut.edu.pk / Password123!); demo buttons Employer Admin / Candidate (hira.ahmed@gmail.com)
- [ ] `POST /auth/login` → `/` if employer else `/candidate`; inline error; loading button
- [ ] Links to `/register`, `/register/organization`; footnote "Tenant-isolated & WCAG 2.2 AA compliant"

## 2. `/register`
- [ ] Full Legal Name, Email, Password (min 8) → `POST /auth/register` → `/candidate`; links to login & org registration

## 3. `/register/organization`
- [ ] Waits for auth check; unauthenticated shows Administrator Account (name, work email, password ≥8) → registers first
- [ ] Org fields: Display Name*, Legal Entity Name, Company Domain*, Official Contact Email*, Contact Phone*, Registration/Tax Number, Address*
- [ ] `POST /organizations/applications {…, org_type:"company", idempotency_key}` → "Application Received" + "Proceed to Sign In"; cancel/back target depends on auth

## 4. `/` Employer Home
- [ ] APIs: `/analytics/pipeline`, `/postings`, `/pipeline`, `/notifications`
- [ ] Breadcrumbs, "System operational"
- [ ] Attention queue (3 cards → `/pipeline`): new applications, interviews ready for scorecards (`applied_interview_status==="evaluated"`), active in flight (+hired/rejected/total); "Open pipeline"; error+retry
- [ ] Active Requisitions table (title→`/jobs/{id}`+location, candidates, status pill, pool pill, Finish setup/Manage); "View all jobs", "New requisition"; skeleton, empty "Create first job", error+retry
- [ ] Recent Activity (≤6 notifications, optional View link); loading/empty/error
- [ ] Next actions: Review new apps, Score interviews, "Live interview room" → `/interviews/faculty-panel` (only entry to LiveKit lobby)

## 5. `/jobs`
- [ ] `?create=1` shows CreateJobForm inline (only entry)
- [ ] `GET /postings` table: title+location+work_mode, applicants, status, pool, Pinned Pack, Manage; loading/error/empty
- [ ] Create form: Title* (≥3), Location, Work Mode (remote/hybrid/onsite, default hybrid), Domain Pack (`GET /domain-packs`, default active pack), Description
- [ ] "Auto-generate with AI" (title ≥2) → `POST /postings/generate-description`; "Generated by AI" marker until edited
- [ ] Sandbox checkbox; type auto-default by pack id; Sandbox Type, Difficulty, Time Limit 5–120
- [ ] `POST /postings {…, idempotency_key}` → `/jobs/{id}`; Cancel → `/jobs`; inline errors

## 6. `/jobs/[postingId]`
- [ ] `GET /postings/{id}`; loading / error+retry
- [ ] Header: location, work mode, status; "Open Pipeline (N)" → `/pipeline?posting=`; Publish (draft, disabled until pool locked + tooltip) → `POST …/publish`; Close (published, confirm) → `POST …/close`
- [ ] Question pool: Generate (`POST …/question-pool/generate`); list with competency pill; reorder up/down; remove (min 1); Regenerate; Save Curation (`PATCH …/question-pool`); Discard; Lock (disabled while dirty, confirm modal → `POST …/question-pool/lock`); Locked/Draft pill + version
- [ ] Sandbox panel (draft only): Enable/Configure → format/difficulty/time; Save (`PATCH /postings/{id}`), Disable, Cancel
- [ ] Metadata: Requisition ID + copy (2s check), pack chip, location, work mode, status, applicants link, created date
- [ ] JD panel with mini-markdown (`##`, `###`, bullets, `**bold**`)

## 7. `/pipeline`
- [ ] `?posting=` filter (`GET /pipeline?posting_id=`); `GET /postings` for dropdown (full reload)
- [ ] KNOWN GAP: `?applicationId=` linked from Messages & Analytics but never read
- [ ] Header: "Screen All Received (N)", requisition filter, Blind Review toggle (anonymises cards/table/modals/drawer), view toggle Focus Board / All Stages / Table
- [ ] Automation bar: Screen (selected/all) → `POST /pipeline/screen-received`; Shortlist (selected / top N) → modal; Invite (selected / top N) → modal
- [ ] Focus Board: Received / Shortlisted / Applied Interview / Results, counts, sub-stage filter pills, empty msgs, column actions
- [ ] All Stages: per-column Screen All / Shortlist / Invite
- [ ] Drag & drop restricted to `valid_destinations`, drag-over highlight, opens transition dialog
- [ ] Card: checkbox, name→drawer, avatar, job, stage pill, ScoreBadge AI Score/Interview(+Voice), match reasons (2 lines), interview & sandbox pills, "Move stage…" select / "Final Stage"
- [ ] Table: select-all, candidate→drawer, requisition, stage (+inline Screen (N)), score, interview status, move select
- [ ] Transition dialog: reason code (required when `requires_reason`), note → `POST /applications/{id}/transitions {…, from_stage_version, idempotency_key}`; `application_stage_conflict` → reload
- [ ] Undo toast 10s countdown → `POST /pipeline/applications/{id}/undo-transition`; dismiss
- [ ] Bulk bar: count, Move to stage + Apply (`POST /pipeline/bulk-transition`), Screen/Shortlist/Invite, Reject Selected modal (reason+note), Export CSV (client-side, `pipeline_candidates_export_YYYY-MM-DD.csv`), Clear
- [ ] Shortlist modal: top-N or selected, ranked preview [Shortlist]/[Reject], Reject remaining, AI Loophole Analysis & Growth Email → `POST /pipeline/shortlist`
- [ ] Invite modal: same → `POST /pipeline/invite-interviews`
- [ ] aria-live announcements; loading / error+retry / "No pipeline stages configured"

### Application drawer
- [ ] `GET /applications/{id}`; AuthedImage avatar (hidden when blind), name, job, stage pill, Match ScoreBadge, "Blind Review Active"
- [ ] Tabs: Overview & Match (reasoning, improvement feedback, profile snapshot) · Job Interview (invite → `POST …/applied-interview-invitations`; status, identity verification states + confidence, overall/dimension scores, rubric citations with timestamps) · Scorecards (list, consensus/divergence, calibration) · Messages (`GET /conversations/by-application/{id}` + compact thread) · Audit Trail
- [ ] Scorecard form: 1–5 per dimension, recommendation advance/hire/hold/reject, notes → `POST …/scorecards` + toast
- [ ] Decisions (confirm): Extend Offer, Invite Round 2, Invite Onsite → `POST …/decision` + toast
- [ ] Esc / backdrop / X close

## 8. `/talent`
- [ ] Filters: Keywords, Domain Pack (`GET /packs/catalog`), Min score 0–100 → `GET /talent?q=&pack_id=&min_score=`
- [ ] "Display All Discoverable Talent"; result card (initials, name, headline, email, ≤6 skills, Match Explanation, score, requisition count / "Discovery Opt-in", pack); loading/error/no-results + Clear filters
- [ ] Note: no per-result action; hard-coded white card bg breaks dark mode

## 9. `/analytics`
- [ ] APIs `/analytics/overview`, `/funnel`, `/velocity`, `/fairness`, `/calibration`
- [ ] Stat cards: Time to Hire, Active Pipeline, Offer Acceptance, Requisitions (hard-coded fallbacks)
- [ ] Tabs: Funnel Waterfall (bars, pass-through, % total, drop-off) · SLA Velocity & Bottlenecks (SLA cards, bottleneck table, Open Pipeline, Inspect → `?applicationId=` broken, "All within SLA") · Fairness & Calibration (parity index, domain parity, divergence, consensus, pairs)
- [ ] No error states today

## 10. `/messages` (employer)
- [ ] `GET /conversations`; client search; thread list (name, date, posting, preview, "N new"); auto-select first
- [ ] Right pane header + posting pill + "View Application" (→ `?applicationId=`, broken); empty "Go to Pipeline"; loading/error

### MessagingThreadView (shared)
- [ ] `GET /conversations/{id}/messages`, 3s polling while visible, "Live sync active"
- [ ] Day separators, mine/theirs logic, read receipts, auto-scroll
- [ ] Ctrl/Cmd+Enter send, `POST /conversations/{id}/messages`; inline error; empty/loading/error

## 11. `/automations`
- [ ] `GET /automations` {rules, runs}; "Create Automation" modal; 3 recipes (Invite to Assessment on Shortlist, Fast-Track High Match Scores, Screening Stage SLA Aging Alert)
- [ ] Rules table (name, trigger, conditions, actions, executions, status toggle → `POST …/toggle`), Simulate (`POST …/test` → result modal), Delete (confirm → `DELETE`)
- [ ] Run log table
- [ ] Modal: name*, description, WHEN stage_entered(+stage)/score_threshold(+0–100)/sla_exceeded, THEN send_notification(+msg)/tag_candidate(+tag) → `POST /automations`
- [ ] Simulation modal: verdict, sample candidate, per-condition pass/fail, simulated actions

## 12. `/admin`
- [ ] `GET /organizations/current` → org name + "Your role: X"
- [ ] Hash tabs `#units #members #packs #workflows #emails #audit` (read + write)
- [ ] Superadmin pending panel: `GET /admin/organizations/pending`, Verify, Reject (prompt reason)
- [ ] Units: tree, add unit (name, parent) → `POST /organizations/current/units`
- [ ] Staff & Roles: members list + role pills, recent invites (3), create staff user (name, email, role) → `POST …/members`
- [ ] Domain Packs: list, active, Set default, Create/Edit (display name → auto slug id, domain, skills CSV, profile prompt, applied prompt), Delete custom (disabled if linked jobs)
- [ ] Hiring Workflow: always-included chips, optional checkboxes, live preview path, Save → `PUT /workflows/current`
- [ ] Email Templates: Customized/Default, editor (subject 3–300, body 10–8000, placeholders), Save (`PUT`), Reset (`DELETE`)
- [ ] Audit Log: first 30 records

## 13. `/candidate` Overview
- [ ] APIs `/candidates/me/profile`, `/me/profile-interview-attempts`, `/me/applications`, `/me/matches`
- [ ] Profile Screening: top score, attempts list, Start/Resume → `/candidate/interview`
- [ ] Profile Snapshot: headline, ≤5 skills, discovery consent, Edit Profile
- [ ] Suggested Job Matches (View Role → `/candidate/jobs`), Browse all jobs
- [ ] Active Applications + "Take Job Interview" → `/candidate/applied/{attempt_id}`; View all applications
- [ ] Per-section loading / error+retry

## 14. `/candidate/jobs`
- [ ] `GET /jobs`; card: org, title, location, type, "Screening Required", Applied pill / Apply Now (`POST /applications`), description 240-char expand, process steps; inline errors; empty/loading/error

## 15. `/candidate/applications`
- [ ] `GET /candidates/me/applications`; card: org, title, Overall Match / Voice / Sandbox scores, dates, status
- [ ] Sandbox CTA logic (complete / Take sandbox / pending); "Complete interview" → `/candidate/applied/{attempt_id}`
- [ ] Timeline toggle lazy `GET …/{id}/timeline` (completed/current/upcoming, Expected Next Step)
- [ ] Withdraw dialog (custom; no Esc/focus trap) → `POST …/{id}/withdraw {reason}`
- [ ] AI Career Advisor roadmap (markdown from `ai_improvement_feedback`); empty "Browse Open Jobs"

## 16. `/candidate/messages`
- [ ] `GET /candidates/me/conversations`; same two-pane, search, unread, thread view; empty "View My Applications"

## 17. `/candidate/profile`
- [ ] Profile form: Headline ≤200, Summary ≤4000, Skills CSV, Credentials CSV → `PATCH /candidates/me/profile`
- [ ] Consents: discovery, application_processing → `PUT /candidates/me/consents/{purpose}`
- [ ] Embedding status line
- [ ] Avatar: `GET /me`, upload jpeg/png/webp ≤5MB → `POST /me/avatar`, Remove → `DELETE /me/avatar`, identity-check copy
- [ ] CV: file (pdf/docx/txt/md/csv; text types read into textarea) or paste (≥40 chars, ≤100k) → `POST /candidates/me/cv/upload` or `/cv/parse`; Structured Resume Preview

## 18. `/candidate/interview` (profile screening)
- [ ] Resume in_progress attempt or create (`target_domains[0]` default "education") → voice flow

## 19. `/candidate/applied/[attemptId]`
- [ ] Voice flow (applied); complete screen offers "Continue to the sandbox" when required + "Back to candidate home"

## 20. Voice interview flow (shared)
- [ ] Endpoints: `GET {base}`, `POST {base}/livekit`, `/start` (already_in_progress → rejoin), `/complete`, `/identity-check`, WS `{base}/telemetry`
- [ ] StepIndicator: Permissions → Device check → Setup → Interview
- [ ] PermissionCheck (audio only; denied / Camera Is In Use; Retry)
- [ ] DeviceCheck: camera preview, mic meter, 10s test recording + playback, Record Again, confirm checkbox gates Continue
- [ ] InterviewSetup: details & instructions, Start, 3 setup stages + progress, failure card, LiveKit pre-mount
- [ ] LiveKitRoomWrapper states; InterviewInterface: header (title, state, interviewer, timer red >85% of 10min, End), mirrored self-view, AI avatar tile w/ wave, mic level + Muted/Live, transcript with state chips
- [ ] Automatic mic gating; all WS events (interviewer_identity, agent_turn_*, agent_speech_*, user_turn_granted, answer_time_cap, user_speech_*, transcript, setting_up_interview stages, setup_complete, completed, failed, setup_failed); client sends user_audio_activity, participant_joined, user_requested_end
- [ ] Reconnect ×5 backoff; 1008 → invalid/expired; 45s speaking safety; 12s "Hello" hint; camera publish; silent identity check (~2.5s, ≤4 retries); MediaRecorder (upload stub)
- [ ] EndInterviewModal (Esc, Cancel default focus) → end sequence (≤45s wait) → complete screen

## 21. `/candidate/sandbox/[attemptId]`
- [ ] `GET {base}` resume draft; submitted/expired → done; not required → message + home
- [ ] Lobby: config, rules, Share screen, Enable camera & mic, Start/Resume in fullscreen → `POST {base}/start`
- [ ] Active: header (difficulty, title, REC, SandboxTimer red <2min, auto-submit at 0, Submit); coding (problem pane + CodeEditor with gutter, Tab=2 spaces, language select) / written (per-prompt textarea, word count vs min)
- [ ] Proctoring: blocked shortcuts, clipboard/context menu blocked, PrintScreen clears clipboard, fullscreen exit auto-submits, blur/hide violations → `POST {base}/violations`, 3rd auto-submits
- [ ] Autosave `PUT {base}/progress` every 10s + keepalive on hide
- [ ] Recorder: screen + webcam PiP 1280×720@10fps + mic → `POST {base}/recording`
- [ ] Submit `POST {base}/submit` (409 ok), "AI is Analyzing Your Assessment…" overlay, cleanup
- [ ] Done: score N/100 (0 special copy), feedback link, home

## 22. `/interviews/[roomName]` (no shell, no auth)
- [ ] Room name regex else notFound; lobby (skip link, THOS → `/`, PackChip, name*, checklist, Join / "Preparing secure room…", privacy note)
- [ ] `POST /api/interviews/token` → LiveKitRoom + VideoConference + RoomAudioRenderer; disconnect → lobby; inline errors

## 23. `app/api/interviews/token/route.ts`
- [ ] Server route; unchanged by UI revamp

---

## Deep-link-only entries
`/jobs?create=1`, `/pipeline?posting=`, `/pipeline?applicationId=` (broken), `/admin#…`, `/candidate/applied/{id}`, `/candidate/sandbox/{id}`, `/interviews/{room}`, `/register/organization`.

## Timers / realtime
Messages 3s poll; voice WS + LiveKit; undo 10s; sandbox 1s timer + 10s autosave; search 220ms debounce; notifications fetched once.

## Keyboard
⌘/Ctrl+K search; Esc overlays; Ctrl/Cmd+Enter send; Tab in editor; sandbox shortcut blocking. No arrow-key Tabs/Kanban.

## Tests today
Vitest + jsdom + Testing Library: `components.test.tsx`, `dashboard.test.tsx`, `theme-and-toast.test.tsx`. No e2e / Playwright.

## README claims not matching code
Job detail "matches"; Analytics "sources"; candidate jobs "match scores"; pipeline "keyboard moves" (select only); token route response shape.
