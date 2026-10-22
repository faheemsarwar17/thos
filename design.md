# THOS Design System (design.md)

Version: 2.0 · October 2026

> This is the single source of truth for visual design and layout. It describes what is implemented in `Frontend/styles/*.css` and `Frontend/components/ui/*`. When code and this document disagree, fix one of them in the same change.

---

## 1. Philosophy

- **Archetype:** modern enterprise B2B SaaS, in the spirit of Linear, Stripe and Vercel. Crisp, institutional, precise and uncluttered.
- **Anti-slop rules:**
  - no generic centred 3-card heroes
  - no purple or pink neon gradients
  - 1px precision borders (`var(--border)`)
  - two elevation levels: in-flow (`--shadow-card`) and overlay (`--shadow-overlay` / `--shadow-drawer`)
- **Motion:** 120–240ms on `opacity` and `transform` only. Everything respects `prefers-reduced-motion`.
- **Density** depends on the role:
  - Employer data screens (pipeline, tables, scorecards) are **compact**.
  - Candidate flows are **comfortable**.

| Dial | Value |
|---|---|
| Design variance | 4 / 10: high consistency, subtle micro-lifts |
| Motion intensity | 4 / 10: `--duration-fast 120ms`, `--duration-normal 180ms`, `--duration-slow 240ms` |
| Visual density | Employer 6 / 10, candidate 4 / 10 |

---

## 2. Implementation Stack

- **Plain CSS with custom properties. No CSS framework**: no Tailwind, no CSS-in-JS.
- Load order, all through `app/globals.css`:
  1. `styles/tokens.css`
  2. `typography.css`
  3. `utilities.css`
  4. `components.css`
  5. `layout.css`
  6. the screen-specific rules in `globals.css` itself (auth, sandbox, candidate portal, timeline)
- Icons come from `react-icons/lu` (Lucide).
- Many feature components still use inline `style={{}}`. **New code should prefer classes.** Where inline styles stay, they must use tokens and responsive grids (§6.4).

---

## 3. Color System

All colors are tokens in `styles/tokens.css`.

**Themes:**
- Light is the default, under `:root` and `[data-theme="light"]`.
- Dark comes from `[data-theme="dark"]`, or from `prefers-color-scheme: dark` when no theme is set.
- `ThemeToggle` stores the choice in `localStorage["thos-theme"]` and sets `data-theme` on `<html>`.

| Family | Tokens | Semantic use |
|---|---|---|
| Surfaces | `--surface-app`, `-card`, `-card-hover`, `-card-active`, `-sunken`, `-subtle`, `-warm` | Page background, cards, wells |
| Sidebar | `--surface-sidebar` (navy `#0c1527`), `-hover`, `-active`, `-border` | The signature executive-navy navigation |
| Borders | `--border`, `--border-subtle`, `--border-strong`, `--border-focus` | 1px dividers and inputs |
| Ink | `--ink-900` … `--ink-100`, `--ink-inverse` | Text. `--ink-500` is the minimum for AA body text. |
| **Brand blue** | `--brand-900` … `--brand-50` (500 = `#2563eb`) | Primary actions, active nav, links, focus |
| **Verification teal** | `--teal-*` (600 = `#0c8577`) | **Reserved** for domain-pack chips, verified credentials and proven capability. Never for warnings or secondary CTAs. |
| **Amber** | `--amber-*` | SLA warnings, candidate waiting, Gold tier |
| **Red** | `--red-*` | Danger, rejection, SLA breach. Use sparingly. |
| **Green** | `--green-*` | Success, passed, hired |
| **Violet** | `--violet-*` | Approval-gated steps (offer sign-off, conditional automation) |

**Rules**
1. Every status or score shows a **text label** alongside its color (WCAG 1.4.1).
2. Use only canonical tokens in new code. `tokens.css` ends with a **compatibility alias block** for older names: `--surface`, `--surface-raised`, `--surface-muted`, `--color-*`, `--danger-*`, `--text-muted`, `--font-mono`, `--teal-200`, `--red-200`. These aliases follow the active theme, but they are deprecated.
3. Never reference an undefined custom property. An undefined variable renders as transparent, which looks like a broken screen.

---

## 4. Typography

