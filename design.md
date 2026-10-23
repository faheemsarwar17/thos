# THOS Design System (design.md)

Version: 3.0 · October 2026 ("D" system)

> This is the single source of truth for visual design and layout. It describes what is implemented in `Frontend/styles/*.css`, `Frontend/styles/screens/*.css` and `Frontend/components/ui/*`. When code and this document disagree, fix one of them in the same change.

---

## 1. Philosophy

- **Calm, dense, premium**, in the spirit of Ashby and Linear. Few borders, quiet greys, one brand blue, colour reserved for status.
- **One page header per page.** `PageHeader` (title, optional meta line, actions) replaces the old eyebrow + H1 + paragraph stack.
- **Density depends on the role:**
  - Employer screens are **compact** (13.5px base).
  - Candidate screens are **comfortable** (14px base, max content width 1120px).
- **Motion:** 120–180ms on `opacity` and `transform` only. Everything respects `prefers-reduced-motion`.
- **Honest data:** a missing number renders "—" with "Not enough data". Never show a fabricated fallback.

---

## 2. Implementation Stack

- **Plain CSS with custom properties.** No Tailwind, no CSS-in-JS, no component library. Icons are `react-icons/lu` (Lucide).
- Load order, all through `app/globals.css`:
  1. `styles/tokens.css`: legacy token names (kept so older selectors resolve)
  2. `styles/theme.css`: **the D semantic tokens** for light and dark, and the legacy names re-pointed to them
  3. `styles/typography.css`
  4. `styles/utilities.css`
  5. `styles/components.css`: primitives (the `D primitives` section at the end is authoritative)
  6. `styles/charts.css`
  7. `styles/layout.css`: shell (rail, requisitions panel, topbar, bottom tabs, focus layout), command palette, notifications
  8. `styles/screens/*.css`: one file per screen family (home, pipeline, jobs, talent, messages, analytics, automations, admin, candidate, focus, auth)
  9. the remaining legacy rules in `globals.css` itself
- **Semantic tokens first.** New code uses `--bg`, `--surface`, `--ink`, `--brand`… (§3). Legacy names (`--surface-card`, `--ink-900`, `--brand-500`…) still resolve to the same values.
- **No hard-coded colours in `.tsx`.** `npm run check:colors` fails on hex, `rgb()`/`hsl()` or `"white"`/`"black"` literals in `components/` and `app/`. The only exceptions are the chart components and the sandbox recording canvas. Dark media surfaces (`#0f1115` video tiles and the code editor) live in CSS.
- Inline `style={{}}` is only for truly dynamic values, such as a bar width (`width: \`${pct}%\``) or a grid column count.

---

## 3. Color System

**Themes.**
- Light is the default under `:root` / `[data-theme="light"]`; dark comes from `[data-theme="dark"]`, or from `prefers-color-scheme: dark` when nothing is stored.
- The choice is stored in `localStorage["thos-theme"]` and applied as `data-theme` on `<html>`. A small inline script in `app/layout.tsx` applies it before first paint, so shell-less pages honour it too.
- `ThemeToggle` and the command palette's "Toggle theme" action stay in sync through the `thos-theme-change` window event.

| Role | Light | Dark |
|---|---|---|
| `--bg` (page) | `#f7f7f8` | `#0c0d10` |
| `--surface` (card) | `#ffffff` | `#141519` |
| `--surface-2` | `#f2f3f5` | `#1a1c21` |
| `--surface-3` | `#eaebee` | `#22252b` |
| `--border` / `--border-strong` | `#e5e6ea` / `#d4d6dc` | `#25282f` / `#343842` |
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | `#111318` / `#4b505b` / `#767c88` / `#9aa0ab` | `#eceef2` / `#b0b5bf` / `#7d838f` / `#5c626d` |
| `--brand` / `--brand-ink` / `--brand-soft` / `--brand-line` | `#2f5bea` / `#ffffff` / `#eef2fe` / `#c9d5fb` | `#7090ff` / `#0c0d10` / `#1b2340` / `#2e3d73` |
| `--teal` / `-soft` (verified, packs only) | `#0f7f74` / `#e5f4f1` | `#4cc7b8` / `#11302c` |
| `--amber` / `-soft` | `#9a5b00` / `#fcf1de` | `#e7a94a` / `#33260f` |
| `--red` / `-soft` | `#b8322a` / `#fbeceb` | `#f0837a` / `#3a1a18` |
| `--green` / `-soft` | `#1d7a45` / `#e6f4ec` | `#5fcf8e` / `#12301f` |
| `--violet` / `-soft` | `#6247b8` / `#f0ecfb` | `#a996f2` / `#251f3d` |

**Chart palette** (`--viz-*`, validated with the dataviz validator):
- Categorical, 4 slots (Received / Shortlisted / Interview / Results): light `#2a78d6, #eb6834, #1baf7a, #eda100`; dark `#3987e5, #d95926, #199e70, #c98500`.
- Magnitude (one hue): `--viz-mag` = `#2a78d6` light / `#3987e5` dark.
- Grid / axis: `--viz-grid` / `--viz-axis`.
- In light mode, aqua and yellow fall below 3:1, so **every chart shows visible counts or a legend and has a Table view.**

