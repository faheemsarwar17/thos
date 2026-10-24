# Prototype the new shell, employer home and pipeline board

Type: prototype
Mode: HITL
Status: resolved
Blocked by: 01

## Question

What should the new THOS look and feel like? Build a throwaway clickable prototype (published as a private artifact) of: the light collapsible sidebar + topbar with ⌘K palette and notifications panel; the employer Home; the Pipeline with the compact toolbar, Focus Board cards, bulk bar and application drawer — in light and dark, at desktop and 390px. The user reacts; the answer records the approved tokens (palette, type scale, radii, density) and layout patterns that the PRD locks.

## Answer

Prototype: `Frontend/app/prototype/ui-revamp/` (route `/prototype/ui-revamp?variant=A|B|C|D&screen=home|pipeline`), screenshots in `assets/proto/`. To be captured on throwaway branch `prototype/ui-revamp` and removed from `feat/ui-revamp`.

**Winner: Variant D** = C "Workbench" + B's per-requisition stage bars + dashboard charts (user, 2026-10-23: "mix b and c (add stage bars of b rest go with c) .... also add charts and graphs on dashboard"; then "yes done").

- **Shell (employer):** 60px icon rail (tooltips; theme, sign-out, avatar at bottom) + **requisitions context panel** (248px; each job with count, status line and a mini stage bar; "All requisitions"; "+ New requisition"), toggleable from the topbar, shown **only on Home and Pipeline**; panel hides ≤1180px; ≤820px the rail becomes a **bottom tab bar** (Home, Jobs, Pipeline, Talent, Messages; rest via ⌘K/menu). Topbar 52px: panel toggle, page title, ⌘K search icon, notifications popover, pack chip.
- **Home ("Today"):** KPI pulse row (in flight, new, to score, hired, live jobs) → **4 charts** (Pipeline funnel, Requisitions by stage [B's bars], Applications received last 14 days, Screening score distribution) each with hover/focus tooltip + Table toggle → agenda columns **Now / Today / Recent** of task cards with CTA.
- **Pipeline:** page header with Blind review + single **Actions** menu (Screen all / Auto-shortlist top N / Invite top N); **funnel strip** of stages (click to filter) → card grid (avatar, name→drawer, job, AI reasoning 2 lines, Match + Screen scores, Move… select, status line); bulk bar appears on selection; candidate opens in right **drawer** (tabs Overview/Interview/Scorecards/Messages/Audit; footer Move stage, Scorecard, Decide…). Existing board/table views remain available as alternate views (parity).
- **Analytics page** rebuilt with the same chart components (restyle, no new features).
- **Tokens (approved):** Inter + JetBrains Mono; light bg `#f7f7f8`, surface `#fff`, surface-2 `#f2f3f5`, surface-3 `#eaebee`, border `#e5e6ea`/`#d4d6dc`, ink `#111318`/`#4b505b`/`#767c88`, brand `#2f5bea` (soft `#eef2fe`); dark bg `#0c0d10`, surface `#141519`, surface-2 `#1a1c21`, surface-3 `#22252b`, border `#25282f`/`#343842`, ink `#eceef2`/`#b0b5bf`/`#7d838f`, brand `#7090ff`. Status: teal (verified/packs), amber, red, green, violet with soft tints. Radii 6/8/12; 13.5px base; compact density.
- **Chart palette (validated with dataviz validator):** light `#2a78d6,#eb6834,#1baf7a,#eda100`, dark `#3987e5,#d95926,#199e70,#c98500`; magnitude single-hue blue; light aqua/yellow < 3:1 → always direct labels/legend counts + table view.
- Verified: no horizontal scroll, no clipping at 1366×768 and 390×844 in light + dark.
