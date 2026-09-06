# THOS Design System (DESIGN.md)

> **Single Source of Truth for Design Engineering & Visual Consistency**  
> Synthesizing `ui-ux-pro-max-skill`, `taste-skill`, `vercel-labs/web-interface-guidelines`, and `awesome-design-md`.

---

## 1. Philosophy & Aesthetic Archetype

- **Archetype**: Modern Enterprise B2B SaaS (inspired by Linear, Stripe, and Vercel).
- **Core Mood**: Crisp, institutional, precise, and clutter-free.
- **Anti-Slop Directives (`taste-skill`)**:
  - No generic centered 3-card templates.
  - No AI-purple/pink neon gradients or generic drop-shadow blur halos.
  - Strict 1px precision borders: `var(--border)` (`#e2e6ed` light / `#1e293b` dark).
  - Purposeful elevation: 2 distinct levels only (`--shadow-card` for in-flow elements, `--shadow-drawer` / `--shadow-overlay` for temporary top layers).
  - Micro-interactions only: 120–180ms transitions on compositor-friendly properties (`opacity`, `transform`).

### Tunable Taste Dials
| Dial | Value | Description |
|---|---|---|
| `DESIGN_VARIANCE` | **4 / 10** | High consistency and architectural symmetry, subtle modern micro-lifts. |
| `MOTION_INTENSITY` | **4 / 10** | Snappy cubic-bezier feedback (`--duration-fast: 120ms`, `--duration-normal: 180ms`), zero sluggish decorative delays. |
| `VISUAL_DENSITY` | **Role-Adaptive** | **6 / 10 (Compact)** for Employer data workflows (Pipeline, Tables, Scorecards); **4 / 10 (Comfortable)** for Candidate-facing flows. |

---

## 2. Color System & Semantics

### Semantic Rules (Strict & Non-Stylistic)
1. **Brand Blue (`#2563eb` / `--brand-500`)**: Primary actions, active navigation, links, and system focal points. Reads institutional, reliable, and corporate.
2. **Verification Teal (`#0c8577` / `--teal-600`)**: **Strictly reserved** for Domain Pack identity chips, verified credentials, and proven capability rings. Never use teal on warnings, errors, or secondary CTAs.
3. **Amber (`#b7791f` / `--amber-600`)**: Attention without panic: SLA warning states, candidate waiting indicators, and Gold Tier score badges.
4. **Red (`#dc2626` / `--red-500`)**: Danger, rejection, and SLA breach. Used sparingly so it commands immediate attention.
5. **Violet (`#7c3aed` / `--violet-500`)**: Approval-gated steps (e.g., offer sign-off, conditional automation branch). Distinct from both red (reject) and green (pass).
6. **Accessibility Rule**: Every status and score element must pair color with a plain-text label (WCAG 1.4.1). Never color alone.

---

## 3. Typography & Numerical Precision

- **Display & Headings**: `Poppins`, weights `600`, `700`. Used exclusively for titles, drawer headers, and section names.
- **Body & UI**: `Inter`, weights `400`, `500`, `600`. Line-height `1.5`–`1.55`.
- **Code & Identifiers**: `JetBrains Mono`, weights `400`, `500`.
- **Tabular Numerals**: All metrics, interview timers, SLA aging, and `ScoreBadge` values MUST have `font-variant-numeric: tabular-nums` to prevent jitter during live updates.
- **Typographic Hygiene**: Use ellipses `…` (never `...`), curly quotes `“` and `”`, and non-breaking spaces before units (`10&nbsp;MB`, `⌘&nbsp;K`). Headings enforce `text-wrap: balance`.

---

## 4. Spacing & Grid

- **Base Grid**: 8px baseline (`4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`).
- **Radii**:
  - `4px` (`--radius-xs`): Tags, micro-badges, code chips.
  - `6px` (`--radius-sm`): Small buttons, table action pills.
  - `8px` (`--radius-md`): Standard buttons, inputs, Kanban cards.
  - `12px` (`--radius-lg`): Panels, dashboard cards, modal bodies.
  - `9999px` (`--radius-full`): Status pills, Domain Pack chip, Score badges.

---

## 5. Golden HCI & Usability Compliance Matrix

1. **Visibility of System Status**: Real-time autosave indicators, LiveKit audio meters, button loading spinners with `aria-busy`, and non-blocking polite toasts.
2. **Match Between System & Real World**: Natural recruiting terms (Under Review, Applied Interview, Shortlisted, Offer) instead of internal database IDs.
3. **User Control & Freedom**: "Exit and save progress" on interview sessions, `Esc` dismiss on drawers and dialogs with focus restoration, reversible stage changes.
4. **Consistency & Standards**: Strict reuse of Button variants (`primary`, `secondary`, `outline`, `ghost`, `danger`), uniform `ScoreBadge` tiers (`gold`, `silver`, `bronze`, `none`), and invariant Domain Pack chip placement.
5. **Error Prevention**: Diff confirmation before publishing/locking question pools, non-blocking paste in forms, disabled-yet-informative submit buttons.
6. **Recognition Over Recall**: Persistent candidate drawer side-by-side with Kanban board, job description preview alongside question curation.
7. **Flexibility & Efficiency**: Command palette (`⌘K`), quick-action buttons, keyboard navigation on tables and kanban cards.
8. **Aesthetic & Minimalist Design**: Cards display high-signal decision data only; full evidence is progressively disclosed in drawers.
9. **Error Recovery**: Specific, actionable error copy placed directly beneath failed input controls with `aria-describedby`.
10. **Help & Context**: Inline rubric criteria, domain pack tooltips, and clear next-step directives.