**Rules.**
1. Every status or score shows a **text label** alongside its colour (WCAG 1.4.1).
2. Teal is reserved for domain packs and verified credentials.
3. Never reference an undefined custom property: it renders transparent.

---

## 4. Typography

| Role | Family | Size / weight |
|---|---|---|
| Body & UI | **Inter** 400/500/600/700 (`--font-sans`) | 13.5px employer, 14px candidate; line-height 1.45 |
| Page H1 (`PageHeader`) | Inter | 20px / 650, letter-spacing −0.015em |
| Section H2 | Inter | 13.5–15px / 600 |
| Code / IDs | **JetBrains Mono** 400/500 (`--font-mono`) | 12.5–13px |

- Poppins is removed.
- Metrics, timers and scores use `.tabular-nums`. Headings use `text-wrap: balance`.
- Truncation helpers: `.truncate`, `.line-clamp-1/2/3`. Any truncated flex child also needs `min-width: 0`.

---

## 5. Spacing, Radii, Elevation

- **Spacing:** an 8px grid (4, 8, 12, 16, 24, 32, 48).
- **Radii:** `--r-sm` 6px, `--r-md` 8px, `--r-lg` 12px, `--r-xl` 16px (dialogs, focus cards), and 99px for pills.
- **Shadows:** two levels only: `--shadow-1` (in-flow) and `--shadow-pop` (overlays: popovers, dialogs, drawers, palette, bulk bar).
- **Focus:** `--focus-ring` (`0 0 0 2px surface, 0 0 0 4px brand`) on `:focus-visible` everywhere.

---

## 6. Layout & Responsive System

### 6.1 Shells

**Employer and candidate app shell** (`components/layout/app-shell.tsx`, used by `DashboardShell` and `CandidateShell`):
- **Icon rail** (`--rail-w` 60px). Mark, nav icons (tooltip + `aria-label`, `aria-current="page"` when active), and at the bottom: ThemeToggle, Sign out, and an initials avatar. The employer rail has Workspace items, a divider, then Manage items (Automations, Administration).
- **Requisitions panel** (`--panel-w` 248px, employer only). Shown on `/` and `/pipeline` only, togglable from the topbar and remembered in `localStorage["thos.panel"]`, hidden at ≤1180px. It lists every posting with a count, a status line and a compact stage-mix bar, and links to `/pipeline?posting={id}`.
- **Topbar** (`--topbar-h` 52px, sticky). Panel toggle (Home and Pipeline), page title, the command-palette trigger (⌘/Ctrl K), `NotificationsPanel`, `PackChip` (hidden ≤600px) and the persona action ("New job" / "Browse jobs").
- **Bottom tabs** at ≤820px (`--tabbar-h` 60px, ≥44px targets). Items marked `mobile` plus **More**, which opens a sheet with the remaining destinations, the theme toggle and Sign out. Content gets bottom padding so nothing hides behind the bar.
- Kept: skip link → `#main-content`; `<main id="main-content" tabIndex={-1}>`; active matching (exact for `/` and `/candidate`, prefix otherwise).

**Focus layout** (`components/layout/focus-layout.tsx`): no app shell. Used by `/candidate/interview`, `/candidate/applied/[id]`, `/candidate/sandbox/[id]` and `/interviews/[roomName]`. A 56px header holds the mark, title, optional step indicator, an optional right slot (timer, REC, Submit) and Exit. Content is either a centred `.fx-card` or full-bleed (`full`, used by the live interview and the sandbox IDE). The sandbox shows **no Exit while active**, because leaving fullscreen submits.

**Auth layout** (`components/auth/auth-layout.tsx`): at ≥1024px a brand panel (wordmark, value line, trust line) beside a centred form card (420px, or 720px when `wide`); one column below.

### 6.2 Breakpoints

| Width | Behaviour |
|---|---|
| ≤1180px | Requisitions panel hidden; Home agenda stacks to one column |
| ≤1120px | Two-column detail grids (job detail) become one column |
| ≤960px | Settings nav (Admin, candidate Profile) becomes a horizontal scroller; the sandbox IDE stacks |
| ≤900px | Messages become list → thread; the live interview stacks (stage 220/160px, transcript 320px with its own scroll); the device check stacks |
| ≤820px | Rail becomes bottom tabs; topbar keeps title, search icon, bell and a compact action |
| ≤720px | Tables marked `.table--stack` become card lists (`data-label` on cells); the org-registration grid goes to one column |
| ≤600px | Drawers go full-screen; the bulk bar spans the width; the pack chip hides |

### 6.3 Height rules
- Use **`100dvh`**, never `100vh`.
- Never combine a fixed height with `overflow: hidden` on a container whose content can grow.
- Scrolling flex/grid children need `min-height: 0`. Dialogs cap at `100dvh - 40px` and scroll inside; drawers are inset 8px and scroll their body.

