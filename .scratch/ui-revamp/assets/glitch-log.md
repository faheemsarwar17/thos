# Glitch log — current UI (before revamp)

Audit 2026-10-23 on `feat/ui-revamp` (= main @ 550cd38). 27 routes (public 4, employer 15 incl. admin hash tabs, candidate 8) × 5 viewports × light/dark = **270 captures, 0 load errors**. Read-only (all non-GET API calls blocked). Screenshots: `assets/before/<persona>_<route>__<WxH>__<theme>.png`; machine findings: `assets/before/report.json`, `assets/before/summary.txt`. Audit script: Playwright-core, automatic checks for page horizontal scroll, off-screen/clipped controls, clipped text, content escaping its bordered container, overlapping elements — plus manual review of representative captures.

## Systemic defects (root causes)

| # | Where | Viewports | Symptom | Likely cause |
|---|---|---|---|---|
| G1 | **Topbar, every route** | 390 | Page is ~473–482px wide → horizontal scroll on every screen; "Create job"/"Browse jobs" cut off | Search + pack chip + theme + bell + action button don't fit; no collapse of topbar items on mobile |
| G2 | **Sidebar** | 1280×620 (short heights) | Footer & Sign out clipped below the fold; sidebar doesn't scroll; tenant block truncates to "Nat… / Hirin…" in icon rail | Fixed full-height sidebar with no overflow; tenant text kept in rail mode |
| G3 | **Pipeline column headers** | 1280–1366 | Column title truncated ("Receive") because Screen All + Shortlist buttons crowd it | Title + 2 actions in one non-wrapping row inside a narrow lane |
| G4 | **Pipeline cards** | all | Score pills ("13 Interview") overflow the card edge; AI match score labelled "Interview"; cards tall (select per card) | Pill min-width + nowrap in a space-between row; label logic |
| G5 | **Pipeline toolbar** | 390 | Header stacks into 6 rows + separate "Pipeline actions" panel — very cluttered | Separate automation bar + header controls (decided: one toolbar) |
| G6 | **Messages (both personas)** | 390 | Conversation pane pushed off-screen — composer, Send and "View Application" unreachable | Two-pane grid never collapses to list → thread navigation |
| G7 | **Register organization** | 390 | Form card overflows; inputs, textarea and submit clipped at the right edge | Fixed-width inner grid / padding inside auth card |
| G8 | **Candidate jobs cards** | 390 | Header row doesn't wrap: title squeezed to ~80px, "Apply Now"/"Applied" cut off | Flex row without wrap / min-width:0 |
| G9 | **Employer home requisitions** | 390 | Panel header buttons overflow; table cut off ("CANDI…") with no scroll affordance | Header row nowrap; 850px min-width table in clipped panel |
| G10 | **Analytics funnel** | 390 | "% of total" pill escapes panel | Row nowrap |
| G11 | **Analytics data honesty** | all | Shows hard-coded fallbacks as real (e.g. 18.5 days time-to-hire, 100% offer acceptance with 0 hires); zero-value funnel bars render with visible width | Fallback constants + min bar width |
| G12 | **Admin hash tabs** | all | Going from `/admin` to `/admin#packs` (or clicking the bell → `#audit` while on /admin) doesn't switch tab | Hash read only on mount; no `hashchange` listener |
| G13 | **Dark mode polish** | all dark | Native file inputs / checkboxes unstyled (grey "Choose File"), near-black sandbox checkbox row, low-contrast avatar placeholder; Talent result cards hard-coded white (inventory) | Unstyled native controls; hard-coded colours |
| G14 | **Bell badge** | all | Unread dot sits outside the button bounds | Absolute badge offset (cosmetic; keep but contain) |
| G15 | **Inconsistent page chrome** | all | Different page paddings (Messages/Analytics start at ~92–103px vs 108px), breadcrumb roots differ ("Home" vs "Employer Workspace"), every page repeats eyebrow + H1 + paragraph → visual clutter | Each screen hand-rolls its header with inline styles |
| G16 | **Focus screens inside full shell** | all | Sandbox lobby and interview complete screens sit inside the full app shell (sidebar/search) — distracting for proctored flows | Candidate shell wraps media routes |
| G17 | **Next.js dev indicator** | all (dev only) | "N" badge overlaps the topbar action at top-right | `devIndicators` default position; set to bottom-left in dev config |

## Non-defects observed
- Console errors only from intentionally blocked writes (`/candidate/interview` attempt creation) and the superadmin pending panel's expected 403 on `/admin`.
- Desktop ≥1366 is broadly OK for Home, Jobs, Job detail, Admin, Analytics — problems concentrate at **390px** and **short laptop heights**, matching the user's "overlapping / doesn't fit all screens".

## Must-hold for the revamp (feeds PRD acceptance)
1. No horizontal page scroll at any of the 5 viewports (G1, G7, G8, G9).
2. Every control reachable without clipping at 390×844 and 1280×620 (G2, G6, G7, G8).
3. No content escaping its container; titles never truncated by actions (G3, G4, G10, G14).
4. Messages collapses to list → thread on mobile (G6).
5. Admin tabs follow hash changes (G12); analytics never shows fabricated numbers (G11).
6. All native controls themed in both modes (G13).
7. One shared page-header component (G15); media/proctored routes use a focus layout (G16).
