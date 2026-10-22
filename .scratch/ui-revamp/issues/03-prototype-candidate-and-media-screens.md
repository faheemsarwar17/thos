# Prototype the candidate portal and interview/sandbox screens

Type: prototype
Mode: HITL
Status: resolved
Blocked by: 02

## Question

Applying the approved system from the shell prototype: how should the candidate Overview, Applications (timeline, CTAs, withdraw) and Profile look, and how far does the restyle go on the voice interview (stepper, device check, live interface) and sandbox (lobby, active, done) screens? Prototype them; the answer records the candidate-side layout decisions.

## Answer

Prototype: `Frontend/app/prototype/ui-revamp-candidate/` (route `/prototype/ui-revamp-candidate?variant=A|B&screen=overview|applications|profile|interview`, focus screens `?screen=voice|sandbox&state=…`), screenshots `assets/proto/cand_*`. Captured on throwaway branch `prototype/ui-revamp`.

**Decision (user, 2026-10-23: "yes agreed" to the recommendation):**
- **Candidate shell:** same D system — icon rail (Home, Jobs, Applications, Messages, Screening, Profile; theme, sign out, avatar) → bottom tab bar ≤820px; topbar with title, search, notifications popover, "Browse jobs". Comfortable density (14px base, max-width ~1120px). No requisitions panel.
- **Home = A "Dashboard":** "Your next step" hero card (derived from applications: take job interview → complete sandbox; else "all caught up"), 4 stat tiles (profile screening best score + Start/Retake, active applications, open jobs, discoverable on/off → privacy), Applications + Suggested jobs panels (matches; fallback to open jobs). Profile screening attempts list remains reachable (Screening page).
- **Applications = B "Journey cards":** per application a vertical timeline of `status_order` with the action button on the current step (Complete interview / Take sandbox), "Waiting on the employer" otherwise; scores (Match / Interview / Sandbox); dated timeline + "Expected next step" (lazy GET timeline) and AI growth roadmap behind "Details"; Withdraw via shared Modal (Esc + focus trap).
- **Profile = A "Settings":** section nav (Profile, Photo, Resume, Privacy; horizontal scroller on mobile); Profile form; Photo with upload/remove + identity-check copy; Resume drop zone + paste textarea + parsed preview; Privacy as switches + matching-index line.
- **Screening launcher:** explainer card + Start/Resume, then the focus flow.
- **Focus layout (voice interview + sandbox):** no app shell. 56px header: mark, title, step indicator (Permissions → Device check → Setup → Interview), timer + End (live) / REC + timer + Submit (sandbox) / Exit. Centered state cards for permissions (amber help alert + Retry), device check (preview + mic meter + 10s test + confirm checkbox gating Continue), setup (3-stage progress), done (score / next step). Live interview: AI tile with wave + state chip, self tile, mic bar ("Mic opens when it's your turn"), transcript panel; stacks on mobile. Sandbox active: problem pane | editor (language select, autosave status), violation pill at bottom; written mode one prompt per page with word count. All media/LiveKit/WS/proctoring/recording logic unchanged — visual only.