### 6.4 Grid rules
- Use `minmax(0, 1fr)` or `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`, never a bare `1fr`.
- Rows holding a title plus actions use `flex-wrap: wrap`, so actions wrap **below** the title instead of squeezing it.
- Text-holding flex children get `min-width: 0`.
- Horizontal scrollers are intentional only for the pipeline board, the funnel stage strip, tables (`TableContainer`), tabs and the settings nav on narrow screens.

### 6.5 Verification sizes
**1280×620, 1366×768, 1536×730, 1920×1080, 390×844**, each in light and dark.

**Must-hold rules** (enforced by `e2e/layout.spec.ts`):
1. No horizontal page scroll on any route.
2. Every interactive control is visible and unclipped (unless inside an intentional horizontal scroller).
3. No text or control escapes its bordered container; titles are never truncated by sibling actions.
4. Messages collapse to list → thread on mobile with the composer reachable.
5. Admin tabs follow hash changes; analytics never shows fabricated numbers.
6. Native controls (selects, checkboxes via `accent-color`, file inputs, switches) are themed in both modes.
7. One `PageHeader` per page; media routes use `FocusLayout`.

---

## 7. Component Inventory

**`components/ui`**

| Component | Notes |
|---|---|
| `PageHeader` | `{ title, meta?, actions? }` → one `<h1>`; actions wrap below the title |
| `Button` | Variants `primary`, `secondary`, `outline`, `ghost`, `danger`, `danger-filled`; sizes `sm`, default, `lg`; `loading`, `iconLeft/Right` |
| `Badge`, `Pill`, `ScoreBadge`, `PackChip` | Pill tones `neutral`, `brand`, `verified`, `attention`, `danger`, `success`, `approval`; ScoreBadge tiers by `getScoreTier` |
| `Switch` | Accessible `role="switch"` checkbox with label and optional description |
| `SegmentedControl` | `aria-pressed` buttons in a `role="group"` (pipeline view, analytics section) |
| `Stepper` | Horizontal or vertical progress, `aria-current="step"`, optional `renderStep` |
| `StatTile` | Label, tabular value, optional hint and link |
| `Popover` | Anchored panel, closes on Esc or outside click; `.menu` / `.menu__item` for action menus |
| `Tabs` | Roving focus with ←/→/Home/End |
| `Modal`, `Drawer` | Esc, backdrop, focus + restore, labelled close. `Drawer` takes `drawer--wide` |
| `Table`, `TableContainer`, `TableEmpty`, `TableSkeletonRows` | `table--stack` opts into the ≤720px card layout |
| `Skeleton*`, `LoadingState`, `ErrorState` (Retry), `EmptyState` | Async states |
| `ToastProvider` / `useToast` | Polite live region; success / error / info / warning |
| `ThemeToggle`, `AuthedImage`, `Breadcrumbs`, `FormField` | `FormField` associates its label when given an `id` |

**`components/layout`**: `AppShell`, `RequisitionsPanel`, `CommandPalette` (⌘/Ctrl K; Go to, Actions, and live search after 2 characters with a 220ms debounce), `NotificationsPanel` (bell popover, mark all read), `FocusLayout`.

**`components/charts`**: `ChartCard` (Table/Chart toggle), `ChartTable`, `FunnelChart`, `StageMixChart` (full and `compact`), `TrendColumns`, `ScoreHistogram`, `useChartTooltip`. Every mark is focusable, with a tooltip on hover and focus; zero values render at 0 width.

---

## 8. HCI & Accessibility Checklist

1. **System status:** autosave, voice setup progress, mic meter, `aria-busy`, polite toasts and pipeline announcements.
2. **Real-world language:** Received, Shortlisted, Job interview, Offer. Never internal IDs.
3. **User control:** confirm before ending an interview, Esc on overlays, undo on pipeline moves.
4. **Consistency:** one page header, shared buttons, pills, score tiers and pack-chip placement.
5. **Error prevention:** required reasons on consequential moves, disabled-but-explained actions (Publish until the pool is locked), modal confirmations for reject/withdraw.
6. **Recognition over recall:** the application drawer beside the board; deep links (`?applicationId=`, `/admin#audit`) open the exact item.
7. **Efficiency:** ⌘/Ctrl K, bulk actions, the board, and the per-card Move select.
8. **Minimalism:** cards show decision data; evidence lives in drawers.
9. **Error recovery:** specific copy and Retry on every failed request; bulk and automation failures raise visible toasts.
10. **Help:** inline rubric criteria and pack tooltips.

**Accessibility baseline:** skip link, `:focus-visible` rings, `.sr-only`, keyboard alternatives for drag-and-drop (Move select), Tabs with arrow keys, 44px touch targets on mobile nav, `aria-label` on icon-only buttons, status never by colour alone, charts with Table views, reduced motion.

---

## 9. Verification

| Command (from `Frontend/`) | What it checks |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` | Types, lint, Vitest unit tests, production build |
| `npm run check:colors` | No hard-coded colours in `.tsx` |
| `npm run e2e` | All Playwright specs: layout rules on every route × 5 viewports × 2 themes, plus `e2e/parity/*` |
| `npm run e2e:layout` | Only the layout rules |
| `npm run e2e:capture` | Full-page screenshots into `e2e/__screens__/{viewport}/{theme}/{route}.png` |
