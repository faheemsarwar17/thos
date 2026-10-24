# Map: THOS UI Revamp

Label: wayfinder:map · Branch: `feat/ui-revamp` · Tracker: local markdown (`.scratch/ui-revamp/`)

## Destination

A locked **PRD** (`.scratch/ui-revamp/prd.md`) and a single **implementation plan** (`.scratch/ui-revamp/plan.md`) that, executed in one go on `feat/ui-revamp`, rebuilds the entire THOS frontend UI with zero functional loss (every box in [Feature inventory](feature-inventory.md) still reachable and working) and then updates `README.md`, `Frontend/README.md` and `design.md` (v3.0).

## Notes

- **Domain:** Next.js 15 / React 19 frontend in `Frontend/`, plain CSS with custom properties (no Tailwind, no component library), icons `react-icons/lu`. Two personas: employer (compact) and candidate (comfortable).
- **Skills to consult:** `frontend-design:frontend-design`, `ui-ux-pro-max:ui-ux-pro-max`, `ui-ux-pro-max:design-system`, `mattpocock-skills:prototype` (prototype tickets), `mattpocock-skills:grilling`, `dataviz` (analytics), `superpowers:writing-plans` (the plan).
- **Settled in the charting session (2026-10-23):**
  - Depth: **re-architect** — new identity + reworked layouts/navigation; every feature must stay reachable.
  - Pain points: UI is **glitchy (overlapping content, not fitting all screens), cluttered, confusing**.
  - Reference feel: **Ashby / Linear** — calm, dense, premium.
  - Stack: **keep plain CSS**; rewrite tokens + components.
  - Constraints: **all existing URLs keep working** (new routes only additive/redirects); **light + dark themes kept**; **no backend/API changes**.
  - Voice interview + sandbox: **restyled visually only**; media/proctoring/recording/WS logic untouched.
  - Fix frontend-only defects: `?applicationId=` deep link opens the drawer; Talent dark mode; Withdraw dialog → shared Modal; Analytics error states (no fake fallbacks shown as real); visible feedback for bulk/automation errors.
  - Delete orphaned code: `interview-session.tsx`, `DevicePermissionGate`, `ContextBanner`, `AIVisualizer`, `lib/dashboard-data.ts`, `lib/persona.ts`.
  - Navigation: real **notifications panel** (from `GET /notifications`); **Register organization** leaves the employer sidebar (stays on login + linked from Administration); **live interview room** gets a proper entry; **light collapsible sidebar + ⌘K command palette** (search + page jump).
  - Pipeline: one compact toolbar (requisition filter, view switch, Blind Review, single "Actions" menu for Screen/Shortlist/Invite); bulk bar only on selection; one primary action per column header.
  - Identity: **Inter everywhere** (drop Poppins) + JetBrains Mono; brand blue for actions; teal reserved for verification/packs; cooler neutrals; light sidebar.
  - Verification ("done"): typecheck + lint + vitest green; parity checklist ticked per screen; **new Playwright suite** (every route, both personas, key controls present) + screenshots at 1280×620, 1366×768, 1536×730, 1920×1080, 390×844 in light + dark.
  - Docs at the end: root `README.md`, `Frontend/README.md`, `design.md` v3.0; correct README claims that don't match code.

## Decisions so far

<!-- one line per closed ticket -->

- [Audit current UI glitches across screens and viewports](issues/01-ui-glitch-audit.md) — 17 systemic defects, concentrated at 390px and short laptop heights (topbar overflow, messages pane, clipped forms/cards, sidebar footer, pipeline headers/pills, fake analytics numbers, admin hash tabs); 7 must-hold acceptance rules.
- [Prototype the new shell, employer home and pipeline](issues/02-prototype-shell-home-pipeline.md) — Variant D: icon rail + requisitions panel (Home/Pipeline only) with B's stage bars, bottom tabs on mobile; "Today" home with KPI row + 4 charts + Now/Today/Recent agenda; funnel-strip pipeline with card grid, single Actions menu, drawer; approved tokens + validated chart palette.
- [Prototype the candidate portal and interview/sandbox screens](issues/03-prototype-candidate-and-media-screens.md) — candidate D shell (rail → bottom tabs); Home = next-step hero + tiles; Applications = vertical journey cards with inline action; Profile = settings with section nav; interview + sandbox in a shell-less focus layout (visual only).
- [Research a Playwright setup for this Next.js app with a real backend](issues/04-research-playwright-setup.md) — `Frontend/e2e/`, API login per worker into storageState, viewport projects × theme param, toHaveScreenshot + capture mode, fake-media flags and getDisplayMedia/fullscreen stubs for sandbox.
- Implementation complete on feat/ui-revamp — see plan.md (all tasks ticked) and parity-signoff.md.

## Not yet specified

- **Remaining employer screens** (Jobs list/detail, Talent, Messages, Automations, Admin, Analytics) and public auth pages: no open product question — they adopt the D system and are specified screen-by-screen in the PRD.
- **Plan slicing for "one go":** ordering and parallelisation are an implementation-planning concern, settled in the plan.

## Out of scope

- Backend / API changes of any kind (Q5).
- Client-side role gating (admin vs recruiter vs hiring manager) — backend enforces today; changing it would alter behaviour.
- New product features beyond the listed defect fixes and navigation entries (e.g. candidate job search/filters, editing automation rules, removing staff).
- Changing the styling stack (Tailwind / shadcn).