| Role | Family | Size / weight |
|---|---|---|
| Body & UI | **Inter** 400/500/600 | 14px, line-height 1.5 |
| Headings | **Poppins** 600/700 | h1 `clamp(20px, 2.2vw, 26px)`; page h1 `clamp(22px, 2.4vw, 28px)`; h2 `clamp(16px, 1.6vw, 19px)`; h3 15px; h4 13px |
| Code / IDs | **JetBrains Mono** 400/500 (`--font-mono`) | 13px |
| Labels / eyebrows | Inter 600–700, uppercase, tracked | 10–12px |

- Fonts load from Google Fonts in `typography.css`.
- Metrics, timers, SLA ages and `ScoreBadge` values use `font-variant-numeric: tabular-nums` (`.tabular-nums`).
- Headings use `text-wrap: balance`.
- Use `…` rather than `...`, curly quotes, and non-breaking spaces before units.
- Truncation helpers: `.truncate`, `.line-clamp-1/2/3`. Any truncated flex child also needs `min-width: 0`.

---

## 5. Spacing, Radii, Elevation

- **Spacing:** an 8px grid (4, 8, 12, 16, 24, 32, 48). There are no spacing tokens yet, so use these values literally.
- **Radii:**
  - `--radius-xs` 4px: tags and code chips
  - `--radius-sm` 6px: small buttons
  - `--radius-md` 8px: buttons, inputs, Kanban cards
  - `--radius-lg` 12px: panels and cards
  - `--radius-xl` 16px: dialogs and auth cards
  - `--radius-full`: pills, pack chips, score badges
- **Shadows:** `--shadow-xs`, `-sm`, `-card`, `-hover`, `-popover`, `-overlay`, `-drawer`.
- **Focus:** `--focus-ring`, a 2px gap plus a 2px brand ring, shown on `:focus-visible` everywhere.

---

## 6. Layout & Responsive System

### 6.1 Shell
`components/layout/app-shell.tsx` renders the following:
- **Sidebar.** Fixed, `--sidebar-width` 256px. It holds the wordmark, the tenant switcher, the Workspace and Manage nav groups, and the user footer with sign-out.
- **Top bar.** Sticky, `--topbar-height` 64px. It holds global search, the pack chip, the theme toggle, the notifications bell and the persona action ("Create job" / "Browse jobs").
- **`<main id="main-content">`.** A column flex container. Pages render `.dashboard` (max-width 1440px, padding 32/36px), `.candidate-main` (max-width 1200px) or `.content` (a full-width flex child).

### 6.2 Breakpoints

All breakpoints use viewport width. The breakpoints between 821 and 1366px exist so that the sidebar doesn't take room from content on laptops.

| Range | Behaviour |
|---|---|
| **> 1366px** | Full 256px sidebar. 4-lane Kanban. 2-column detail and lower grids. |
| **821–1366px** (laptops; **1600×900 at 125% = 1280px**, 1366×768, 1920×1080 at 150%) | **Icon rail:** the sidebar collapses to `--sidebar-collapsed-width` (72px). Labels are visually hidden but stay available to screen readers, and links get a `title` tooltip. Nav counts become corner badges. |
| ≤ 1120px | `.detail-grid`, `.admin-grid`, `.candidate-grid` and `.lower-grid` collapse to 1 column. The attention grid goes to 2 columns. |
| ≤ 1024px | `.kanban--fit` goes to 2 lanes |
| ≤ 960px | The sandbox problem and editor stack vertically |
| ≤ 820px | The sidebar is hidden and a hamburger opens a full-screen `.mobile-nav`. Page padding becomes 24/16px. |
| ≤ 640px | Kanban goes to 1 lane |
| ≤ 600px | Attention grid goes to 1 column. Pack-chip and button labels are hidden. The page heading stacks. |
| height ≤ 760px | Dialogs and drawers use tighter padding. The voice-interview video is capped by viewport height. |

### 6.3 Height rules
- Use **`100dvh`**, never `100vh`. On browsers with dynamic toolbars, `vh` is taller than the visible area.
- Full-height screens (messages, voice interview, sandbox) use `calc(100dvh - var(--topbar-height))` as a **minimum** or flexible height. They scroll instead of clipping (`overflow-y: auto`).
- **Never combine a fixed height with `overflow: hidden` on a container whose content can grow.** That combination is what hid the message composer and interview controls on short screens.
- `.dialog` has `max-height: calc(100dvh - 40px)` and scrolls internally. `.drawer` is `100dvh` tall and scrolls.
- Flex and grid children that hold scrolling content need `min-height: 0`.

### 6.4 Grid rules
- Use `minmax(0, 1fr)` rather than bare `1fr`. A bare `1fr` cannot shrink below its content's width, which causes horizontal overflow and overlapping text.
- For inline grids, use `repeat(auto-fit, minmax(min(100%, <N>px), 1fr))` rather than fixed `1fr 1fr` or `repeat(3, 1fr)`, so they reflow without media queries.
- Responsive overrides must come **after** the base rule in the cascade. `globals.css` keeps its own media block at the end of the file for this reason.
- Wide tables go inside `TableContainer` (`.table-container`, `overflow-x: auto`). `.table` has `min-width: 850px`, and `.panel` clips overflow.

### 6.5 Verification sizes
Before merging a layout change, check these viewports:
- **1280×620**: the user's 1600×900 screen at 125% scaling, after browser chrome
- 1366×768
- 1536×730
- 1920×1080
- 390×844

Pass criteria: no horizontal page scroll, no clipped buttons, no overlapping text.

---

## 7. Component Inventory (`components/ui`)

| Component | Notes |
|---|---|
| `Button` | Variants: `primary`, `secondary`, `outline`, `ghost`, `danger`, `danger-filled`. Sizes: `sm`, `default`, `lg`. Shows `aria-busy` while loading. Legacy `.btn` / `.btn-*` classes map to the same look. |
| `Badge`, `Pill` | Badge variants: `default`, `brand`, `teal`, `amber`, `red`. Pill tones: `neutral`, `brand`, `verified`, `attention`, `danger`, `success`, `approval`. |
| `ScoreBadge` | Tiers `gold`, `silver`, `bronze`, `weak`, `none`, from `getScoreTier`. Numbers are tabular. |
| `PackChip` | A teal domain-pack identity chip. Always in the same place in the top bar. |
| `AttentionQueueCard` | Dashboard attention tiles |
| `Table`, `TableContainer`, `TableEmpty`, `TableSkeletonRows` | Data tables |
| `Drawer`, `Modal` | Dismiss with `Esc` and restore focus. They scroll inside the viewport. |
| `Tabs`, `Breadcrumbs`, `FormField` | `FormField` wires errors with `aria-describedby` |
| `Skeleton*`, `LoadingState`, `ErrorState`, `EmptyState` | Async states |
| `ToastProvider` / `useToast` | Polite, non-blocking toasts |
| `ThemeToggle`, `AuthedImage` | Theme switch. `AuthedImage` fetches an image with the Bearer token. |

Legacy helper classes defined for older screens: `.card`, `.content`, `.spinner`, `.animate-fade-up`.

---

## 8. HCI & Accessibility Checklist

1. **System status:** autosave indicators, voice setup steps, mic level meter, `aria-busy` spinners, polite toasts.
2. **Real-world language:** Under review, Job Interview, Shortlisted, Offer. Never internal IDs.
3. **User control:** exit interview with confirmation, `Esc` on overlays, undo on pipeline moves.
4. **Consistency:** shared Button variants, ScoreBadge tiers and pack-chip placement.
5. **Error prevention:** a diff before locking a pool, required reasons on consequential moves, disabled-but-explained submit buttons.
6. **Recognition over recall:** the application drawer sits beside the board, and the JD is shown beside pool curation.
7. **Efficiency:** global search, keyboard Kanban moves, bulk actions.
8. **Minimalism:** cards show decision data only; evidence lives in drawers.
9. **Error recovery:** specific copy under the failed field.
10. **Help:** inline rubric criteria and pack tooltips.

**Accessibility baseline:**
- skip link, `focus-visible` rings and `.sr-only`
- keyboard alternatives for drag-and-drop
- reduced motion
- 44px minimum touch targets in the mobile nav
- icon-only controls always carry `aria-label` or `title`
