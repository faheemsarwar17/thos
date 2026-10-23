# THOS UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax so you can track progress; tick them in this file as you go.

**Goal:** Rebuild the whole THOS frontend UI to the approved "D" design. Everything here is frontend-only. The work must:
- remove every overlap, clipping and horizontal-scroll defect at 5 viewports in both themes;
- keep every existing feature, URL and API call;
- finish with green typecheck, lint, unit, build and Playwright checks, plus updated docs.

**Architecture:**
- **Tokens:** a new semantic token layer, `styles/theme.css`, sits on top of the existing `tokens.css`. It also re-points the legacy names, so old CSS keeps working while screens migrate.
- **Shared code:** new shared primitives, charts and shells.
- **Screens:** each screen is then restyled **in place**. JSX and classes change; hooks, effects, handlers and API calls do not.
- **Safety net:** a Playwright suite (layout rules plus parity checks), built first. It fails on today's UI and must pass at the end.

**Tech stack:**
- Next.js 15 (App Router), React 19, TypeScript strict
- Plain CSS with custom properties (no Tailwind, no component library)
- `react-icons/lu`
- Vitest + Testing Library (jsdom)
- `@playwright/test` (new dev dependency)
- FastAPI backend (unchanged), running locally

**Spec:** [`prd.md`](prd.md) in this folder. **Read it fully before Task 1.** Every task implicitly includes the PRD requirements for the screens it touches.

---

## 0. START HERE (fresh agent, no prior context)

### 0.1 What this is

THOS is a hiring platform. It has an employer workspace (jobs, pipeline, talent, analytics, messages, automations, admin) and a candidate portal (jobs, applications, AI voice-interview screening, proctored coding sandbox). The user asked for a full UI revamp with **all functionality intact**. A planning session (the Wayfinder method) already:
- audited the current UI;
- prototyped options, from which the user picked a design;
- locked a PRD.

**Your job is to implement this plan.** Do not re-open design decisions. They are recorded in the files below, and the user approved them.

### 0.2 Files to read, in this order

All paths are relative to the repo root `C:\Users\It Zone\Desktop\Github\thos`.

| File | Why |
|---|---|
| `.scratch/ui-revamp/prd.md` | **The spec.** Design tokens, shells, per-screen layouts, defect fixes, acceptance rules |
| `.scratch/ui-revamp/feature-inventory.md` | **Parity checklist.** Every route, button, form, modal, API call and deep link that must survive |
| `.scratch/ui-revamp/assets/glitch-log.md` | The 17 defects the new UI must not reproduce, and the 7 "must-hold" rules |
| `.scratch/ui-revamp/assets/research-playwright.md` | How the Playwright suite authenticates and runs (Task 1 follows it) |
| `.scratch/ui-revamp/issues/02-*.md`, `issues/03-*.md` | Approved design decisions (the "Answer" sections), with exact token values |
| `.scratch/ui-revamp/map.md` | Index of every decision |
| `design.md`, `Frontend/README.md`, `README.md` | Current docs. Rewritten in Task 19 |

**Approved visual reference:** a working prototype on the git branch `prototype/ui-revamp` (commit `44bdb14`, also pushed to `origin`). **Do not merge that branch.** On a fresh clone or another machine, run `git fetch origin prototype/ui-revamp:prototype/ui-revamp` first. Read its files with `git show`, for example:

```bash
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/proto.css
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/charts.tsx
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/shared.tsx
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/variant-d.tsx
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp-candidate/cand.css
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp-candidate/variants.tsx
git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp-candidate/media.tsx
```

To **see** the prototype in a browser:
1. Stash or commit your work.
2. Run `git checkout prototype/ui-revamp`.
3. Visit `http://localhost:3000/prototype/ui-revamp?variant=D` (employer; sign in as Ayesha) and `http://localhost:3000/prototype/ui-revamp-candidate` (candidate; sign in as Hira).
4. Run `git checkout feat/ui-revamp` to come back.

Screenshots of it are in `.scratch/ui-revamp/assets/proto/`. The **`D_*`** and **`cand_*`** files are the approved look. Screenshots of today's UI (the "before") are in `.scratch/ui-revamp/assets/before/`.

**What carries over from the prototype:**
- **Structure:** variant D for employers. For candidates: Home from A, Applications from B (journey cards), Profile from A (settings), and the focus layout from `media.tsx`.
- **Not carried over:** the prototype's `.proto`-scoped class names, `p-*` / `va-*` / `vb-*` / `vc-*` prefixes, and its fake actions. Production code uses the class names defined in this plan.

### 0.3 Environment

- **OS:** Windows 11. Shells: Git Bash (POSIX) and PowerShell 5.1. In Git Bash, prefix commands whose arguments start with `/` with `MSYS_NO_PATHCONV=1`, otherwise the path gets mangled.
- **Branch:** work on **`feat/ui-revamp`**, which already exists and is branched from `main` @ `550cd38`. **Never commit to `main`.** Never commit `Backend/data/thos.db`; it is tracked but modified locally by the running app. Leave it unstaged.
- **Servers** (the user usually has them running already; check before starting new ones):
  - Backend: `cd Backend && uv run uvicorn app.main:app --reload --port 8000`. It seeds demo data on an empty DB.
  - Frontend: `cd Frontend && npm run dev`, serving `http://localhost:3000`.
  - Check with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login` and `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs`. Both should print `200`.
- **Demo accounts** (password `Password123!`):
  - Employer admin: `ayesha.khan@nut.edu.pk`
  - Candidate: `hira.ahmed@gmail.com`
- **Frontend checks**, run from `Frontend/`:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test` (Vitest)
  - `npm run build`
  - `npm run e2e`, added in Task 1
- **Chromium:** a Playwright Chromium is already installed at `%LOCALAPPDATA%\ms-playwright\chromium-1234`. Task 1 may still run `npx playwright install chromium` to match the installed `@playwright/test` version.

### 0.4 Ground rules for every task

1. **No backend changes. No API contract changes.** Only call endpoints the current code already calls, plus `POST /api/v1/notifications/mark-read`, which exists.
2. **Restyle in place.** In big files such as `pipeline-page.tsx` (1,936 lines), `application-drawer.tsx`, `InterviewInterface.tsx` (1,534 lines), `sandbox-portal.tsx` and `admin-page.tsx`:
   - change JSX structure, `className` and inline styles only;
   - keep every `useState`, `useEffect`, `useCallback`, handler body, API call and WebSocket message byte-identical, unless a PRD §8 defect fix explicitly needs a change;
   - check your diff before committing.
3. **Inline styles:** delete `style={{…}}` in favour of classes. Keep inline styles only for truly dynamic values, such as `width: \`${pct}%\``.
4. **Colours:** never hard-code colours (hex, `white`, `black`, `rgb`) in `.tsx`. Use tokens. The only exceptions are the dark media surfaces (`#0f1115` video tiles and the code editor) in CSS.
5. **Layout:**
   - grids use `minmax(0, 1fr)` or `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`;
   - flex children that hold text get `min-width: 0`;
   - rows holding a title plus actions use `flex-wrap: wrap`, so actions wrap **below** the title instead of squeezing it;
   - full-height screens use `100dvh`, never `100vh`;
   - never put a fixed height together with `overflow: hidden` on growing content.
6. **Parity first:** before restyling a screen, open its section in `feature-inventory.md`. After restyling, every checkbox in it must still work. Write the screen's parity spec (in the task) before the restyle and watch it fail or pass as described.
7. **Commits:** commit at the end of every task (`git add` only the files you changed) with conventional messages, ending with:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
   Do not push unless the user asks.
8. **Tick boxes:** mark completed steps `- [x]` in this file, so a later session can resume.
9. **When blocked:** if something in the code contradicts this plan (a file moved, a prop is named differently), adapt to the code, keep to the PRD's intent, and write a one-line note under the task heading (`> Note: …`).

### 0.5 Execution order

1. **Tasks 1–6 (foundation):** strictly in order.
2. **Tasks 7–16 (screens):** in any order once Task 6 is done. Run them one at a time unless you are using parallel subagents, because they touch different files.
3. **Tasks 17–19:** last, in order.

| # | Task | Main files |
|---|---|---|
| 1 | Playwright harness + layout rules (red on today's UI) | `Frontend/e2e/*`, `playwright.config.ts`, `package.json`, `vitest.config.ts` |
| 2 | Design tokens + typography + base | `styles/theme.css` (new), `typography.css`, `app/globals.css` |
| 3 | UI primitives (restyle + new) | `components/ui/*`, `styles/components.css` |
| 4 | Charts | `components/charts/*`, `styles/charts.css` |
| 5 | CommandPalette + NotificationsPanel | `components/layout/command-palette.tsx`, `notifications-panel.tsx` |
| 6 | Shells: AppShell rail/topbar/bottom tabs, RequisitionsPanel, FocusLayout | `components/layout/*`, `dashboard-shell.tsx`, `candidate-shell.tsx`, `styles/layout.css`, `next.config.ts` |
| 7 | Employer Home "Today" | `components/dashboard/employer-dashboard.tsx` |
| 8 | Pipeline + ApplicationDrawer + `?applicationId` | `components/pipeline/*` |
| 9 | Jobs list (create drawer) + Job detail | `components/jobs/*` |
| 10 | Talent + Messages (both personas) | `components/talent/*`, `app/messages/page.tsx`, `app/candidate/messages/page.tsx`, `components/messages/*` |
| 11 | Analytics | `components/analytics/analytics-dashboard.tsx` |
| 12 | Automations + Administration | `components/automations/*`, `components/admin/admin-page.tsx` |
| 13 | Candidate Home + Jobs | `components/candidate/candidate-overview.tsx`, `candidate-jobs-page.tsx` |
| 14 | Candidate Applications (journey) + Profile (settings) | `candidate-applications-page.tsx`, `candidate-profile-page.tsx`, `avatar-panel.tsx` |
| 15 | Focus layout: voice interview, sandbox, interview room | `components/interviews/**`, `components/sandbox/*`, related `app/` pages |
| 16 | Public auth pages | `components/auth/*` |
| 17 | Cleanup: orphans, GlobalSearch, dead CSS, colour gate | various |
| 18 | Full verification: parity specs, layout matrix, captures, sign-off | `e2e/parity/*`, `.scratch/ui-revamp/parity-signoff.md` |
| 19 | Docs: `design.md` v3.0, `Frontend/README.md`, `README.md` | docs |

## Global Constraints

From PRD §3–§4, §7.

- Viewports to verify: **1280×620, 1366×768, 1536×730, 1920×1080, 390×844**, each in **light and dark**.
- Theme storage: `localStorage["thos-theme"]` holds `"light"` or `"dark"`. It is applied as `data-theme` on `<html>`. With no stored value, fall back to `prefers-color-scheme`.
- Auth storage: the `thos.access_token`, `thos.refresh_token` and `thos.session` keys stay as they are, and `lib/api.ts` and `lib/auth.ts` keep their behaviour.
- Fonts: **Inter** (400/500/600/700) and **JetBrains Mono** (400/500). Poppins is removed.
- Breakpoints:
  - ≤1180px: hide the context panel.
  - ≤1120px: two-column detail grids become one column.
  - ≤960px: settings nav becomes a horizontal scroller; the sandbox IDE stacks.
  - ≤900px: messages become list → thread; the live interview stacks.
  - ≤820px: rail becomes bottom tabs.
  - ≤720px: tables become card lists where the PRD says so.
- Minimum touch target on mobile nav and tabs: 44px. Icon-only buttons need `aria-label`.
- Motion: 120–180ms, opacity and transform only, and `@media (prefers-reduced-motion: reduce)` disables it.
- Do not add npm runtime dependencies. The only new dev dependency is `@playwright/test`.

---

## Task 1: Playwright harness and layout rules

> Note: Red on today's UI as intended: 36 failed / 20 passed at w390. webServer uses THOS_DATABASE_PATH (the config has no THOS_DATABASE_URL for SQLite); data/e2e.db added to Backend/.gitignore.

The safety net: a Playwright suite that encodes the glitch-log rules. **It must fail on today's UI.**

**Files:**
- Modify: `Frontend/package.json` (dev dependency + scripts)
- Modify: `Frontend/vitest.config.ts` (exclude `e2e/**`)
- Modify: `Frontend/.gitignore` if it exists, otherwise the root `.gitignore`. Add `Frontend/e2e/.results/`, `Frontend/e2e/.report/` and `Frontend/e2e/__screens__/`.
- Create: `Frontend/playwright.config.ts`
- Create: `Frontend/e2e/fixtures.ts`
- Create: `Frontend/e2e/routes.ts`
- Create: `Frontend/e2e/layout-rules.ts`
- Create: `Frontend/e2e/layout.spec.ts`
- Create: `Frontend/e2e/capture.spec.ts`

**Interfaces (produced, used by Tasks 7–18):**
- `signIn(page, persona: "employer" | "candidate" | "public", theme?: "light" | "dark"): Promise<Session | null>`
- `readOnly(page): Promise<void>`: blocks every non-GET call to the API except `/api/v1/auth/*`.
- `resolveIds(): Promise<{ postingId: string; attemptId: string | null; applicationId: string | null }>`
- `ROUTES: RouteSpec[]` where `RouteSpec = { persona; path: string | ((ids) => string | null); name: string }`
- `detectLayoutIssues(): LayoutIssue[]` (runs inside the page)
- `onlyProject(testInfo, name = "w1366")`: skips a test on every other viewport project.

- [x] **Step 1: Install and add scripts**

```bash
cd Frontend
npm i -D @playwright/test@latest
npx playwright install chromium
```

Add to the `"scripts"` in `package.json`:

```json
"e2e": "playwright test --grep-invert @capture",
"e2e:layout": "playwright test e2e/layout.spec.ts",
"e2e:capture": "playwright test --grep @capture --workers=1"
```

- [x] **Step 2: Exclude e2e from Vitest.** Replace the `test` block in `vitest.config.ts`:

```ts
import { configDefaults, defineConfig } from "vitest/config";
// ...
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
```

- [x] **Step 3: Create `Frontend/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export const VIEWPORTS = [
  { name: "w1280", width: 1280, height: 620 },
  { name: "w1366", width: 1366, height: 768 },
  { name: "w1536", width: 1536, height: 730 },
  { name: "w1920", width: 1920, height: 1080 },
  { name: "w390", width: 390, height: 844 },
] as const;

const startServers = !!process.env.PW_START_SERVERS;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]],
  use: {
    baseURL: "http://localhost:3000", // must be localhost: the backend CORS list has no 127.0.0.1
    trace: "retain-on-failure",
    reducedMotion: "reduce",
    permissions: ["camera", "microphone"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  projects: VIEWPORTS.map((v) => ({
    name: v.name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: v.width, height: v.height },
      ...(v.width < 500 ? { isMobile: true, hasTouch: true } : {}),
    },
  })),
  webServer: startServers
    ? [
        {
          command: "uv run uvicorn app.main:app --port 8000",
          cwd: "../Backend",
          url: "http://localhost:8000/docs",
          reuseExistingServer: true,
          timeout: 120_000,
          env: { THOS_DATABASE_URL: "sqlite:///./data/e2e.db", THOS_SEED_DEMO_DATA: "true" },
        },
        { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 180_000 },
      ]
    : undefined,
});
```

> If `THOS_DATABASE_URL` uses a different format in `Backend/app/core` or the config file, adapt it. Run `grep -rn "THOS_DATABASE_URL" Backend/app` to check. By default, the suite reuses the servers the user already has running.

- [x] **Step 4: Create `Frontend/e2e/fixtures.ts`**

```ts
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000";
export const ACCOUNTS = {
  employer: { email: "ayesha.khan@nut.edu.pk", password: "Password123!" },
  candidate: { email: "hira.ahmed@gmail.com", password: "Password123!" },
} as const;
export type Persona = keyof typeof ACCOUNTS | "public";
export type Theme = "light" | "dark";
export type Session = { access_token: string; refresh_token: string } & Record<string, unknown>;

export async function apiLogin(persona: keyof typeof ACCOUNTS): Promise<Session> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNTS[persona]),
  });
  if (!res.ok) throw new Error(`login ${persona} failed: ${res.status}`);
  return (await res.json()) as Session;
}

/** Fresh API login per call (refresh tokens are single-use, so never share storageState between contexts). */
export async function signIn(page: Page, persona: Persona, theme: Theme = "light") {
  const session = persona === "public" ? null : await apiLogin(persona);
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(
    ([s, t]) => {
      window.localStorage.setItem("thos-theme", t as string);
      if (s) {
        const sess = s as Session;
        window.localStorage.setItem("thos.access_token", sess.access_token);
        window.localStorage.setItem("thos.refresh_token", sess.refresh_token);
        window.localStorage.setItem("thos.session", JSON.stringify(sess));
      }
    },
    [session, theme] as const,
  );
  return session;
}

/** Block every mutating API call (keeps the shared dev DB clean). Auth calls stay allowed. */
export async function readOnly(page: Page) {
  await page.route(`${API}/**`, (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "OPTIONS" || req.url().includes("/api/v1/auth/")) return route.continue();
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "e2e_read_only", message: "Blocked by read-only e2e" } }),
    });
  });
  await page.route("**/api/interviews/token", (route) => route.fulfill({ status: 403, body: "{}" }));
}

export function onlyProject(testInfo: TestInfo, name = "w1366") {
  base.skip(testInfo.project.name !== name, `runs on ${name} only`);
}

export async function resolveIds() {
  const emp = await apiLogin("employer");
  const cand = await apiLogin("candidate");
  const get = async (path: string, s: Session) =>
    (await (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${s.access_token}` } })).json()) as Record<string, unknown>;
  const postings = (await get("/api/v1/postings", emp)).postings as { id: string }[];
  const apps = (await get("/api/v1/candidates/me/applications", cand)).applications as {
    id: string; applied_interview: { attempt_id: string } | null;
  }[];
  const pipeline = (await get("/api/v1/pipeline", emp)).columns as { cards: { id: string }[] }[];
  return {
    postingId: postings[0]?.id ?? "missing",
    attemptId: apps.find((a) => a.applied_interview)?.applied_interview?.attempt_id ?? null,
    applicationId: pipeline.flatMap((c) => c.cards)[0]?.id ?? null,
  };
}

export const test = base;
export { expect };
```

- [x] **Step 5: Create `Frontend/e2e/routes.ts`**

```ts
import type { Persona } from "./fixtures";

export type Ids = { postingId: string; attemptId: string | null; applicationId: string | null };
export type RouteSpec = { name: string; persona: Persona; path: string | ((ids: Ids) => string | null) };

export const ROUTES: RouteSpec[] = [
  { name: "login", persona: "public", path: "/login" },
  { name: "register", persona: "public", path: "/register" },
  { name: "register-org", persona: "public", path: "/register/organization" },
  { name: "interview-room", persona: "public", path: "/interviews/faculty-panel" },
  { name: "home", persona: "employer", path: "/" },
  { name: "jobs", persona: "employer", path: "/jobs" },
  { name: "jobs-create", persona: "employer", path: "/jobs?create=1" },
  { name: "job-detail", persona: "employer", path: (ids) => `/jobs/${ids.postingId}` },
  { name: "pipeline", persona: "employer", path: "/pipeline" },
  { name: "pipeline-drawer", persona: "employer", path: (ids) => (ids.applicationId ? `/pipeline?applicationId=${ids.applicationId}` : null) },
  { name: "talent", persona: "employer", path: "/talent" },
  { name: "analytics", persona: "employer", path: "/analytics" },
  { name: "messages", persona: "employer", path: "/messages" },
  { name: "automations", persona: "employer", path: "/automations" },
  { name: "admin", persona: "employer", path: "/admin" },
  { name: "admin-members", persona: "employer", path: "/admin#members" },
  { name: "admin-packs", persona: "employer", path: "/admin#packs" },
  { name: "admin-workflows", persona: "employer", path: "/admin#workflows" },
  { name: "admin-emails", persona: "employer", path: "/admin#emails" },
  { name: "admin-audit", persona: "employer", path: "/admin#audit" },
  { name: "cand-home", persona: "candidate", path: "/candidate" },
  { name: "cand-jobs", persona: "candidate", path: "/candidate/jobs" },
  { name: "cand-applications", persona: "candidate", path: "/candidate/applications" },
  { name: "cand-messages", persona: "candidate", path: "/candidate/messages" },
  { name: "cand-profile", persona: "candidate", path: "/candidate/profile" },
  { name: "cand-screening", persona: "candidate", path: "/candidate/interview" },
  { name: "cand-applied", persona: "candidate", path: (ids) => (ids.attemptId ? `/candidate/applied/${ids.attemptId}` : null) },
  { name: "cand-sandbox", persona: "candidate", path: (ids) => (ids.attemptId ? `/candidate/sandbox/${ids.attemptId}` : null) },
];

export function resolvePath(route: RouteSpec, ids: Ids): string | null {
  return typeof route.path === "function" ? route.path(ids) : route.path;
}
```

- [x] **Step 6: Create `Frontend/e2e/layout-rules.ts`.** This is the detector from the audit, which found every defect in the glitch log.

```ts
export type LayoutIssue = { kind: string; detail: string };

/** Runs inside the page via page.evaluate. Must stay self-contained (no imports, no closures). */
export function detectLayoutIssues(): LayoutIssue[] {
  const vw = window.innerWidth;
  const issues: LayoutIssue[] = [];
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) issues.push({ kind: "page-horizontal-scroll", detail: `scrollWidth ${de.scrollWidth} > ${vw}` });

  const describe = (el: Element) => {
    const h = el as HTMLElement;
    const t = (h.innerText || el.getAttribute("aria-label") || (h as HTMLInputElement).value || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const cls = typeof h.className === "string" ? h.className.split(" ").slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${t}"`;
  };
  const visible = (el: Element) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const ignored = (el: Element) => !!el.closest("[data-layout-ignore]");
  const inScroller = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const clippedBy = (el: Element, r: DOMRect) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.left < pr.left - 2) return p;
      }
    }
    return null;
  };
  const bordered = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRightWidth) > 0) return p;
    }
    return null;
  };

  const controls = Array.from(document.querySelectorAll(
    "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]",
  )).filter((el) => visible(el) && !ignored(el));
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) issues.push({ kind: "control-offscreen", detail: describe(el) });
    const clip = clippedBy(el, r);
    if (clip && !inScroller(el)) issues.push({ kind: "control-clipped", detail: `${describe(el)} by ${describe(clip).slice(0, 40)}` });
  }

  const texty = Array.from(document.querySelectorAll("button, a[href], select, input, h1, h2, h3, h4, span, strong, p"))
    .filter((el) => visible(el) && !ignored(el))
    .slice(0, 1200);
  for (const el of texty) {
    const box = bordered(el);
    if (!box || inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.right > b.right + 2 || r.left < b.left - 2)
      issues.push({ kind: "escapes-container", detail: `${describe(el)} out of ${describe(box).slice(0, 40)}` });
  }
  // de-duplicate
  const seen = new Set<string>();
  return issues.filter((i) => { const k = i.kind + i.detail; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
}
```

- [x] **Step 7: Create `Frontend/e2e/layout.spec.ts`**

```ts
import { expect, readOnly, resolveIds, signIn, test, type Theme } from "./fixtures";
import { detectLayoutIssues } from "./layout-rules";
import { ROUTES, resolvePath, type Ids } from "./routes";

let ids: Ids;
test.beforeAll(async () => { ids = await resolveIds(); });

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`layout rules · ${theme}`, () => {
    for (const route of ROUTES) {
      test(`${route.name}`, async ({ page }) => {
        const path = resolvePath(route, ids);
        test.skip(!path, "no data for this dynamic route");
        await signIn(page, route.persona, theme);
        await readOnly(page);
        await page.goto(path!);
        await page.getByRole("heading").first().waitFor({ state: "visible" });
        await page.waitForTimeout(800); // let data-driven sections render
        const issues = await page.evaluate(detectLayoutIssues);
        expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
      });
    }
  });
}
```

- [x] **Step 8: Create `Frontend/e2e/capture.spec.ts`** (screenshots for human review; never asserts)

```ts
import { readOnly, resolveIds, signIn, test, type Theme } from "./fixtures";
import { ROUTES, resolvePath, type Ids } from "./routes";

let ids: Ids;
test.beforeAll(async () => { ids = await resolveIds(); });

for (const theme of ["light", "dark"] as Theme[]) {
  for (const route of ROUTES) {
    test(`@capture ${theme} ${route.name}`, async ({ page }, testInfo) => {
      const path = resolvePath(route, ids);
      test.skip(!path, "no data");
      await signIn(page, route.persona, theme);
      await readOnly(page);
      await page.goto(path!);
      await page.getByRole("heading").first().waitFor({ state: "visible" });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `e2e/__screens__/${testInfo.project.name}/${theme}/${route.name}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}
```

- [x] **Step 9: Run the layout spec against TODAY's UI. Expect failures.**

Run: `cd Frontend && npx playwright test e2e/layout.spec.ts --project=w390 --reporter=line`

Expected: **FAIL**. At minimum, `page-horizontal-scroll` should appear on most routes (glitch G1), along with `control-offscreen` on `messages` (G6) and `register-org` (G7). This proves the rules catch the known defects. Save a one-line summary of the failing count into the task note.

- [x] **Step 10: Typecheck, Vitest, commit**

Run: `npm run typecheck && npm test`. Expected: both pass. Vitest must not pick up `e2e/`.

```bash
git add Frontend/package.json Frontend/package-lock.json Frontend/vitest.config.ts Frontend/playwright.config.ts Frontend/e2e .gitignore
git commit -m "test(e2e): add Playwright harness and layout rules from the UI audit"
```

---

## Task 2: Design tokens, typography and base

> Note: Kept the v2 `* { margin:0; padding:0 }` reset (existing lists/forms rely on it). Added a pre-paint theme init script in app/layout.tsx so shell-less pages honour thos-theme. next.config distDir is overridable via NEXT_DIST_DIR so builds don't clobber the dev server.

The new semantic token layer, and the legacy names re-pointed to it so existing screens adopt the new palette immediately.

**Files:**
- Create: `Frontend/styles/theme.css`
- Modify: `Frontend/app/globals.css`: add the import after `tokens.css`, and replace the base reset block
- Modify: `Frontend/styles/typography.css`: font import and heading font
- Test: `Frontend/tests/theme-tokens.test.ts`

**Interfaces (produced):** these CSS custom properties exist in both themes:
- `--bg --surface --surface-2 --surface-3 --border --border-strong --ink --ink-2 --ink-3 --ink-4`
- `--brand --brand-hover --brand-ink --brand-soft --brand-line`
- `--teal --teal-soft --amber --amber-soft --red --red-soft --green --green-soft --violet --violet-soft`
- `--viz-1..4 --viz-mag --viz-grid --viz-axis`
- `--shadow-1 --shadow-pop --r-sm --r-md --r-lg --r-xl --focus-ring --rail-w --panel-w --topbar-h --tabbar-h`

- [x] **Step 1: Write the failing test** `Frontend/tests/theme-tokens.test.ts`

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "../styles/theme.css"), "utf8");
const globals = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const typography = readFileSync(join(__dirname, "../styles/typography.css"), "utf8");

const REQUIRED = ["--bg", "--surface", "--surface-2", "--surface-3", "--border", "--border-strong", "--ink", "--ink-2", "--ink-3",
  "--brand", "--brand-ink", "--brand-soft", "--brand-line", "--teal", "--teal-soft", "--amber", "--amber-soft", "--red", "--red-soft",
  "--green", "--green-soft", "--violet", "--violet-soft", "--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-mag"];

describe("theme tokens", () => {
  it("defines every semantic token for light and dark", () => {
    const [light, dark] = [css.split('[data-theme="dark"]')[0], css.split('[data-theme="dark"]')[1] ?? ""];
    for (const t of REQUIRED) {
      expect(light).toContain(`${t}:`);
      expect(dark).toContain(`${t}:`);
    }
  });
  it("uses the approved brand values", () => {
    expect(css).toContain("--brand: #2f5bea");
    expect(css).toContain("--brand: #7090ff");
  });
  it("is imported right after tokens.css", () => {
    expect(globals.indexOf('@import "../styles/theme.css"')).toBeGreaterThan(globals.indexOf('@import "../styles/tokens.css"'));
  });
  it("drops Poppins", () => {
    expect(typography).not.toMatch(/Poppins/);
  });
});
```

- [x] **Step 2: Run it.** `cd Frontend && npx vitest run tests/theme-tokens.test.ts`. Expected: FAIL (`theme.css` not found).

- [x] **Step 3: Create `Frontend/styles/theme.css`**

```css
/**
 * THOS "D" design system — semantic tokens (light + dark) and legacy re-mapping.
 * Spec: .scratch/ui-revamp/prd.md §4. Loaded right after tokens.css so these values win.
 * New code uses the semantic names (--bg, --surface, --ink, --brand…). Legacy names are re-pointed below
 * so older CSS adopts the new palette until every screen is migrated.
 */

:root,
[data-theme="light"] {
  color-scheme: light;
  --bg: #f7f7f8;
  --surface: #ffffff;
  --surface-2: #f2f3f5;
  --surface-3: #eaebee;
  --border: #e5e6ea;
  --border-strong: #d4d6dc;
  --ink: #111318;
  --ink-2: #4b505b;
  --ink-3: #767c88;
  --ink-4: #9aa0ab;
  --brand: #2f5bea;
  --brand-hover: #2449c4;
  --brand-ink: #ffffff;
  --brand-soft: #eef2fe;
  --brand-line: #c9d5fb;
  --teal: #0f7f74;
  --teal-soft: #e5f4f1;
  --amber: #9a5b00;
  --amber-soft: #fcf1de;
  --red: #b8322a;
  --red-soft: #fbeceb;
  --green: #1d7a45;
  --green-soft: #e6f4ec;
  --violet: #6247b8;
  --violet-soft: #f0ecfb;
  --viz-1: #2a78d6;
  --viz-2: #eb6834;
  --viz-3: #1baf7a;
  --viz-4: #eda100;
  --viz-mag: #2a78d6;
  --viz-grid: #ececef;
  --viz-axis: #d4d6dc;
  --shadow-1: 0 1px 2px rgba(17, 19, 24, 0.05);
  --shadow-pop: 0 12px 32px -8px rgba(17, 19, 24, 0.22), 0 0 0 1px rgba(17, 19, 24, 0.06);
  --scrim: rgba(10, 11, 14, 0.35);
}

[data-theme="dark"] {
  color-scheme: dark;
  --bg: #0c0d10;
  --surface: #141519;
  --surface-2: #1a1c21;
  --surface-3: #22252b;
  --border: #25282f;
  --border-strong: #343842;
  --ink: #eceef2;
  --ink-2: #b0b5bf;
  --ink-3: #7d838f;
  --ink-4: #5c626d;
  --brand: #7090ff;
  --brand-hover: #8aa3ff;
  --brand-ink: #0c0d10;
  --brand-soft: #1b2340;
  --brand-line: #2e3d73;
  --teal: #4cc7b8;
  --teal-soft: #11302c;
  --amber: #e7a94a;
  --amber-soft: #33260f;
  --red: #f0837a;
  --red-soft: #3a1a18;
  --green: #5fcf8e;
  --green-soft: #12301f;
  --violet: #a996f2;
  --violet-soft: #251f3d;
  --viz-1: #3987e5;
  --viz-2: #d95926;
  --viz-3: #199e70;
  --viz-4: #c98500;
  --viz-mag: #3987e5;
  --viz-grid: #22252b;
  --viz-axis: #343842;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-pop: 0 16px 40px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06);
  --scrim: rgba(0, 0, 0, 0.55);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #0c0d10;
    --surface: #141519;
    --surface-2: #1a1c21;
    --surface-3: #22252b;
    --border: #25282f;
    --border-strong: #343842;
    --ink: #eceef2;
    --ink-2: #b0b5bf;
    --ink-3: #7d838f;
    --ink-4: #5c626d;
    --brand: #7090ff;
    --brand-hover: #8aa3ff;
    --brand-ink: #0c0d10;
    --brand-soft: #1b2340;
    --brand-line: #2e3d73;
    --teal: #4cc7b8;
    --teal-soft: #11302c;
    --amber: #e7a94a;
    --amber-soft: #33260f;
    --red: #f0837a;
    --red-soft: #3a1a18;
    --green: #5fcf8e;
    --green-soft: #12301f;
    --violet: #a996f2;
    --violet-soft: #251f3d;
    --viz-1: #3987e5;
    --viz-2: #d95926;
    --viz-3: #199e70;
    --viz-4: #c98500;
    --viz-mag: #3987e5;
    --viz-grid: #22252b;
    --viz-axis: #343842;
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-pop: 0 16px 40px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06);
    --scrim: rgba(0, 0, 0, 0.55);
  }
}

/* Theme-independent geometry + legacy re-mapping (var() resolves per theme automatically). */
:root,
[data-theme] {
  --r-sm: 6px;
  --r-md: 8px;
  --r-lg: 12px;
  --r-xl: 16px;
  --radius-xs: 4px;
  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);
  --radius-xl: var(--r-xl);
  --rail-w: 60px;
  --panel-w: 248px;
  --topbar-h: 52px;
  --topbar-height: var(--topbar-h);
  --tabbar-h: 60px;
  --focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--brand);
  --focus: var(--brand);
  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* legacy → semantic */
  --surface-app: var(--bg);
  --surface-card: var(--surface);
  --surface-card-hover: var(--surface-2);
  --surface-card-active: var(--surface-3);
  --surface-sunken: var(--surface-2);
  --surface-subtle: var(--surface-2);
  --surface-warm: var(--surface-2);
  --surface-sidebar: var(--surface);
  --surface-sidebar-hover: var(--surface-3);
  --surface-sidebar-active: var(--brand-soft);
  --surface-sidebar-border: var(--border);
  --border-subtle: var(--border);
  --border-focus: var(--brand);
  --ink-900: var(--ink);
  --ink-800: var(--ink);
  --ink-700: var(--ink-2);
  --ink-600: var(--ink-2);
  --ink-500: var(--ink-3);
  --ink-400: var(--ink-4);
  --ink-300: var(--border-strong);
  --ink-200: var(--border);
  --ink-100: var(--surface-2);
  --brand-500: var(--brand);
  --brand-600: var(--brand-hover);
  --brand-200: var(--brand-line);
  --brand-100: var(--brand-soft);
  --shadow-xs: var(--shadow-1);
  --shadow-sm: var(--shadow-1);
  --shadow-card: var(--shadow-1);
  --shadow-hover: var(--shadow-1);
  --shadow-popover: var(--shadow-pop);
  --shadow-overlay: var(--shadow-pop);
  --shadow-drawer: var(--shadow-pop);
}
```

- [x] **Step 4: Wire it into `app/globals.css`**
  - Add `@import "../styles/theme.css";` on the line **directly after** `@import "../styles/tokens.css";`.
  - Replace the "Base Reset" block (the rules between `/* Base Reset */` and the first `Specialized Screen` comment) with:

```css
/* Base Reset */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100dvh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 13.5px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
img, svg, video { max-width: 100%; }
button, input, select, textarea { font: inherit; color: inherit; }
input[type="checkbox"], input[type="radio"] { accent-color: var(--brand); }
a { color: inherit; text-decoration: none; }
:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--r-sm); }
::selection { background: var(--brand-soft); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
```

  > Keep any existing rule in the old reset that sets something specific (for example `.sr-only`) if no other file defines it. Check with `grep -n "sr-only" styles/*.css`.

- [x] **Step 5: Typography.** In `styles/typography.css`:
  1. Replace the `@import url(...)` line with:
     ```css
     @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap");
     ```
  2. Change every `font-family` that mentions `Poppins` to `var(--font-sans)`.
  3. Set the heading scale: `h1 { font-size: 20px; font-weight: 650; letter-spacing: -0.015em; line-height: 1.25; text-wrap: balance; }`, `h2 { font-size: 15px; font-weight: 600; }`, `h3 { font-size: 13.5px; font-weight: 600; }`, `h4 { font-size: 12.5px; font-weight: 600; }`, all with `margin: 0`.
  4. Keep `.tabular-nums`, `.truncate`, `.line-clamp-*` and `.sr-only` if they live here.

- [x] **Step 6: Run the tests and checks.** `npx vitest run tests/theme-tokens.test.ts`, then `npm test`, then `npm run typecheck`, then `npm run build`. Expected: all PASS.

- [x] **Step 7: Look at it.** Open `http://localhost:3000/` and `http://localhost:3000/candidate`. Existing screens should now show the cooler greys, the new blue and a light sidebar background. They will still look rough; later tasks fix that. Make sure nothing became invisible: no white-on-white text in the old navy sidebar. The old sidebar used inverse ink on `--surface-sidebar`. Until Task 6 replaces it, add this temporary rule to `styles/layout.css`:

```css
.sidebar, .sidebar a, .sidebar strong, .sidebar small { color: var(--ink-2); }
.sidebar a.is-active { color: var(--brand); }
```

- [x] **Step 8: Commit**

```bash
git add Frontend/styles/theme.css Frontend/app/globals.css Frontend/styles/typography.css Frontend/styles/layout.css Frontend/tests/theme-tokens.test.ts
git commit -m "feat(ui): add D design tokens, Inter-only typography and base reset"
```

---

## Task 3: UI primitives (restyle existing, add new)

> Note: Did not hide .eyebrow globally: several screens still use it for real data (org names, question numbers, labels). It is restyled as a micro label; screen tasks remove decorative ones. Moved Modal/Drawer/State/Toast inline styles to classes; Drawer no longer forces an inline width so .drawer--wide and the mobile rule apply.

**Files:**
- Modify: `Frontend/styles/components.css`. Append a `/* === D primitives === */` section at the **end** (later rules win; dead rules are removed in Task 17).
- Modify: `Frontend/components/ui/tabs.tsx` (keyboard roving, count pill as a class)
- Create:
  - `Frontend/components/ui/page-header.tsx`
  - `Frontend/components/ui/switch.tsx`
  - `Frontend/components/ui/stepper.tsx`
  - `Frontend/components/ui/stat-tile.tsx`
  - `Frontend/components/ui/popover.tsx`
  - `Frontend/components/ui/segmented-control.tsx`
- Test: `Frontend/tests/primitives.test.tsx`

**Interfaces (produced):**
```ts
PageHeader({ title: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string })   // renders <header class="page-header"><h1>
Switch({ checked: boolean; onChange: (next: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string })
Stepper({ steps: string[]; current: number; orientation?: "horizontal" | "vertical"; renderStep?: (step: string, i: number, state: "done"|"current"|"upcoming") => ReactNode })
StatTile({ label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; action?: ReactNode })
Popover({ trigger: (p: { open: boolean; toggle: () => void; ref: RefObject<HTMLButtonElement|null> }) => ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: "left"|"right"; label: string; className?: string })
SegmentedControl<T extends string>({ value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; label: string })
Tabs — unchanged props; adds ArrowLeft/ArrowRight/Home/End roving focus and aria-controls-free tabIndex management
```

- [x] **Step 1: Write the failing tests** `Frontend/tests/primitives.test.tsx`

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { Stepper } from "@/components/ui/stepper";
import { StatTile } from "@/components/ui/stat-tile";
import { Popover } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Tabs } from "@/components/ui/tabs";

describe("PageHeader", () => {
  it("renders one h1, meta and actions", () => {
    render(<PageHeader title="Pipeline" meta="7 candidates" actions={<button>Go</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Pipeline" })).toBeInTheDocument();
    expect(screen.getByText("7 candidates")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});

describe("Switch", () => {
  it("is a switch that toggles", () => {
    const Demo = () => { const [on, setOn] = useState(false); return <Switch checked={on} onChange={setOn} label="Blind review" />; };
    render(<Demo />);
    const sw = screen.getByRole("switch", { name: "Blind review" });
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    expect(sw).toBeChecked();
  });
});

describe("Stepper", () => {
  it("marks the current step", () => {
    render(<Stepper steps={["Received", "Review", "Interview", "Decision"]} current={2} />);
    expect(screen.getByText("Interview").closest("li")).toHaveAttribute("aria-current", "step");
  });
});

describe("StatTile", () => {
  it("shows label and value", () => {
    render(<StatTile label="In flight" value={7} />);
    expect(screen.getByText("In flight")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("Popover", () => {
  it("opens, and closes on Escape", () => {
    render(<Popover label="Menu" trigger={({ toggle, open, ref }) => <button ref={ref} aria-expanded={open} onClick={toggle}>Open</button>}><p>Inside</p></Popover>);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByText("Inside")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Inside")).not.toBeInTheDocument();
  });
});

describe("SegmentedControl", () => {
  it("presses the selected option", () => {
    const onChange = vi.fn();
    render(<SegmentedControl label="View" value="funnel" onChange={onChange} options={[{ value: "funnel", label: "Funnel" }, { value: "board", label: "Board" }]} />);
    expect(screen.getByRole("button", { name: "Funnel" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Board" }));
    expect(onChange).toHaveBeenCalledWith("board");
  });
});

describe("Tabs keyboard", () => {
  it("moves selection with ArrowRight", () => {
    const onChange = vi.fn();
    render(<Tabs tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} activeTab="a" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "A" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
```

- [x] **Step 2: Run them.** `npx vitest run tests/primitives.test.tsx`. Expected: FAIL (modules not found).

- [x] **Step 3: Create the components**

`components/ui/page-header.tsx`
```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, meta, actions, className }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("page-header", className)}>
      <div className="page-header__text">
        <h1>{title}</h1>
        {meta && <div className="page-header__meta">{meta}</div>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
```

`components/ui/switch.tsx`
```tsx
"use client";
import { useId, type ReactNode } from "react";

export function Switch({ checked, onChange, label, description, disabled, id }: {
  checked: boolean; onChange: (next: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean; id?: string;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label className="switch-row" htmlFor={inputId}>
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {description && <span className="switch-row__desc">{description}</span>}
      </span>
      <input id={inputId} type="checkbox" role="switch" className="switch" checked={checked} disabled={disabled}
        aria-checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
```

`components/ui/stepper.tsx`
```tsx
import type { ReactNode } from "react";
import { LuCheck } from "react-icons/lu";
import { cn } from "@/lib/cn";

type StepState = "done" | "current" | "upcoming";
export function Stepper({ steps, current, orientation = "horizontal", renderStep }: {
  steps: string[]; current: number; orientation?: "horizontal" | "vertical";
  renderStep?: (step: string, index: number, state: StepState) => ReactNode;
}) {
  return (
    <ol className={cn("stepper", `stepper--${orientation}`)} aria-label="Progress">
      {steps.map((step, i) => {
        const state: StepState = i < current ? "done" : i === current ? "current" : "upcoming";
        return (
          <li key={step} className={`stepper__step is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stepper__dot" aria-hidden="true">{state === "done" ? <LuCheck size={11} /> : null}</span>
            <span className="stepper__body">{renderStep ? renderStep(step, i, state) : <span className="stepper__label">{step}</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}
```

`components/ui/stat-tile.tsx`
```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function StatTile({ label, value, hint, href, action }: { label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; action?: ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value tabular-nums">{value}</strong>
      {hint && <span className="stat-tile__hint">{hint}</span>}
      {href && <Link className="stat-tile__link" href={href}>{action ?? "Open"}</Link>}
      {!href && action}
    </div>
  );
}
```

`components/ui/popover.tsx`
```tsx
"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/cn";

export function Popover({ trigger, children, align = "right", label, className }: {
  trigger: (p: { open: boolean; toggle: () => void; ref: RefObject<HTMLButtonElement | null> }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right"; label: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); btn.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return (
    <div className="popover-anchor" ref={wrap}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn })}
      {open && (
        <div className={cn("popover", `popover--${align}`, className)} role="dialog" aria-label={label}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
```

`components/ui/segmented-control.tsx`
```tsx
"use client";
import type { ReactNode } from "react";

export function SegmentedControl<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <span aria-hidden="true">{o.icon}</span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`components/ui/tabs.tsx` (replace the whole file)
```tsx
"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem<T extends string = string> = { id: T; label: string; count?: number; icon?: ReactNode };

export function Tabs<T extends string = string>({ tabs, activeTab, onChange, className }: {
  tabs: TabItem<T>[]; activeTab: T; onChange: (tabId: T) => void; className?: string;
}) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    const list = e.currentTarget.parentElement;
    (list?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next])?.focus();
  };
  return (
    <div className={cn("tabs-nav", className)} role="tablist">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <button key={tab.id} type="button" role="tab" aria-selected={isActive} tabIndex={isActive ? 0 : -1}
            className={cn("tabs-nav__item", isActive && "tabs-nav__item--active")}
            onClick={() => onChange(tab.id)} onKeyDown={(e) => onKey(e, i)}>
            {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="tabs-nav__count tabular-nums">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [x] **Step 4: Append the D primitive styles** to the end of `styles/components.css`. These restyle the **existing** class names, so every screen improves at once, and add styles for the new components.

```css
/* =========================================================================
   D primitives (PRD §4.3). Appended last so they win over legacy rules above.
   ========================================================================= */

/* Buttons (existing API: .button + .button--{primary,secondary,outline,ghost,danger,danger-filled} + .button--{sm,lg}) */
.button, .btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px;
  border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); color: var(--ink);
  font-size: 13px; font-weight: 500; line-height: 1; white-space: nowrap; cursor: pointer; text-decoration: none;
  transition: background-color 120ms, border-color 120ms, color 120ms;
}
.button:hover:not(:disabled), .btn:hover:not(:disabled) { background: var(--surface-2); }
.button--primary, .btn-primary { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }
.button--primary:hover:not(:disabled), .btn-primary:hover:not(:disabled) { background: var(--brand-hover); border-color: var(--brand-hover); }
.button--secondary, .button--outline { background: var(--surface); }
.button--ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
.button--ghost:hover:not(:disabled) { background: var(--surface-3); color: var(--ink); }
.button--danger { background: var(--red-soft); border-color: transparent; color: var(--red); }
.button--danger-filled { background: var(--red); border-color: var(--red); color: #fff; }
.button--sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.button--lg { height: 40px; padding: 0 16px; font-size: 14px; }
.button:disabled, .btn:disabled, .button[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
.button__icon { display: inline-flex; }
.button__spinner { width: 13px; height: 13px; border-radius: 99px; border: 2px solid currentColor; border-right-color: transparent; animation: d-spin 700ms linear infinite; }
.icon-button {
  position: relative; display: inline-grid; place-items: center; width: 32px; height: 32px; flex: none;
  border: 1px solid transparent; border-radius: var(--r-md); background: transparent; color: var(--ink-2); cursor: pointer;
}
.icon-button:hover { background: var(--surface-3); color: var(--ink); }
@keyframes d-spin { to { transform: rotate(360deg); } }

/* Inputs */
.input, .select, .textarea, input.input, select.select, textarea.textarea {
  width: 100%; min-width: 0; min-height: 34px; padding: 7px 10px; border: 1px solid var(--border-strong); border-radius: var(--r-md);
  background: var(--surface); color: var(--ink); font-size: 13.5px;
}
.textarea, textarea.input { min-height: 88px; resize: vertical; }
.input::placeholder, .textarea::placeholder { color: var(--ink-4); }
.input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); }
.select { padding-right: 28px; }
.form-field { display: grid; gap: 6px; min-width: 0; }
.form-field__label { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.form-field__hint { font-size: 12px; color: var(--ink-3); }
.form-field__error, .form-error { font-size: 12.5px; color: var(--red); }
.form-success { font-size: 12.5px; color: var(--green); }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 14px; }
.form-grid__full { grid-column: 1 / -1; }
.form-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
input[type="file"].file-input-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; }
.file-button { position: relative; }
.file-button:focus-within { box-shadow: var(--focus-ring); }

/* Panels / cards */
.panel, .card { min-width: 0; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); box-shadow: none; overflow: hidden; }
.panel__header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.panel__header h2, .panel__header h3 { font-size: 13.5px; font-weight: 600; }
.panel__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
.panel-body { padding: 16px; }
.panel-note { font-size: 12.5px; color: var(--ink-3); }
.eyebrow { display: none; } /* eyebrows are retired: PageHeader replaces them (PRD §6) */

/* Page header */
.page-header { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 16px; margin-bottom: 18px; }
.page-header__text { flex: 1 1 260px; min-width: 0; }
.page-header h1 { font-size: 20px; font-weight: 650; letter-spacing: -0.015em; }
.page-header__meta { margin-top: 2px; font-size: 12.5px; color: var(--ink-3); }
.page-header__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

/* Pills / badges / tags */
.pill, .badge {
  display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 99px;
  background: var(--surface-3); color: var(--ink-2); font-size: 11.5px; font-weight: 500; white-space: nowrap; max-width: 100%;
}
.pill--brand, .badge--brand { background: var(--brand-soft); color: var(--brand); }
.pill--verified, .badge--teal { background: var(--teal-soft); color: var(--teal); }
.pill--attention, .badge--amber { background: var(--amber-soft); color: var(--amber); }
.pill--danger, .badge--red { background: var(--red-soft); color: var(--red); }
.pill--success { background: var(--green-soft); color: var(--green); }
.pill--approval { background: var(--violet-soft); color: var(--violet); }
.pack-chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 99px; background: var(--teal-soft); color: var(--teal); font-size: 12px; font-weight: 600; white-space: nowrap; }
.score-badge {
  display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border: 1px solid var(--border);
  border-radius: var(--r-sm); background: var(--surface); font-size: 11.5px; color: var(--ink-3); white-space: nowrap; flex: none;
}
.score-badge strong { font-weight: 650; color: var(--ink); }
.score-badge--gold strong { color: var(--green); }
.score-badge--silver strong { color: var(--brand); }
.score-badge--bronze strong { color: var(--amber); }
.score-badge--weak strong { color: var(--red); }

/* Tables */
.table-container { width: 100%; overflow-x: auto; }
.table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 13px; }
.table th { padding: 8px 12px; text-align: left; font-size: 12px; font-weight: 500; color: var(--ink-3); background: var(--surface-2); border-bottom: 1px solid var(--border); white-space: nowrap; }
.table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.table tr:last-child td { border-bottom: 0; }
.table tbody tr:hover td { background: var(--surface-2); }

/* Tabs */
.tabs-nav { display: flex; gap: 2px; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.tabs-nav__item { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--ink-3); font-weight: 500; white-space: nowrap; cursor: pointer; }
.tabs-nav__item--active { color: var(--ink); border-bottom-color: var(--ink); }
.tabs-nav__count { padding: 0 6px; border-radius: 99px; background: var(--surface-3); font-size: 11px; }
.tabs-nav__item--active .tabs-nav__count { background: var(--brand-soft); color: var(--brand); }

/* Segmented control */
.segmented { display: inline-flex; padding: 2px; border-radius: var(--r-md); background: var(--surface-3); max-width: 100%; overflow-x: auto; }
.segmented button { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-2); font-size: 12.5px; font-weight: 500; white-space: nowrap; cursor: pointer; }
.segmented button[aria-pressed="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-1); }

/* Switch */
.switch-row { display: flex; align-items: center; gap: 14px; cursor: pointer; }
.switch-row__text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.switch-row__label { font-weight: 500; }
.switch-row__desc { font-size: 12.5px; color: var(--ink-3); }
.switch { appearance: none; position: relative; width: 36px; height: 20px; flex: none; margin: 0; border-radius: 99px; background: var(--border-strong); cursor: pointer; transition: background-color 120ms; }
.switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 99px; background: #fff; box-shadow: var(--shadow-1); transition: transform 120ms; }
.switch:checked { background: var(--brand); }
.switch:checked::after { transform: translateX(16px); }
.switch:disabled { opacity: 0.5; cursor: not-allowed; }

/* Stepper */
.stepper { list-style: none; margin: 0; padding: 0; }
.stepper--horizontal { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.stepper--horizontal .stepper__step { position: relative; display: grid; justify-items: center; gap: 6px; text-align: center; }
.stepper--horizontal .stepper__step + .stepper__step::before { content: ""; position: absolute; top: 9px; right: 50%; width: 100%; height: 2px; background: var(--border-strong); }
.stepper--horizontal .stepper__step.is-done + .stepper__step::before, .stepper--horizontal .stepper__step.is-current::before { background: var(--brand); }
.stepper--vertical { display: grid; }
.stepper--vertical .stepper__step { position: relative; display: flex; gap: 12px; padding-bottom: 14px; }
.stepper--vertical .stepper__step:not(:last-child)::before { content: ""; position: absolute; left: 9px; top: 20px; bottom: 0; width: 2px; background: var(--border); }
.stepper--vertical .stepper__step.is-done::before { background: var(--brand); }
.stepper__dot { position: relative; z-index: 1; display: grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 99px; border: 2px solid var(--border-strong); background: var(--surface); color: var(--brand-ink); }
.stepper__step.is-done .stepper__dot { background: var(--brand); border-color: var(--brand); }
.stepper__step.is-current .stepper__dot { border-color: var(--brand); box-shadow: 0 0 0 4px var(--brand-soft); }
.stepper__body { min-width: 0; }
.stepper__label { font-size: 12px; color: var(--ink-3); line-height: 1.3; }
.stepper__step.is-current .stepper__label { color: var(--ink); font-weight: 600; }
.stepper__step.is-done .stepper__label { color: var(--ink-2); }

/* Stat tile */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 12px; margin-bottom: 20px; }
.stat-tile { display: grid; gap: 2px; justify-items: start; min-width: 0; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
.stat-tile__label { font-size: 12px; color: var(--ink-3); }
.stat-tile__value { font-size: 22px; font-weight: 650; letter-spacing: -0.02em; }
.stat-tile__hint { font-size: 12px; color: var(--ink-3); }
.stat-tile__link, .link { font-size: 12.5px; font-weight: 500; color: var(--brand); background: none; border: 0; padding: 0; cursor: pointer; }

/* Popover + menu */
.popover-anchor { position: relative; }
.popover { position: absolute; top: calc(100% + 6px); z-index: 60; min-width: 240px; max-width: calc(100vw - 24px); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-pop); animation: d-rise 120ms ease-out; }
.popover--right { right: 0; }
.popover--left { left: 0; }
.menu { display: grid; padding: 4px; }
.menu__item { display: grid; gap: 1px; width: 100%; padding: 8px 10px; border: 0; border-radius: var(--r-md); background: none; text-align: left; color: var(--ink); cursor: pointer; }
.menu__item:hover:not(:disabled), .menu__item:focus-visible { background: var(--surface-3); }
.menu__item:disabled { opacity: 0.45; cursor: not-allowed; }
.menu__item small { color: var(--ink-3); font-size: 12px; }
@keyframes d-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* Modal + drawer (existing markup: .dialog-backdrop > .dialog ; .drawer-backdrop > .drawer > __header/__body/__footer) */
.dialog-backdrop, .drawer-backdrop { position: fixed; inset: 0; z-index: 70; background: var(--scrim); }
.dialog-backdrop { display: grid; place-items: center; padding: 20px; }
.dialog { width: min(560px, 100%); max-height: calc(100dvh - 40px); overflow-y: auto; border-radius: var(--r-xl); background: var(--surface); box-shadow: var(--shadow-pop); animation: d-rise 140ms ease-out; }
.drawer { position: fixed; top: 8px; right: 8px; bottom: 8px; z-index: 71; display: flex; flex-direction: column; width: min(520px, calc(100vw - 16px)); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-pop); }
.drawer--wide { width: min(680px, calc(100vw - 16px)); }
.drawer__header { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px 10px; }
.drawer__body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 18px 16px; }
.drawer__footer { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--border); }
@media (max-width: 600px) { .drawer, .drawer--wide { top: 0; right: 0; bottom: 0; width: 100vw; border-radius: 0; } }

/* States + toasts + skeleton */
.state-block { display: grid; justify-items: center; gap: 8px; padding: 32px 16px; text-align: center; color: var(--ink-3); }
.state-block--error { color: var(--red); }
.state-block__spinner { width: 18px; height: 18px; border-radius: 99px; border: 2px solid var(--brand-line); border-top-color: var(--brand); animation: d-spin 800ms linear infinite; }
.toast-container { position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom)); z-index: 90; display: grid; gap: 8px; width: min(380px, calc(100vw - 32px)); }
.toast { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: var(--r-md); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-pop); font-size: 13px; }
.toast--success { border-left: 3px solid var(--green); }
.toast--error { border-left: 3px solid var(--red); }
.toast--warning { border-left: 3px solid var(--amber); }
.toast--info { border-left: 3px solid var(--brand); }
.skeleton { border-radius: var(--r-sm); background: linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2)); background-size: 200% 100%; animation: d-shimmer 1.2s linear infinite; }
@keyframes d-shimmer { to { background-position: -200% 0; } }

/* Breadcrumbs are retired from page chrome (PageHeader + topbar title replace them). Keep the component working. */
.breadcrumbs { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12.5px; color: var(--ink-3); }

/* Avatar */
.avatar { display: inline-grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 99px; background: var(--surface-3); color: var(--ink-2); font-size: 11px; font-weight: 600; }

/* Responsive table → cards helper (opt-in: add class "table--stack" to <table> and data-label on <td>) */
@media (max-width: 720px) {
  .table--stack { min-width: 0; }
  .table--stack thead { display: none; }
  .table--stack tr { display: grid; gap: 4px; padding: 12px; border-bottom: 1px solid var(--border); }
  .table--stack td { padding: 0; border: 0; }
  .table--stack td[data-label]::before { content: attr(data-label) " · "; color: var(--ink-3); font-size: 12px; }
}
```

- [x] **Step 5: Run the tests.** `npx vitest run tests/primitives.test.tsx`, then `npm test`. Expected: PASS. If `tests/components.test.tsx` asserts an old class or markup that changed, update the assertion, not the behaviour.

- [x] **Step 6: Commit**

```bash
git add Frontend/components/ui Frontend/styles/components.css Frontend/tests/primitives.test.tsx
git commit -m "feat(ui): restyle primitives and add PageHeader, Switch, Stepper, StatTile, Popover, SegmentedControl"
```

---

## Task 4: Chart components

**Files:**
- Create: `Frontend/components/charts/chart-card.tsx`, `use-chart-tooltip.tsx`, `funnel-chart.tsx`, `stage-mix-chart.tsx`, `trend-columns.tsx`, `score-histogram.tsx` and `index.ts`
- Create: `Frontend/styles/charts.css`. Import it in `app/globals.css` after `components.css`.
- Test: `Frontend/tests/charts.test.tsx`

**Source:** port from the prototype: `git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/charts.tsx` (logic) and the `CHARTS` section at the end of `git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/proto.css` (styles).

**Porting rules:**
- Remove the `.proto` prefix and rename classes `viz-*` → `chart-*`.
- Colours come from the `--viz-*` tokens (Task 2).
- `PHASES` moves into `lib/pipeline-phases.ts` (below), so the pipeline and the charts share it.

**Interfaces (produced):**
```ts
// lib/pipeline-phases.ts
export const PHASES: readonly { id: "received"|"shortlisted"|"interview"|"results"; label: string; stages: readonly string[] }[];
//   received: ["received","screened"]; shortlisted: ["shortlisted"]; interview: ["applied_interview","offer"]; results: ["hired","rejected","withdrawn"]
export function phaseCards(columns: PipelineColumn[], stages: readonly string[]): PipelineCard[];
export function allCards(columns: PipelineColumn[]): PipelineCard[];

// components/charts
ChartCard({ title: string; sub?: ReactNode; actions?: ReactNode; table?: ReactNode; children: ReactNode })  // header with "Table"/"Chart" toggle when table given
useChartTooltip(): { bind(value: string, label: string): HTMLAttributes & { tabIndex: 0; "aria-label": string }; node: ReactNode }
FunnelChart({ columns: PipelineColumn[] })                       // excludes rejected/withdrawn rows; one hue; counts direct-labelled
StageMixChart({ columns: PipelineColumn[]; postings: Posting[]; compact?: boolean; actions?: ReactNode })  // compact = bars only (for the context panel)
TrendColumns({ cards: PipelineCard[]; days?: number })           // applications per day (applied_at), default 14
ScoreHistogram({ cards: PipelineCard[] })                         // profile_interview_score in 0–19,20–39,40–59,60–79,80–100
```

**Requirements carried from the dataviz check** (PRD §4.2):
- Every mark is focusable and has a tooltip on hover **and** focus. Tooltip text is set through React children (never `dangerouslySetInnerHTML`).
- Every chart has a Table toggle.
- The stage-mix chart shows a legend and the count inside each segment.
- Zero-value bars render at 0% width (no minimum width).
- No dual axes.
- In compact mode, rows are `<span>`, not `<a>`, so they never nest inside the panel's links.

- [ ] **Step 1: Write the failing tests** `Frontend/tests/charts.test.tsx`

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { FunnelChart, ScoreHistogram, StageMixChart, TrendColumns } from "@/components/charts";
import type { PipelineCard, PipelineColumn, Posting } from "@/lib/types";

const card = (id: string, stage: string, posting: string, score: number | null, applied = new Date().toISOString()) => ({
  id, candidate_name: id, posting_id: posting, job_title: "Job", stage_id: stage, stage_label: stage, stage_category: "new",
  stage_position: null, stage_version: 1, profile_interview_score: score, applied_interview_status: null,
  applied_at: applied, updated_at: applied, valid_destinations: [],
}) as PipelineCard;
const columns: PipelineColumn[] = [
  { stage_id: "received", label: "Received", category: "new", cards: [card("a", "received", "p1", 71), card("b", "received", "p1", 13)] },
  { stage_id: "shortlisted", label: "Shortlisted", category: "review", cards: [] },
  { stage_id: "applied_interview", label: "AI Interview", category: "assessment", cards: [card("c", "applied_interview", "p2", 85)] },
  { stage_id: "rejected", label: "Rejected", category: "rejected", cards: [] },
];
const postings = [{ id: "p1", title: "Lecturer", status: "published" }, { id: "p2", title: "Professor", status: "published" }, { id: "p3", title: "Visiting", status: "draft" }] as Posting[];

describe("charts", () => {
  it("funnel lists stages with counts and hides rejected", () => {
    render(<FunnelChart columns={columns} />);
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Received: 2 candidates")).toBeInTheDocument();
  });
  it("funnel has a table view", () => {
    render(<FunnelChart columns={columns} />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("stage mix shows per-requisition segments and an empty draft row", () => {
    render(<StageMixChart columns={columns} postings={postings} />);
    expect(screen.getByLabelText("Lecturer · Received: 2 candidates")).toBeInTheDocument();
    expect(screen.getByText(/Draft — finish setup/)).toBeInTheDocument();
  });
  it("compact stage mix renders no links", () => {
    const { container } = render(<StageMixChart columns={columns} postings={[postings[0]]} compact />);
    expect(container.querySelector("a")).toBeNull();
  });
  it("trend counts today's applications", () => {
    render(<TrendColumns cards={columns.flatMap((c) => c.cards)} />);
    expect(screen.getByText(/3 in the last 14 days/)).toBeInTheDocument();
  });
  it("histogram buckets screening scores", () => {
    render(<ScoreHistogram cards={columns.flatMap((c) => c.cards)} />);
    expect(screen.getByText(/3 scored/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run.** `npx vitest run tests/charts.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Create `lib/pipeline-phases.ts`**

```ts
import type { PipelineCard, PipelineColumn } from "@/lib/types";

export const PHASES = [
  { id: "received", label: "Received", stages: ["received", "screened"] },
  { id: "shortlisted", label: "Shortlisted", stages: ["shortlisted"] },
  { id: "interview", label: "Interview", stages: ["applied_interview", "offer"] },
  { id: "results", label: "Results", stages: ["hired", "rejected", "withdrawn"] },
] as const;

export function allCards(columns: PipelineColumn[]): PipelineCard[] {
  return columns.flatMap((c) => c.cards);
}

export function phaseCards(columns: PipelineColumn[], stages: readonly string[]): PipelineCard[] {
  return columns.filter((c) => stages.includes(c.stage_id)).flatMap((c) => c.cards);
}
```

> If `pipeline-page.tsx` already defines an equivalent macro-phase mapping (it groups "Received / Shortlisted / Applied Interview / Results"), keep its exact stage membership. Copy it here and make the pipeline import it in Task 8, so there is a single source.

- [ ] **Step 4: Create the chart components** by porting `charts.tsx` from the prototype branch. These are the exact contents to write (adapted from the prototype):

`components/charts/use-chart-tooltip.tsx`
```tsx
"use client";
import { useState, type FocusEvent, type PointerEvent } from "react";

type Tip = { x: number; y: number; value: string; label: string } | null;

export function useChartTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (value: string, label: string) => ({
    tabIndex: 0 as const,
    "aria-label": `${label}: ${value}`,
    onPointerMove: (e: PointerEvent) => setTip({ x: e.clientX, y: e.clientY, value, label }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, value, label });
    },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <b>{tip.value}</b><span>{tip.label}</span>
    </div>
  ) : null;
  return { bind, node };
}
```

`components/charts/chart-card.tsx`
```tsx
"use client";
import { useState, type ReactNode } from "react";

export function ChartCard({ title, sub, actions, table, children }: { title: string; sub?: ReactNode; actions?: ReactNode; table?: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="chart-card" aria-label={title}>
      <header className="chart-card__head">
        <div className="chart-card__titles"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        <div className="chart-card__actions">
          {actions}
          {table && <button type="button" className="link" onClick={() => setAsTable((v) => !v)}>{asTable ? "Chart" : "Table"}</button>}
        </div>
      </header>
      {asTable ? table : children}
    </section>
  );
}

export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="table-container">
      <table className="chart-table">
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "tabular-nums" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
```

`components/charts/funnel-chart.tsx`
```tsx
"use client";
import type { PipelineColumn } from "@/lib/types";
import { allCards } from "@/lib/pipeline-phases";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

export function FunnelChart({ columns }: { columns: PipelineColumn[] }) {
  const { bind, node } = useChartTooltip();
  const rows = columns.filter((c) => !["rejected", "withdrawn"].includes(c.stage_id));
  const total = allCards(columns).length;
  const max = Math.max(1, ...rows.map((r) => r.cards.length));
  return (
    <ChartCard title="Pipeline funnel" sub={`${total} candidates · where they are now`}
      table={<ChartTable head={["Stage", "Candidates", "% of all"]} rows={rows.map((r) => [r.label, r.cards.length, total ? `${Math.round((r.cards.length / total) * 100)}%` : "0%"])} />}>
      <div className="chart-funnel">
        {rows.map((r) => (
          <div key={r.stage_id} className="chart-funnel__row">
            <span className="chart-funnel__label">{r.label}</span>
            <span className="chart-funnel__track">
              <span className="chart-funnel__bar" style={{ width: `${(r.cards.length / max) * 100}%` }} {...bind(`${r.cards.length} candidates`, r.label)} />
            </span>
            <span className="chart-funnel__value tabular-nums">{r.cards.length}</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
```

`components/charts/stage-mix-chart.tsx`
```tsx
"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PipelineColumn, Posting } from "@/lib/types";
import { PHASES } from "@/lib/pipeline-phases";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

const SLOT = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];

export function StageMixChart({ columns, postings, compact, actions }: { columns: PipelineColumn[]; postings: Posting[]; compact?: boolean; actions?: ReactNode }) {
  const { bind, node } = useChartTooltip();
  const rows = postings.map((p) => {
    const counts = PHASES.map((ph) => columns.filter((c) => ph.stages.includes(c.stage_id)).reduce((s, c) => s + c.cards.filter((x) => x.posting_id === p.id).length, 0));
    return { p, counts, total: counts.reduce((a, b) => a + b, 0) };
  });
  const bar = (p: Posting, counts: number[], total: number) => (
    <span className="chart-stack">
      {total === 0
        ? <span className="chart-stack__empty">{p.status === "draft" ? "Draft — finish setup" : "No applicants yet"}</span>
        : counts.map((n, i) => n > 0 && (
          <span key={i} className="chart-stack__seg" style={{ flexGrow: n, background: SLOT[i] }} {...bind(`${n} candidates`, `${p.title} · ${PHASES[i].label}`)}>
            {!compact && <em className="tabular-nums">{n}</em>}
          </span>
        ))}
    </span>
  );
  if (compact) return <>{rows.map(({ p, counts, total }) => <span key={p.id} className="chart-mix__row chart-mix__row--compact">{bar(p, counts, total)}</span>)}{node}</>;
  return (
    <ChartCard title="Requisitions by stage" sub="Where each job's candidates sit" actions={actions}
      table={<ChartTable head={["Requisition", ...PHASES.map((p) => p.label), "Total"]} rows={rows.map((r) => [r.p.title, ...r.counts, r.total])} />}>
      <div className="chart-legend">{PHASES.map((ph, i) => <span key={ph.id}><i style={{ background: SLOT[i] }} />{ph.label}</span>)}</div>
      <div className="chart-mix">
        {rows.map(({ p, counts, total }) => (
          <Link key={p.id} href={`/jobs/${p.id}`} className="chart-mix__row">
            <span className="chart-mix__head"><b>{p.title}</b><span className="tabular-nums">{total}</span></span>
            {bar(p, counts, total)}
          </Link>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
```

`components/charts/trend-columns.tsx`
```tsx
"use client";
import type { PipelineCard } from "@/lib/types";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

export function TrendColumns({ cards, days = 14 }: { cards: PipelineCard[]; days?: number }) {
  const { bind, node } = useChartTooltip();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i)); return { d, n: 0 }; });
  for (const c of cards) {
    const a = new Date(c.applied_at); a.setHours(0, 0, 0, 0);
    const idx = Math.round((a.getTime() - buckets[0].d.getTime()) / 86_400_000);
    if (idx >= 0 && idx < days) buckets[idx].n += 1;
  }
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const sum = buckets.reduce((s, b) => s + b.n, 0);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <ChartCard title="Applications received" sub={`${sum} in the last ${days} days`}
      table={<ChartTable head={["Day", "Applications"]} rows={buckets.map((b) => [fmt(b.d), b.n])} />}>
      <div className="chart-cols chart-cols--trend" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
        {buckets.map((b, i) => (
          <div key={i} className="chart-cols__col" {...bind(`${b.n} applications`, fmt(b.d))}>
            <span className="chart-cols__value tabular-nums">{b.n || ""}</span>
            <span className="chart-cols__bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <span className="chart-cols__label">{i === 0 || i === days - 1 || i === Math.floor(days / 2) ? fmt(b.d) : " "}</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
```

`components/charts/score-histogram.tsx`
```tsx
"use client";
import type { PipelineCard } from "@/lib/types";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

export function ScoreHistogram({ cards }: { cards: PipelineCard[] }) {
  const { bind, node } = useChartTooltip();
  const scored = cards.map((c) => c.profile_interview_score).filter((s): s is number => s !== null && s !== undefined);
  const buckets = [0, 20, 40, 60, 80].map((lo) => ({ lo, hi: lo === 80 ? 100 : lo + 19, n: scored.filter((s) => s >= lo && (lo === 80 ? s <= 100 : s < lo + 20)).length }));
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const sorted = [...scored].sort((a, b) => a - b);
  const median = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
  return (
    <ChartCard title="Screening scores" sub={scored.length ? `${scored.length} scored · median ${median}` : "No scores yet"}
      table={<ChartTable head={["Score range", "Candidates"]} rows={buckets.map((b) => [`${b.lo}–${b.hi}`, b.n])} />}>
      <div className="chart-cols" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {buckets.map((b) => (
          <div key={b.lo} className="chart-cols__col" {...bind(`${b.n} candidates`, `Score ${b.lo}–${b.hi}`)}>
            <span className="chart-cols__value tabular-nums">{b.n || ""}</span>
            <span className="chart-cols__bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <span className="chart-cols__label tabular-nums">{b.lo}+</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
```

`components/charts/index.ts`
```ts
export { ChartCard, ChartTable } from "./chart-card";
export { FunnelChart } from "./funnel-chart";
export { StageMixChart } from "./stage-mix-chart";
export { TrendColumns } from "./trend-columns";
export { ScoreHistogram } from "./score-histogram";
export { useChartTooltip } from "./use-chart-tooltip";
```

- [ ] **Step 5: Create `styles/charts.css`** and import it in `globals.css` after `components.css`.

```css
/* Charts — PRD §4.2 (palette validated: --viz-1..4, --viz-mag). */
.chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 14px; margin-bottom: 22px; }
.chart-card { min-width: 0; padding: 14px 16px 16px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
.chart-card__head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 10px; margin-bottom: 12px; }
.chart-card__titles { flex: 1 1 180px; min-width: 0; }
.chart-card__titles h2 { font-size: 13.5px; font-weight: 600; }
.chart-card__titles p { font-size: 12px; color: var(--ink-3); }
.chart-card__actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.chart-tip { position: fixed; z-index: 95; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none; display: grid; gap: 1px; padding: 6px 10px; border-radius: var(--r-md); background: var(--surface); box-shadow: var(--shadow-pop); white-space: nowrap; }
.chart-tip b { font-size: 13px; color: var(--ink); }
.chart-tip span { font-size: 11.5px; color: var(--ink-3); }
.chart-funnel { display: grid; gap: 8px; }
.chart-funnel__row { display: grid; grid-template-columns: minmax(70px, 110px) minmax(0, 1fr) 28px; gap: 10px; align-items: center; }
.chart-funnel__label { font-size: 12.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chart-funnel__track { height: 14px; border-radius: 4px; background: var(--surface-2); }
.chart-funnel__bar { display: block; height: 100%; border-radius: 0 4px 4px 0; background: var(--viz-mag); outline: none; }
.chart-funnel__bar:hover, .chart-funnel__bar:focus-visible { filter: brightness(1.15); box-shadow: var(--focus-ring); }
.chart-funnel__value { text-align: right; font-weight: 600; font-size: 12.5px; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 10px; font-size: 12px; color: var(--ink-2); }
.chart-legend i { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 2px; vertical-align: -1px; }
.chart-mix { display: grid; gap: 10px; }
.chart-mix__row { display: grid; gap: 5px; color: inherit; }
.chart-mix__row--compact { padding-top: 4px; }
.chart-mix__head { display: flex; gap: 8px; align-items: baseline; min-width: 0; font-size: 12.5px; }
.chart-mix__head b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
.chart-mix__head span { color: var(--ink-3); font-size: 12px; }
.chart-stack { display: flex; gap: 2px; height: 18px; }
.chart-mix__row--compact .chart-stack { height: 6px; }
.chart-stack__seg { display: grid; place-items: center; min-width: 18px; border-radius: 4px; outline: none; }
.chart-mix__row--compact .chart-stack__seg { min-width: 4px; border-radius: 2px; }
.chart-stack__seg:hover, .chart-stack__seg:focus-visible { filter: brightness(1.12); box-shadow: var(--focus-ring); }
.chart-stack__seg em { font-style: normal; font-size: 11px; font-weight: 650; color: #fff; text-shadow: 0 0 2px rgba(0, 0, 0, 0.35); }
.chart-stack__empty { flex: 1; display: flex; align-items: center; padding: 0 8px; border: 1px dashed var(--border-strong); border-radius: 4px; color: var(--ink-3); font-size: 11.5px; }
.chart-mix__row--compact .chart-stack__empty { padding: 0; font-size: 0; border-radius: 2px; }
.chart-cols { display: grid; gap: 6px; height: 150px; align-items: end; }
.chart-cols--trend { gap: 2px; height: 140px; }
.chart-cols__col { display: grid; grid-template-rows: auto 1fr auto; height: 100%; gap: 4px; text-align: center; outline: none; border-radius: var(--r-sm); }
.chart-cols__col:focus-visible { box-shadow: var(--focus-ring); }
.chart-cols__value { font-size: 12px; font-weight: 600; }
.chart-cols__bar { align-self: end; display: block; width: 100%; border-radius: 4px 4px 0 0; background: var(--viz-mag); }
.chart-cols__col:hover .chart-cols__bar { filter: brightness(1.15); }
.chart-cols__label { padding-top: 3px; border-top: 1px solid var(--viz-axis); font-size: 10.5px; color: var(--ink-3); white-space: nowrap; }
.chart-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.chart-table th, .chart-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--border); }
.chart-table th { font-weight: 500; color: var(--ink-3); }
```

- [ ] **Step 6: Run.** `npx vitest run tests/charts.test.tsx`, then `npm test` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add Frontend/components/charts Frontend/lib/pipeline-phases.ts Frontend/styles/charts.css Frontend/app/globals.css Frontend/tests/charts.test.tsx
git commit -m "feat(charts): add funnel, stage-mix, trend and score charts with table views"
```

---

## Task 5: CommandPalette and NotificationsPanel

**Files:**
- Create: `Frontend/components/layout/command-palette.tsx`
- Create: `Frontend/components/layout/notifications-panel.tsx`
- Modify: `Frontend/styles/layout.css` (append the palette and notification styles)
- Test: `Frontend/tests/shell-widgets.test.tsx`

**Behaviour sources:**
- The search behaviour comes from the current `components/dashboard/global-search.tsx`. Read it first and keep its debounce, minimum length, endpoint, result groups and states.
- The UI comes from `CommandPalette` and `NotificationsButton` in `git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp/shared.tsx`.

**Interfaces (produced):**
```ts
CommandPalette({ persona: "employer" | "candidate"; destinations: { label: string; href: string }[] })
  // renders the trigger button (".search-trigger", shows "Search or jump to…" + kbd "Ctrl K"/"⌘ K"; compact icon-only at ≤820px via CSS)
  // and the dialog. Global ⌘/Ctrl+K toggles, Esc closes, ↑/↓/Enter navigate.
  // Groups: "Go to" (destinations filtered by label), "Actions" (employer: Create job → /jobs?create=1; both: Toggle theme),
  //         after ≥2 chars + 220ms: GET /api/v1/search?q= → "Jobs & Requisitions" (→ /jobs/{id}) and
  //         "Candidates & Applications" (→ /pipeline?posting={posting_id}&applicationId={id}).
  // States: "Searching…", `No matches for "{q}"`.
NotificationsPanel({ persona: "employer" | "candidate" })
  // bell icon button with unread badge (aria-label "Notifications, N unread" | "Notifications"); Popover with list;
  // GET /api/v1/notifications on mount and on open; item click → router.push(item.link) (if link) and close;
  // "Mark all read" → POST /api/v1/notifications/mark-read → reload; footer link: employer "Open audit log" → /admin#audit,
  // candidate "View applications" → /candidate/applications. Empty: "You're all caught up."
```

**Toggle theme action:** reuse the logic in `components/ui/theme-toggle.tsx`. Flip `document.documentElement.dataset.theme`, store it in `localStorage["thos-theme"]`, and dispatch `window.dispatchEvent(new Event("thos-theme-change"))`. Also make `ThemeToggle` listen for that event, so its icon stays in sync.

- [ ] **Step 1: Write the failing tests** `Frontend/tests/shell-widgets.test.tsx`

```tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => "/" }));
const get = vi.fn(async (path: string) => {
  if (path.startsWith("/api/v1/search")) return { postings: [{ id: "p1", title: "Lecturer", status: "published", location: "Lahore" }], applications: [{ id: "a1", posting_id: "p1", candidate_name: "Hira Ahmed", job_title: "Lecturer", stage_id: "received" }] };
  if (path === "/api/v1/notifications") return { notifications: [{ id: "n1", title: "3 waiting", body: "Review them", link: "/pipeline", read: 0, created_at: new Date().toISOString() }], unread_count: 1 };
  return {};
});
const post = vi.fn(async () => ({}));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api: { get, post } }));

import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationsPanel } from "@/components/layout/notifications-panel";

describe("CommandPalette", () => {
  it("opens with Ctrl+K and lists destinations", () => {
    render(<CommandPalette persona="employer" destinations={[{ label: "Pipeline", href: "/pipeline" }]} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog", { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Pipeline/ })).toBeInTheDocument();
  });
  it("searches after 2 characters and links candidates to the drawer deep link", async () => {
    vi.useFakeTimers();
    render(<CommandPalette persona="employer" destinations={[]} />);
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hi" } });
    await act(async () => { vi.advanceTimersByTime(250); });
    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole("option", { name: /Hira Ahmed/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("option", { name: /Hira Ahmed/ }));
    expect(push).toHaveBeenCalledWith("/pipeline?posting=p1&applicationId=a1");
  });
});

describe("NotificationsPanel", () => {
  it("shows unread count and marks all read", async () => {
    render(<NotificationsPanel persona="employer" />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    expect(await screen.findByText("3 waiting")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/v1/notifications/mark-read"));
    expect(screen.getByRole("link", { name: "Open audit log" })).toHaveAttribute("href", "/admin#audit");
  });
});
```

- [ ] **Step 2: Run.** `npx vitest run tests/shell-widgets.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement `components/layout/command-palette.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LuCornerDownLeft, LuSearch } from "react-icons/lu";
import { api } from "@/lib/api";

type SearchResult = {
  postings: { id: string; title: string; status: string; location: string }[];
  applications: { id: string; posting_id: string; candidate_name: string; job_title: string; stage_id: string }[];
};
type Item = { group: string; label: string; hint?: string; run: () => void };

function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { window.localStorage.setItem("thos-theme", next); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("thos-theme-change"));
}

export function CommandPalette({ persona, destinations }: { persona: "employer" | "candidate"; destinations: { label: string; href: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  const close = useCallback(() => { setOpen(false); setQ(""); setResults(null); trigger.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get<SearchResult>(`/api/v1/search?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults({ postings: [], applications: [] }))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const go = (href: string) => () => { router.push(href); close(); };
    const list: Item[] = destinations.filter((d) => match(d.label)).map((d) => ({ group: "Go to", label: d.label, run: go(d.href) }));
    const actions: Item[] = [
      ...(persona === "employer" ? [{ group: "Actions", label: "Create job", run: go("/jobs?create=1") }] : []),
      { group: "Actions", label: "Toggle theme", run: () => { toggleTheme(); close(); } },
    ];
    list.push(...actions.filter((a) => match(a.label)));
    for (const p of results?.postings ?? []) list.push({ group: "Jobs & Requisitions", label: p.title, hint: p.location, run: go(`/jobs/${p.id}`) });
    for (const a of results?.applications ?? [])
      list.push({ group: "Candidates & Applications", label: a.candidate_name, hint: a.job_title, run: go(`/pipeline?posting=${encodeURIComponent(a.posting_id)}&applicationId=${encodeURIComponent(a.id)}`) });
    return list;
  }, [q, results, destinations, persona, router, close]);

  useEffect(() => { setActive(0); }, [items.length]);

  return (
    <>
      <button ref={trigger} type="button" className="search-trigger" onClick={() => setOpen(true)} aria-label="Search or jump to">
        <LuSearch size={15} aria-hidden="true" />
        <span className="search-trigger__text">Search or jump to…</span>
        <kbd className="search-trigger__kbd">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
      </button>
      {open && (
        <div className="palette-scrim" onMouseDown={close}>
          <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
            <div className="palette__input">
              <LuSearch size={16} aria-hidden="true" />
              <input autoFocus role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="Search candidates, jobs, applications"
                value={q} placeholder="Search candidates, jobs, applications…" onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); close(); }
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
                }} />
              <kbd>Esc</kbd>
            </div>
            <ul id="palette-list" className="palette__list" role="listbox" aria-label="Results">
              {searching && <li className="palette__state" role="presentation">Searching…</li>}
              {!searching && q.trim().length >= 2 && items.length === 0 && <li className="palette__state" role="presentation">No matches for &ldquo;{q.trim()}&rdquo;</li>}
              {items.map((it, i) => (
                <li key={`${it.group}-${it.label}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined}
                  onMouseEnter={() => setActive(i)} onClick={() => it.run()}>
                  <span className="palette__group">{it.group}</span>
                  <span className="palette__label">{it.label}{it.hint && <small> · {it.hint}</small>}</span>
                  {i === active && <LuCornerDownLeft size={14} aria-hidden="true" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Implement `components/layout/notifications-panel.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuBell } from "react-icons/lu";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { Popover } from "@/components/ui/popover";

function relTime(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export function NotificationsPanel({ persona }: { persona: "employer" | "candidate" }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => {
    api.get<{ notifications: Notification[]; unread_count: number }>("/api/v1/notifications")
      .then((b) => { setItems(b.notifications); setUnread(b.unread_count); })
      .catch(() => { setItems([]); setUnread(0); });
  }, []);
  useEffect(load, [load]);
  const markAll = async () => { await api.post("/api/v1/notifications/mark-read").catch(() => undefined); load(); };

  return (
    <Popover label="Notifications" className="notes"
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} type="button" className="icon-button" aria-expanded={open} onClick={() => { if (!open) load(); toggle(); }}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications">
          <LuBell size={16} aria-hidden="true" />
          {unread > 0 && <span className="badge-dot tabular-nums" aria-hidden="true">{unread}</span>}
        </button>
      )}>
      {(close) => (
        <>
          <header className="notes__head"><b>Notifications</b><button type="button" className="link" onClick={markAll}>Mark all read</button></header>
          <div className="notes__list">
            {items.length === 0 && <p className="notes__empty">You&apos;re all caught up.</p>}
            {items.map((n) => (
              <button key={n.id} type="button" className={`notes__item ${n.read ? "" : "is-unread"}`}
                onClick={() => { close(); if (n.link) router.push(n.link); }}>
                <span className="notes__dot" aria-hidden="true" />
                <span className="notes__text"><b>{n.title}</b><small>{n.body}</small></span>
                <time className="notes__time" dateTime={n.created_at}>{relTime(n.created_at)}</time>
              </button>
            ))}
          </div>
          <footer className="notes__foot">
            {persona === "employer"
              ? <Link className="link" href="/admin#audit" onClick={close}>Open audit log</Link>
              : <Link className="link" href="/candidate/applications" onClick={close}>View applications</Link>}
          </footer>
        </>
      )}
    </Popover>
  );
}
```

> If `api.post` requires a body argument in `lib/api.ts`, call `api.post("/api/v1/notifications/mark-read", {})`, and update the test expectation to match. `post` with no body sends `{}` today.

- [ ] **Step 5: Append the styles** to `styles/layout.css`

```css
/* Command palette */
.search-trigger { display: inline-flex; align-items: center; gap: 8px; height: 32px; width: min(320px, 100%); min-width: 0; padding: 0 8px 0 10px; border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface-2); color: var(--ink-3); cursor: pointer; }
.search-trigger__text { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-trigger kbd, .palette kbd { font-family: var(--font-mono); font-size: 10.5px; padding: 1px 5px; border: 1px solid var(--border-strong); border-radius: 4px; color: var(--ink-3); background: var(--surface); }
.palette-scrim { position: fixed; inset: 0; z-index: 80; display: grid; justify-items: center; align-items: start; padding: 12vh 16px 16px; background: var(--scrim); }
.palette { width: min(600px, 100%); overflow: hidden; border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--shadow-pop); animation: d-rise 140ms ease-out; }
.palette__input { display: flex; align-items: center; gap: 10px; padding: 0 14px; border-bottom: 1px solid var(--border); color: var(--ink-3); }
.palette__input input { flex: 1; min-width: 0; height: 48px; border: 0; outline: 0; background: none; color: var(--ink); font-size: 15px; }
.palette__list { list-style: none; margin: 0; padding: 6px; max-height: min(400px, 55dvh); overflow-y: auto; }
.palette__list li[role="option"] { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--r-md); cursor: pointer; }
.palette__list li.is-active { background: var(--surface-3); }
.palette__group { width: 120px; flex: none; color: var(--ink-3); font-size: 11.5px; }
.palette__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette__label small { color: var(--ink-3); }
.palette__state { padding: 12px 10px; color: var(--ink-3); }
@media (max-width: 820px) {
  .search-trigger { width: 32px; padding: 0; justify-content: center; }
  .search-trigger__text, .search-trigger__kbd { display: none; }
  .palette__group { width: 84px; }
}

/* Notifications */
.badge-dot { position: absolute; top: 3px; right: 3px; min-width: 15px; height: 15px; padding: 0 3px; border-radius: 99px; background: var(--red); color: #fff; font-size: 9.5px; font-weight: 700; line-height: 15px; text-align: center; }
.notes { width: min(360px, calc(100vw - 24px)); }
.notes__head, .notes__foot { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; }
.notes__head { border-bottom: 1px solid var(--border); }
.notes__foot { border-top: 1px solid var(--border); }
.notes__list { max-height: min(420px, 60dvh); overflow-y: auto; }
.notes__empty { padding: 16px 14px; color: var(--ink-3); }
.notes__item { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; gap: 10px; width: 100%; padding: 10px 14px; border: 0; background: none; text-align: left; cursor: pointer; }
.notes__item:hover, .notes__item:focus-visible { background: var(--surface-2); }
.notes__dot { width: 7px; height: 7px; margin-top: 6px; border-radius: 99px; }
.notes__item.is-unread .notes__dot { background: var(--brand); }
.notes__text { display: grid; gap: 2px; min-width: 0; }
.notes__text small, .notes__time { color: var(--ink-3); font-size: 12px; }
```

- [ ] **Step 6: Sync ThemeToggle.** In `components/ui/theme-toggle.tsx`, add an effect that listens for `thos-theme-change` and re-reads `document.documentElement.dataset.theme` into state. Remove the listener on unmount.

- [ ] **Step 7: Run.** `npx vitest run tests/shell-widgets.test.tsx`, then `npm test` and `npm run typecheck`. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add Frontend/components/layout/command-palette.tsx Frontend/components/layout/notifications-panel.tsx Frontend/components/ui/theme-toggle.tsx Frontend/styles/layout.css Frontend/tests/shell-widgets.test.tsx
git commit -m "feat(shell): add command palette (search + jump) and notifications panel"
```

---

## Task 6: Shells (rail, topbar, bottom tabs, requisitions panel, focus layout)

**Files:**
- Rewrite: `Frontend/components/layout/app-shell.tsx`
- Create: `Frontend/components/layout/requisitions-panel.tsx`
- Create: `Frontend/components/layout/focus-layout.tsx`
- Modify: `Frontend/components/dashboard/dashboard-shell.tsx` (nav config)
- Modify: `Frontend/components/candidate/candidate-shell.tsx` (nav config)
- Modify: `Frontend/styles/layout.css`. Replace the old shell rules (`.app-shell`, `.sidebar*`, `.workspace`, `.topbar*`, `.mobile-nav`, `.mobile-menu`, `.mobile-wordmark`, `.tenant-switcher*`, `.wordmark*`) with the block in Step 4. Keep `.dashboard`, `.candidate-main` and `.content`, but restyle them as in Step 4.
- Modify: `Frontend/next.config.ts` (dev indicator position)
- Test: `Frontend/tests/app-shell.test.tsx`
- E2E: `Frontend/e2e/parity/shell.spec.ts`

**Interfaces:**
- Consumes: `CommandPalette` and `NotificationsPanel` (Task 5), `StageMixChart compact` (Task 4), `PackChip` and `ThemeToggle` (existing).
- Produces:
```ts
type NavItem = { label: string; href: string; icon: ReactNode; mobile?: boolean /* show in bottom tabs */ };
AppShell({ persona: "employer" | "candidate"; nav: NavItem[]; manageNav?: NavItem[]; topbarAction?: ReactNode; children: ReactNode })
RequisitionsPanel()        // self-fetching; employer only; used by AppShell on "/" and "/pipeline"
FocusLayout({ title: ReactNode; steps?: ReactNode; right?: ReactNode; exitHref?: string; exitLabel?: string; children: ReactNode; full?: boolean })
```

**Behaviour (PRD §5):**
- **Rail (desktop >820px):**
  - Mark → `/` or `/candidate`, then the nav icons, each with `aria-label`, a tooltip and `aria-current="page"` when active.
  - Employer rail: Workspace items, then a divider, then Manage items.
  - Bottom of the rail: `ThemeToggle`, Sign out (`logout()` then `router.replace("/login")`), and an avatar with initials (title = name · role).
- **Requisitions panel:** employer only, when `pathname === "/" || pathname.startsWith("/pipeline")`. Visibility is remembered in `localStorage["thos.panel"]` (`"1"` or `"0"`, default `"1"`). Hidden by CSS at ≤1180px.
- **Topbar:**
  - Panel toggle (only when the panel applies), then the page title (derived from the active nav label), then `CommandPalette`, `NotificationsPanel`, `PackChip` (hidden ≤600px) and `topbarAction`.
  - Candidate topbar also gets a Messages icon link at ≤820px.
- **Bottom tabs (≤820px):**
  - Shows the items with `mobile: true`, plus a **More** button that opens a sheet with every other item, theme and sign out.
  - Each tab is at least 44px tall, and has an icon plus a label.
- **Kept:** the skip link `Skip to main content` → `#main-content`; `<main id="main-content" tabIndex={-1}>`; the mount APIs (org name, active pack for employers, catalog pack for candidates) and their fallbacks.
- **Not kept:** the unread count is no longer fetched by the shell. `NotificationsPanel` owns it.

- [ ] **Step 1: Write the failing unit test** `Frontend/tests/app-shell.test.tsx`

```tsx
import { render, screen, within } from "@testing-library/react";
import { vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async (p: string) => (p.includes("organizations/current/domain-packs") ? { activation: { display_name: "Education Pack" } } : p.includes("organizations/current") ? { organization: { name: "NUT" } } : p.includes("postings") ? { postings: [] } : p.includes("pipeline") ? { columns: [] } : { notifications: [], unread_count: 0 })), post: vi.fn() },
  logout: vi.fn(),
}));

import { DashboardShell } from "@/components/dashboard/dashboard-shell";

describe("employer shell", () => {
  it("renders rail nav with Interviews and without Register organization", () => {
    render(<DashboardShell><p>content</p></DashboardShell>);
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).getByRole("link", { name: "Interviews" })).toHaveAttribute("href", "/interviews/faculty-panel");
    expect(within(nav).queryByRole("link", { name: /Register organization/ })).toBeNull();
    expect(within(nav).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
  });
  it("shows the requisitions panel only on Home and Pipeline", () => {
    pathname = "/";
    const { unmount } = render(<DashboardShell><p>x</p></DashboardShell>);
    expect(screen.getByRole("complementary", { name: "Requisitions" })).toBeInTheDocument();
    unmount();
    pathname = "/admin";
    render(<DashboardShell><p>x</p></DashboardShell>);
    expect(screen.queryByRole("complementary", { name: "Requisitions" })).toBeNull();
  });
  it("keeps the skip link and main landmark", () => {
    render(<DashboardShell><p>x</p></DashboardShell>);
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    expect(document.getElementById("main-content")).not.toBeNull();
  });
});
```

> `DashboardShell` wraps `RequireAuth`, which redirects when there is no token. In the test, set `window.localStorage.setItem("thos.access_token","t")` and `thos.session` to `{"has_employer_membership":true,"user":{"display_name":"Ayesha Khan"},"memberships":[{"role":"administrator"}]}` in a `beforeEach`.

- [ ] **Step 2: Run.** `npx vitest run tests/app-shell.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`components/layout/app-shell.tsx`, a full replacement. Keep the `export type NavItem` name.

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LuEllipsis, LuLogOut, LuMail, LuPanelLeft, LuX } from "react-icons/lu";
import { PackChip } from "@/components/ui/pack-chip";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { RequisitionsPanel } from "@/components/layout/requisitions-panel";
import { api, logout } from "@/lib/api";
import { currentSession, type AuthSession } from "@/lib/auth";

export type NavItem = { label: string; href: string; icon: ReactNode; mobile?: boolean };

export type AppShellProps = {
  persona: "employer" | "candidate";
  nav: NavItem[];
  manageNav?: NavItem[];
  topbarAction?: ReactNode;
  children: ReactNode;
};

function isActive(pathname: string, href: string) {
  return href === "/" || href === "/candidate" ? pathname === href : pathname.startsWith(href.split("?")[0].split("#")[0]);
}

export function AppShell({ persona, nav, manageNav = [], topbarAction, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [packName, setPackName] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const allNav = [...nav, ...manageNav];
  const panelApplies = persona === "employer" && (pathname === "/" || pathname.startsWith("/pipeline"));
  const title = allNav.find((n) => isActive(pathname, n.href))?.label ?? "THOS";

  useEffect(() => {
    const s = currentSession();
    setSession(s);
    try { setPanelOpen(window.localStorage.getItem("thos.panel") !== "0"); } catch { /* ignore */ }
    if (persona === "employer") {
      api.get<{ organization: { name: string } }>("/api/v1/organizations/current")
        .then((b) => setOrgName(b.organization.name)).catch(() => setOrgName("Hiring Organization"));
      api.get<{ activation: { display_name: string } | null }>("/api/v1/organizations/current/domain-packs/active")
        .then((b) => setPackName(b.activation?.display_name ?? null)).catch(() => setPackName(null));
    } else {
      setOrgName(s?.user.display_name ?? "Candidate Portal");
      api.get<{ packs: { display_name: string }[] }>("/api/v1/packs/catalog")
        .then((b) => setPackName(b.packs[0]?.display_name ?? "Verified Skills")).catch(() => setPackName("Verified Skills"));
    }
  }, [persona]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const togglePanel = () => setPanelOpen((v) => { try { window.localStorage.setItem("thos.panel", v ? "0" : "1"); } catch { /* ignore */ } return !v; });
  const signOut = async () => { await logout(); router.replace("/login"); };
  const name = session?.user.display_name ?? "";
  const role = persona === "employer" ? session?.memberships[0]?.role?.replace(/_/g, " ") ?? "Recruiter" : "Verified Candidate";
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "TH";
  const link = (item: NavItem, variant: "rail" | "tab" | "sheet") => {
    const active = isActive(pathname, item.href);
    return (
      <Link key={`${variant}-${item.href}`} href={item.href} className={`nav-${variant}__item${active ? " is-active" : ""}`}
        aria-label={variant === "rail" ? item.label : undefined} aria-current={active ? "page" : undefined} title={variant === "rail" ? item.label : undefined}>
        <span className="nav-icon" aria-hidden="true">{item.icon}</span>
        {variant === "rail" ? <span className="rail-tip" aria-hidden="true">{item.label}</span> : <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className={`shell${panelApplies && panelOpen ? " shell--panel" : ""}`} data-persona={persona}>
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <nav className="rail" aria-label="Primary">
        <Link className="rail__mark" href={persona === "employer" ? "/" : "/candidate"} aria-label="THOS home">T</Link>
        {nav.map((n) => link(n, "rail"))}
        {manageNav.length > 0 && <span className="rail__divider" aria-hidden="true" />}
        {manageNav.map((n) => link(n, "rail"))}
        <div className="rail__end">
          <ThemeToggle />
          <button type="button" className="icon-button" aria-label="Sign out" title="Sign out of THOS" onClick={signOut}><LuLogOut size={16} aria-hidden="true" /></button>
          <span className="avatar" title={`${name} · ${role}`} aria-label={`${name}, ${role}`} role="img">{initials}</span>
        </div>
      </nav>

      {panelApplies && panelOpen && <RequisitionsPanel orgName={orgName} />}

      <div className="shell__main">
        <header className="topbar">
          {panelApplies && (
            <button type="button" className="icon-button topbar__panel-toggle" aria-pressed={panelOpen} aria-label="Toggle requisitions panel" onClick={togglePanel}>
              <LuPanelLeft size={16} aria-hidden="true" />
            </button>
          )}
          <span className="topbar__title">{title}</span>
          <div className="topbar__actions">
            <CommandPalette persona={persona} destinations={allNav.map((n) => ({ label: n.label, href: n.href }))} />
            {persona === "candidate" && <Link className="icon-button topbar__mobile-only" href="/candidate/messages" aria-label="Messages"><LuMail size={16} aria-hidden="true" /></Link>}
            <NotificationsPanel persona={persona} />
            {packName && <span className="topbar__pack"><PackChip name={packName} /></span>}
            {topbarAction}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="shell__content">{children}</main>
      </div>

      <nav className="nav-tab" aria-label="Primary (mobile)">
        {allNav.filter((n) => n.mobile).map((n) => link(n, "tab"))}
        <button type="button" className="nav-tab__item" aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen(true)}>
          <span className="nav-icon" aria-hidden="true"><LuEllipsis size={19} /></span><span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-scrim" onClick={() => setMoreOpen(false)}>
          <div id="more-sheet" className="sheet" role="dialog" aria-modal="true" aria-label="More navigation" onClick={(e) => e.stopPropagation()}>
            <header className="sheet__head"><b>{orgName || "THOS"}</b><button type="button" className="icon-button" aria-label="Close" onClick={() => setMoreOpen(false)}><LuX size={16} /></button></header>
            <div className="sheet__list">{allNav.filter((n) => !n.mobile).map((n) => link(n, "sheet"))}</div>
            <footer className="sheet__foot"><span>{name}</span><ThemeToggle /><button type="button" className="button button--secondary button--sm" onClick={signOut}><LuLogOut size={14} aria-hidden="true" /> Sign out</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
```

`components/layout/requisitions-panel.tsx`
```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LuPlus } from "react-icons/lu";
import { useApi } from "@/lib/use-api";
import type { PipelineColumn, Posting } from "@/lib/types";
import { StageMixChart } from "@/components/charts";

export function RequisitionsPanel({ orgName }: { orgName: string }) {
  const params = useSearchParams();
  const current = params.get("posting");
  const postings = useApi<{ postings: Posting[] }>("/api/v1/postings");
  const pipeline = useApi<{ columns: PipelineColumn[] }>("/api/v1/pipeline");
  const columns = pipeline.data?.columns ?? [];
  const count = (id: string) => columns.reduce((s, c) => s + c.cards.filter((x) => x.posting_id === id).length, 0);
  const total = columns.reduce((s, c) => s + c.cards.length, 0);
  return (
    <aside className="req-panel" aria-label="Requisitions">
      <h2 className="req-panel__org">{orgName}</h2>
      <Link href="/pipeline" className={`req-panel__item${!current ? " is-active" : ""}`}><b>All requisitions</b><span className="tabular-nums">{total}</span></Link>
      {postings.loading && <p className="req-panel__state">Loading…</p>}
      {postings.error && <p className="req-panel__state">Couldn&apos;t load requisitions.</p>}
      {(postings.data?.postings ?? []).map((p) => (
        <Link key={p.id} href={`/pipeline?posting=${encodeURIComponent(p.id)}`} className={`req-panel__item${current === p.id ? " is-active" : ""}`}>
          <b>{p.title}</b><span className="tabular-nums">{count(p.id)}</span>
          <small>{p.status === "draft" ? "Draft · finish setup" : p.location}</small>
          <span className="req-panel__bar"><StageMixChart columns={columns} postings={[p]} compact /></span>
        </Link>
      ))}
      <Link href="/jobs?create=1" className="req-panel__new"><LuPlus size={13} aria-hidden="true" /> New requisition</Link>
    </aside>
  );
}
```

> `useSearchParams` requires a Suspense boundary for static rendering. If `npm run build` complains, wrap `<RequisitionsPanel>` in `<Suspense fallback={null}>` inside `AppShell`.

`components/layout/focus-layout.tsx`
```tsx
import Link from "next/link";
import type { ReactNode } from "react";

export function FocusLayout({ title, steps, right, exitHref, exitLabel = "Exit", children, full }: {
  title: ReactNode; steps?: ReactNode; right?: ReactNode; exitHref?: string; exitLabel?: string; children: ReactNode; full?: boolean;
}) {
  return (
    <div className="focus">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="focus__head">
        <span className="focus__mark" aria-hidden="true">T</span>
        <b className="focus__title">{title}</b>
        {steps}
        <span className="focus__spacer" />
        {right}
        {exitHref && <Link className="button button--ghost button--sm" href={exitHref}>{exitLabel}</Link>}
      </header>
      <main id="main-content" tabIndex={-1} className={full ? "focus__main focus__main--full" : "focus__main"}>{children}</main>
    </div>
  );
}
```

`components/dashboard/dashboard-shell.tsx` (keep `RequireAuth employerOnly` and the "Create job" action, now labelled "New job")
```tsx
const nav: NavItem[] = [
  { label: "Home", href: "/", icon: <LuHouse size={18} />, mobile: true },
  { label: "Jobs", href: "/jobs", icon: <LuBriefcase size={18} />, mobile: true },
  { label: "Pipeline", href: "/pipeline", icon: <LuGitFork size={18} />, mobile: true },
  { label: "Talent", href: "/talent", icon: <LuUsers size={18} /> },
  { label: "Messages", href: "/messages", icon: <LuMail size={18} />, mobile: true },
  { label: "Analytics", href: "/analytics", icon: <LuTrendingUp size={18} /> },
  { label: "Interviews", href: "/interviews/faculty-panel", icon: <LuVideo size={18} /> },
];
const manageNav: NavItem[] = [
  { label: "Automations", href: "/automations", icon: <LuSparkles size={18} /> },
  { label: "Administration", href: "/admin", icon: <LuSettings size={18} /> },
];
// <AppShell persona="employer" nav={nav} manageNav={manageNav}
//   topbarAction={<Link className="button button--primary button--sm" href="/jobs?create=1"><LuPlus size={14} aria-hidden="true" /><span className="hide-sm">New job</span></Link>}>
```

`components/candidate/candidate-shell.tsx`
```tsx
const nav: NavItem[] = [
  { label: "Home", href: "/candidate", icon: <LuHouse size={18} />, mobile: true },
  { label: "Jobs", href: "/candidate/jobs", icon: <LuBriefcase size={18} />, mobile: true },
  { label: "Applications", href: "/candidate/applications", icon: <LuFileText size={18} />, mobile: true },
  { label: "Messages", href: "/candidate/messages", icon: <LuMail size={18} /> },
  { label: "Screening", href: "/candidate/interview", icon: <LuMic size={18} />, mobile: true },
  { label: "Profile", href: "/candidate/profile", icon: <LuUser size={18} />, mobile: true },
];
// topbarAction={<Link className="button button--secondary button--sm" href="/candidate/jobs"><LuSearch size={14} aria-hidden="true" /><span className="hide-sm">Browse jobs</span></Link>}
```

> With 5 `mobile` candidate items plus More, the candidate bar has 6 slots. That is acceptable. If labels collide at 390px, set `mobile: false` on Profile; it stays reachable through More.

- [ ] **Step 4: Replace the shell CSS in `styles/layout.css`.** Delete the old shell rules (listed under **Files**) and add:

```css
/* ===== Shell (PRD §5) ===== */
.skip-link { position: absolute; left: 8px; top: -60px; z-index: 100; padding: 8px 12px; border-radius: var(--r-md); background: var(--ink); color: var(--bg); }
.skip-link:focus { top: 8px; }
.shell { display: grid; grid-template-columns: var(--rail-w) minmax(0, 1fr); min-height: 100dvh; }
.shell--panel { grid-template-columns: var(--rail-w) var(--panel-w) minmax(0, 1fr); }
.rail { position: sticky; top: 0; height: 100dvh; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--surface); scrollbar-width: none; }
.rail__mark { display: grid; place-items: center; width: 32px; height: 32px; margin-bottom: 8px; border-radius: 9px; background: var(--brand); color: var(--brand-ink); font-weight: 750; }
.nav-rail__item { position: relative; display: grid; place-items: center; width: 40px; height: 40px; flex: none; border-radius: 10px; color: var(--ink-3); }
.nav-rail__item:hover { background: var(--surface-3); color: var(--ink); }
.nav-rail__item.is-active { background: var(--brand-soft); color: var(--brand); }
.rail-tip { position: absolute; left: 48px; z-index: 5; padding: 3px 8px; border-radius: 6px; background: var(--ink); color: var(--bg); font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 120ms; }
.nav-rail__item:hover .rail-tip, .nav-rail__item:focus-visible .rail-tip { opacity: 1; }
.rail__divider { width: 24px; height: 1px; margin: 6px 0; background: var(--border); }
.rail__end { margin-top: auto; display: grid; justify-items: center; gap: 6px; padding-top: 8px; }
.req-panel { position: sticky; top: 0; height: 100dvh; overflow-y: auto; padding: 14px 10px; border-right: 1px solid var(--border); background: var(--bg); }
.req-panel__org { padding: 0 8px 10px; font-size: 13px; font-weight: 650; }
.req-panel__item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; padding: 8px; border-radius: var(--r-md); color: var(--ink); }
.req-panel__item b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; font-size: 13px; }
.req-panel__item span { color: var(--ink-3); }
.req-panel__item small { grid-column: 1 / -1; color: var(--ink-3); font-size: 12px; }
.req-panel__bar { grid-column: 1 / -1; display: block; }
.req-panel__item:hover { background: var(--surface-3); }
.req-panel__item.is-active { background: var(--surface); box-shadow: var(--shadow-1), inset 0 0 0 1px var(--border); }
.req-panel__new { display: flex; align-items: center; gap: 6px; padding: 8px; color: var(--brand); font-weight: 500; }
.req-panel__state { padding: 8px; color: var(--ink-3); font-size: 12.5px; }
.shell__main { min-width: 0; display: flex; flex-direction: column; }
.topbar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 10px; height: var(--topbar-h); padding: 0 20px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 90%, transparent); backdrop-filter: blur(8px); }
.topbar__title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.topbar__actions { display: flex; align-items: center; gap: 8px; min-width: 0; }
.topbar__mobile-only { display: none; }
.shell__content { flex: 1; min-width: 0; display: flex; flex-direction: column; outline: none; }
.dashboard, .candidate-main, .content { width: 100%; max-width: 1400px; padding: 20px 24px 48px; }
.shell[data-persona="candidate"] .dashboard, .shell[data-persona="candidate"] .candidate-main { max-width: 1120px; font-size: 14px; }
.nav-tab { display: none; }
.sheet-scrim { position: fixed; inset: 0; z-index: 75; display: flex; align-items: flex-end; background: var(--scrim); }
.sheet { width: 100%; max-height: 80dvh; overflow-y: auto; padding-bottom: env(safe-area-inset-bottom); border-radius: 16px 16px 0 0; background: var(--surface); animation: d-rise 160ms ease-out; }
.sheet__head, .sheet__foot { display: flex; align-items: center; gap: 10px; padding: 14px 16px; }
.sheet__head { justify-content: space-between; border-bottom: 1px solid var(--border); }
.sheet__foot { border-top: 1px solid var(--border); }
.sheet__foot span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sheet__list { display: grid; padding: 8px; }
.nav-sheet__item { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: var(--r-md); color: var(--ink-2); font-weight: 500; }
.nav-sheet__item.is-active { background: var(--brand-soft); color: var(--brand); }
.focus { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.focus__head { position: sticky; top: 0; z-index: 30; display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px; min-height: 56px; padding: 8px 20px; border-bottom: 1px solid var(--border); background: var(--surface); }
.focus__mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--brand); color: var(--brand-ink); font-weight: 750; }
.focus__title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.focus__spacer { flex: 1; }
.focus__main { flex: 1; display: grid; place-items: center; padding: 24px 16px 48px; outline: none; }
.focus__main--full { place-items: stretch; padding: 0; }

@media (max-width: 1180px) {
  .shell--panel { grid-template-columns: var(--rail-w) minmax(0, 1fr); }
  .req-panel, .topbar__panel-toggle { display: none; }
}
@media (max-width: 820px) {
  .shell, .shell--panel { grid-template-columns: minmax(0, 1fr); }
  .rail { display: none; }
  .topbar { padding: 0 12px; gap: 6px; }
  .topbar__mobile-only { display: inline-grid; }
  .hide-sm { display: none; }
  .dashboard, .candidate-main, .content { padding: 16px 16px calc(var(--tabbar-h) + 32px); }
  .nav-tab { position: fixed; left: 0; right: 0; bottom: 0; z-index: 35; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); height: calc(var(--tabbar-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); border-top: 1px solid var(--border); background: var(--surface); }
  .nav-tab__item { display: grid; justify-items: center; align-content: center; gap: 2px; min-height: 44px; border: 0; background: none; color: var(--ink-3); font-size: 10.5px; cursor: pointer; }
  .nav-tab__item.is-active { color: var(--brand); }
  .toast-container { bottom: calc(var(--tabbar-h) + 16px); }
}
@media (max-width: 600px) { .topbar__pack { display: none; } }
```

Also delete the temporary `.sidebar` colour rule added in Task 2, Step 7.

- [ ] **Step 5: Dev indicator.** In `next.config.ts`, set `const nextConfig: NextConfig = { reactStrictMode: true, devIndicators: { position: "bottom-left" } };`. If the installed Next version rejects `position`, use `devIndicators: { buildActivityPosition: "bottom-left" }`, or `false`.

- [ ] **Step 6: Delete GlobalSearch usage.** `AppShell` no longer imports `components/dashboard/global-search.tsx`. Leave the file in place; Task 17 deletes it.

- [ ] **Step 7: Run.** `npx vitest run tests/app-shell.test.tsx`, then `npm test`, `npm run typecheck` and `npm run build`. Expected: PASS. Fix any page that imported `AppShell` props by the old names (`primaryNav` / `secondaryNav`). Only the two shells should use them.

- [ ] **Step 8: E2E shell parity.** Create `Frontend/e2e/parity/shell.spec.ts`:

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("employer rail, palette, notifications, sign-out", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary" });
  for (const name of ["Home", "Jobs", "Pipeline", "Talent", "Messages", "Analytics", "Interviews", "Automations", "Administration"])
    await expect(rail.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Requisitions" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("link", { name: "Open audit log" })).toHaveAttribute("href", "/admin#audit");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("mobile bottom tabs and More sheet", async ({ page }, testInfo) => {
  onlyProject(testInfo, "w390");
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Primary (mobile)" });
  await expect(tabs.getByRole("link", { name: "Pipeline" })).toBeVisible();
  await tabs.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "More navigation" }).getByRole("link", { name: "Administration" })).toBeVisible();
});

test("candidate shell", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate");
  const rail = page.getByRole("navigation", { name: "Primary" });
  for (const name of ["Home", "Jobs", "Applications", "Messages", "Screening", "Profile"]) await expect(rail.getByRole("link", { name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse jobs" })).toBeVisible();
});
```

Run: `cd Frontend && npx playwright test e2e/parity/shell.spec.ts`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add Frontend/components/layout Frontend/components/dashboard/dashboard-shell.tsx Frontend/components/candidate/candidate-shell.tsx Frontend/styles/layout.css Frontend/next.config.ts Frontend/tests/app-shell.test.tsx Frontend/e2e/parity/shell.spec.ts
git commit -m "feat(shell): icon rail, requisitions panel, bottom tabs, focus layout"
```

---

## How to do each screen task (Tasks 7–16)

Every screen task follows the same loop. Each task below gives the screen-specific content.

1. **Read** the screen's section in `feature-inventory.md` and in PRD §6, and look at the matching prototype screenshot (`assets/proto/D_*` or `assets/proto/cand_*`).
2. **Write the parity spec** given in the task (`e2e/parity/<screen>.spec.ts`). Run it on the **current** code (`npx playwright test e2e/parity/<screen>.spec.ts`).
   - Asserts that use new labels will fail. Asserts on unchanged behaviour should pass.
   - Note which assertions fail, as the expected red.
3. **Restyle** the component:
   - Replace the page heading block (Breadcrumbs, eyebrow, H1 and paragraph) with `<PageHeader …/>`.
   - Replace `style={{…}}` with classes. Put the screen's CSS in `styles/screens/<screen>.css` and import it from `app/globals.css`.
   - Swap ad-hoc toggles to `Switch` or `SegmentedControl`, ad-hoc tabs to `Tabs`, and ad-hoc dialogs to `Modal`.
   - Keep all logic as it is (§0.4 rule 2).
4. **Fix** the PRD §8 defects that belong to this screen (each task lists them).
5. **Verify:**
   - `npm run typecheck`, `npm test`, the parity spec, then `npx playwright test e2e/layout.spec.ts --grep "<route names>"` (all 5 viewports, both themes) until green.
   - Then eyeball one `npm run e2e:capture -- --grep "<route>"` screenshot at w1366 and w390 against the prototype screenshot.
6. **Commit:** `feat(ui): restyle <screen>`.

Create `Frontend/styles/screens/` and add each file to `globals.css` after `charts.css` as you go. The order is employer, candidate, focus, auth.

---

## Task 7: Employer Home ("Today")

**Files:**
- Rewrite the JSX of `Frontend/components/dashboard/employer-dashboard.tsx`. Keep its data fetching: the four `useApi`/`api.get` calls for `/api/v1/analytics/pipeline`, `/api/v1/postings`, `/api/v1/pipeline` and `/api/v1/notifications`.
- Create: `Frontend/styles/screens/home.css`
- Modify: `Frontend/tests/dashboard.test.tsx` (new headings)
- E2E: `Frontend/e2e/parity/home.spec.ts`

**Layout (PRD §6.1 Home):**
1. `<PageHeader title="Today" meta={<date: weekday, month day>} />`
2. `<div className="stat-grid">` with 5 `StatTile`s:
   - In flight: `analytics.in_flight`
   - New: count of cards whose `stage_category === "new"`
   - To score: cards with `applied_interview_status === "evaluated"`
   - Hired: `analytics.hired`
   - Live jobs: `analytics.published_postings`

   Any missing value renders `"—"`. Never a made-up number.
3. `<div className="chart-grid">` containing:
   - `FunnelChart`
   - `StageMixChart`, with `actions` holding `<Link className="link" href="/jobs">View all jobs</Link>` and `<Link className="button button--primary button--sm" href="/jobs?create=1">New requisition</Link>`
   - `TrendColumns cards={allCards}`
   - `ScoreHistogram cards={allCards}`
4. `<div className="agenda">`, three columns:
   - **Now:**
     - Task card "N new applications" (sub "Screen and decide who moves on", avatars of up to 4, button "Review" → `/pipeline`).
     - Task card "N interviews to score" (button "Score" → `/pipeline`).
   - **Today:**
     - One card per draft posting: "Finish “{title}”" (→ `/jobs/{id}`, button "Set up").
     - Card "Live interview room" (→ `/interviews/faculty-panel`, button "Join").
   - **Recent:** up to 6 notifications (title, body, relative time, optional "View" link to `item.link`). Empty: "No recent activity".
   - Hide a task card when its count is 0. If **Now** ends up empty, show "Nothing needs you right now".
5. Loading: `SkeletonCard`s in the stat and chart grids. Errors: `ErrorState` with retry per failed request (keep the existing per-section retry wiring).

**CSS (`home.css`):**

```css
.agenda { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
.agenda__col h2 { margin-bottom: 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
.task { display: grid; gap: 8px; padding: 14px; margin-bottom: 10px; border: 1px solid var(--border); border-left: 3px solid var(--border-strong); border-radius: var(--r-lg); background: var(--surface); }
.task--amber { border-left-color: var(--amber); }
.task--violet { border-left-color: var(--violet); }
.task--brand { border-left-color: var(--brand); }
.task h3 { font-size: 14px; font-weight: 600; }
.task p { font-size: 12.5px; color: var(--ink-3); }
.task__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.task__people { display: flex; flex: 1; }
.task__people .avatar { width: 24px; height: 24px; margin-right: -6px; border: 2px solid var(--surface); font-size: 10px; }
@media (max-width: 1180px) { .agenda { grid-template-columns: minmax(0, 1fr); } }
```

**Unit test update.** Replace the assertions in `tests/dashboard.test.tsx` with:

```tsx
expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
expect(await screen.findByRole("region", { name: "Requisitions by stage" })).toBeInTheDocument();
expect(screen.getByText("Grade 6 Science Teacher")).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Now" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "New requisition" })).toHaveAttribute("href", "/jobs?create=1");
```

**E2E `e2e/parity/home.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("home: KPIs, charts, agenda and links", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  for (const label of ["In flight", "New", "To score", "Hired", "Live jobs"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  for (const chart of ["Pipeline funnel", "Requisitions by stage", "Applications received", "Screening scores"])
    await expect(page.getByRole("region", { name: chart })).toBeVisible();
  await expect(page.getByRole("link", { name: "View all jobs" })).toHaveAttribute("href", "/jobs");
  await expect(page.getByRole("link", { name: "New requisition" }).first()).toHaveAttribute("href", "/jobs?create=1");
  await expect(page.getByRole("link", { name: /Join/ })).toHaveAttribute("href", "/interviews/faculty-panel");
  await page.getByRole("region", { name: "Pipeline funnel" }).getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("region", { name: "Pipeline funnel" }).getByRole("table")).toBeVisible();
});
```

> Make each task button a `Link` styled as a button, so the hrefs are assertable.

- [ ] Step 1: write the parity spec and run it (red)
- [ ] Step 2: restyle per the layout above
- [ ] Step 3: update `tests/dashboard.test.tsx`; `npm test` green
- [ ] Step 4: parity spec green; `npx playwright test e2e/layout.spec.ts --grep "home"` green on all projects
- [ ] Step 5: commit `feat(ui): employer Today dashboard with charts and agenda`

---

## Task 8: Pipeline and ApplicationDrawer

**Files:**
- Modify: `Frontend/components/pipeline/pipeline-page.tsx` (JSX and classes; add the Funnel view; toolbar; `?applicationId`; error toasts)
- Modify: `Frontend/components/pipeline/application-drawer.tsx` (JSX and classes only)
- Create: `Frontend/styles/screens/pipeline.css`
- Test: `Frontend/tests/pipeline-deeplink.test.tsx`
- E2E: `Frontend/e2e/parity/pipeline.spec.ts`

**Keep, unchanged in logic** (feature-inventory §7):
- every state variable listed at the top of `PipelinePage`;
- the DnD handlers;
- the transition dialog;
- the undo toast and its 10s interval;
- bulk actions (move, screen, shortlist, invite, reject modal, CSV export);
- the shortlist and invite modals;
- the aria-live announcements;
- blind mode;
- `?posting=` filtering, including the full-reload select.

**Changes:**

1. **View state:** change to `useState<"funnel" | "board" | "list">("funnel")`, plus `const [expandStages, setExpandStages] = useState(false)`.
   - `"board"` with `expandStages` false renders the existing **Focus board** markup (4 macro lanes).
   - `"board"` with `expandStages` true renders the existing **All stages** (`"expanded"`) markup.
   - `"list"` renders the existing table.
   - `"funnel"` is new (item 3).
2. **Toolbar** (in `PageHeader actions`), replacing the old header row **and** the "Pipeline Actions" automation bar:
   - `<select>` requisition filter: keep its existing element and handler.
   - `<SegmentedControl label="View" options={[{value:"funnel",label:"Funnel"},{value:"board",label:"Board"},{value:"list",label:"Table"}]} />`
   - `{view === "board" && <Switch label="Expand stages" … />}`
   - `<Switch label="Blind review" checked={blindMode} onChange={setBlindMode} />`
   - An **Actions** `Popover` menu with three `.menu__item` buttons. Each calls the **existing** handler the automation bar used:
     - "Screen all received (N)" (disabled at 0)
     - "Shortlist {selected ? `selected (n)` : "top N"}…"
     - "Invite {selected ? `selected (n)` : "top N"} to interview…"
3. **Funnel view:**

```tsx
const [funnelStage, setFunnelStage] = useState<string>(() => data?.columns[0]?.stage_id ?? "received");
// strip
<div className="stage-strip" role="group" aria-label="Stages" data-layout-ignore-scroll>
  {columns.map((c) => (
    <button key={c.stage_id} type="button" aria-pressed={funnelStage === c.stage_id} onClick={() => setFunnelStage(c.stage_id)}>
      <b className="tabular-nums">{c.cards.length}</b><small>{c.label}</small>
    </button>
  ))}
</div>
// primary stage action at right of strip: received → "Screen all (N)"; screened → "Shortlist (N)…"; shortlisted → "Invite (N)…" (existing handlers)
// grid
<div className="cand-grid">
  {stageCards.map((card) => <CandidateCard key={card.id} card={card} … />)}
</div>
```

   `CandidateCard` is a new **local** component in `pipeline-page.tsx`. It reuses the existing card's pieces:
   - checkbox (existing `toggleSelected`)
   - `AuthedImage`/initials avatar (hidden when blind)
   - name `<button>` → existing open-drawer handler
   - job title
   - `job_match_reasons` with a 2-line clamp (fallback "Not screened yet — run screening to get an AI match explanation.")
   - `<ScoreBadge score={card.job_match_score} label="Match" />` and `<ScoreBadge score={card.profile_interview_score} label="Screen" />`. This fixes the AI score being labelled "Interview" (glitch G4).
   - interview and sandbox status line (existing logic)
   - the existing "Move stage…" `<select>`, or "Final stage"

   Use the same `CandidateCard` inside the Focus board lanes too, so there is one card design.
4. **Board lanes:** the lane header becomes `<header className="lane__head"><h2>{label}</h2><span className="lane__count">{n}</span><div className="lane__action">{primary action}</div></header>` with `flex-wrap: wrap`. The action wraps under the title, so titles are never truncated (G3). Sub-stage filter chips stay.
5. **Bulk bar:** render only when `selectedIds.size > 0`. Class `bulk-bar`, fixed bottom-centre (CSS below). It keeps every existing control.
6. **Error toasts** (PRD §8.5): in every bulk or automation `catch` that today only sets the aria-live announcement, also call `toast.error(message)` (`const toast = useToast()`). Read `components/ui/toast-provider.tsx` for the API; `useToast()` returns `{ toast, success, error, info, warning }`.
7. **`?applicationId` deep link** (PRD §8.1):

```tsx
import { usePathname, useRouter, useSearchParams } from "next/navigation";
// inside PipelinePage, after existing searchParams:
const router = useRouter();
const pathname = usePathname();
const deepLinkApplication = searchParams.get("applicationId");
useEffect(() => {
  if (deepLinkApplication) setOpenApplication(deepLinkApplication);
}, [deepLinkApplication]);
const closeApplication = useCallback(() => {
  setOpenApplication(null);
  if (searchParams.get("applicationId")) {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("applicationId");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
}, [router, pathname, searchParams]);
// pass closeApplication wherever the drawer's onClose was `() => setOpenApplication(null)`
```

8. **ApplicationDrawer** (JSX only):
   - **Header:** avatar, name, job, then a meta row (stage pill, `ScoreBadge` "Match", "Blind review active" pill).
   - **Tabs:** keep the 5 tabs (`Tabs` component).
   - **Footer** (`.drawer__footer`): Move stage select (if the drawer had one; otherwise skip), Save scorecard (only on the Scorecards tab, the existing button), and a **Decide…** `Popover` menu holding the three existing decision buttons (Extend Offer / Invite Round 2 / Invite Onsite, each keeping its `confirm()` and toast).
   - Use `className="drawer drawer--wide"`.

**CSS (`pipeline.css`):**

```css
.stage-strip { display: flex; margin-bottom: 14px; overflow-x: auto; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); scrollbar-width: thin; }
.stage-strip button { position: relative; flex: 1 0 120px; display: grid; gap: 2px; padding: 12px 16px 12px 22px; border: 0; background: none; text-align: left; cursor: pointer; clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%); }
.stage-strip button:first-child { padding-left: 16px; clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%); }
.stage-strip b { font-size: 20px; font-weight: 650; }
.stage-strip small { font-size: 12px; color: var(--ink-3); white-space: nowrap; }
.stage-strip button[aria-pressed="true"] { background: var(--brand-soft); }
.stage-strip button[aria-pressed="true"] small { color: var(--brand); }
.stage-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cand-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
.cand-card { display: grid; gap: 10px; min-width: 0; padding: 14px; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
.cand-card.is-selected { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand); }
.cand-card__head { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cand-card__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; background: none; padding: 0; font-weight: 600; text-align: left; cursor: pointer; }
.cand-card__job { display: block; font-size: 12px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cand-card__reason { font-size: 12.5px; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cand-card__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cand-card__foot .select { width: auto; flex: 1 1 130px; }
.cand-card__status { font-size: 12px; color: var(--ink-3); }
.board { display: grid; grid-template-columns: repeat(4, minmax(260px, 1fr)); gap: 12px; align-items: start; overflow-x: auto; padding-bottom: 8px; }
.board--expanded { grid-template-columns: repeat(var(--lanes, 8), minmax(260px, 1fr)); }
.lane { min-width: 0; padding: 6px; border-radius: var(--r-lg); background: var(--surface-2); }
.lane.is-drop-target { outline: 2px dashed var(--brand); outline-offset: -2px; }
.lane__head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 6px 8px; }
.lane__head h2 { font-size: 13px; font-weight: 600; }
.lane__count { font-size: 12px; color: var(--ink-3); }
.lane__action { margin-left: auto; }
.lane__chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 4px 8px; }
.lane__chips button { height: 22px; padding: 0 8px; border: 1px solid var(--border); border-radius: 99px; background: var(--surface); font-size: 11.5px; color: var(--ink-2); cursor: pointer; }
.lane__chips button[aria-pressed="true"] { border-color: var(--ink); color: var(--ink); }
.lane .cand-card { margin-bottom: 6px; padding: 10px; }
.lane__empty { padding: 18px 8px; border: 1px dashed var(--border-strong); border-radius: var(--r-md); text-align: center; font-size: 12.5px; color: var(--ink-3); }
.bulk-bar { position: fixed; left: 50%; bottom: 20px; z-index: 40; transform: translateX(-50%); display: flex; flex-wrap: wrap; align-items: center; gap: 6px; max-width: calc(100vw - 24px); padding: 6px 6px 6px 14px; border-radius: 12px; background: var(--surface); box-shadow: var(--shadow-pop); }
.bulk-bar .select { width: auto; }
.undo-toast { position: fixed; right: 16px; bottom: 20px; z-index: 45; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--r-md); background: var(--ink); color: var(--bg); box-shadow: var(--shadow-pop); }
@media (max-width: 1024px) { .board { grid-template-columns: repeat(4, minmax(78vw, 1fr)); scroll-snap-type: x mandatory; } .lane { scroll-snap-align: start; } }
@media (max-width: 820px) { .bulk-bar, .undo-toast { bottom: calc(var(--tabbar-h) + 12px); } }
```

> The board and stage strip scroll horizontally on purpose. The layout rules allow controls inside horizontal scrollers (the `inScroller` check), so no extra marking is needed.

**Unit test `tests/pipeline-deeplink.test.tsx`:**

```tsx
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("applicationId=app_1"),
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/pipeline",
}));
vi.mock("@/components/pipeline/application-drawer", () => ({
  ApplicationDrawer: ({ applicationId }: { applicationId: string | null }) => (applicationId ? <div role="dialog" aria-label="Application">{applicationId}</div> : null),
}));
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async (p: string) => (p.includes("pipeline") ? { columns: [] } : { postings: [] })), post: vi.fn() },
}));

import { PipelinePage } from "@/components/pipeline/pipeline-page";
import { ToastProvider } from "@/components/ui/toast-provider";

it("opens the application drawer from ?applicationId", async () => {
  render(<ToastProvider><PipelinePage /></ToastProvider>);
  expect(await screen.findByRole("dialog", { name: "Application" })).toHaveTextContent("app_1");
});
```

> Check the real export name and props of the drawer in `application-drawer.tsx` (for example `ApplicationDrawer({ applicationId, onClose, blind })`) and adjust the mock to match.

**E2E `e2e/parity/pipeline.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("pipeline: views, blind review, actions menu, bulk bar, deep link", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { level: 1, name: "Pipeline" })).toBeVisible();
  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Funnel" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Stages" })).toBeVisible();
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("button", { name: /Screen all received/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const firstName = page.locator(".cand-card__name").first();
  const realName = await firstName.textContent();
  await page.getByRole("switch", { name: "Blind review" }).check();
  await expect(page.locator(".cand-card__name").first()).toHaveText(/Candidate #/);
  await page.getByRole("switch", { name: "Blind review" }).uncheck();
  await expect(page.locator(".cand-card__name").first()).toHaveText(realName ?? "");
  await page.locator(".cand-card input[type=checkbox]").first().check();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await view.getByRole("button", { name: "Board" }).click();
  await expect(page.getByRole("region", { name: /Received/ }).first()).toBeVisible();
  await view.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  if (ids.applicationId) {
    await page.goto(`/pipeline?applicationId=${ids.applicationId}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/pipeline$/);
  }
});
```

> Give each board lane `<section aria-label={label}>` so `getByRole("region")` finds it. Adjust selectors if the drawer's accessible name differs, but keep the assertions' intent.

- [ ] Step 1: parity spec + unit test; run (red)
- [ ] Step 2: view state, toolbar, Actions menu, Funnel view, `CandidateCard`, lanes, bulk bar, CSS
- [ ] Step 3: `?applicationId` open/close; error toasts
- [ ] Step 4: ApplicationDrawer restyle
- [ ] Step 5: diff check: run `git diff -U0 Frontend/components/pipeline/pipeline-page.tsx | grep -E "^[-+].*(api\.|useState|useEffect|fetch|idempotency)"` and confirm only the planned additions appear
- [ ] Step 6: `npm test`, typecheck, parity spec, and the layout spec for `pipeline` and `pipeline-drawer` all green
- [ ] Step 7: commit `feat(ui): pipeline funnel view, compact toolbar, deep-linked drawer`

---

## Task 9: Jobs list (create drawer) and Job detail

**Files:**
- Modify: `Frontend/components/jobs/jobs-page.tsx`
- Modify: `Frontend/components/jobs/job-detail-page.tsx`
- Create: `Frontend/styles/screens/jobs.css`
- E2E: `Frontend/e2e/parity/jobs.spec.ts`

**Jobs list:**
- `PageHeader title="Jobs" meta={`${n} requisitions`} actions={<Link className="button button--primary" href="/jobs?create=1">New job</Link>}`.
- Keep the table (`TableContainer` > `Table className="table table--stack"`, `data-label` on each `td`): title + location · work mode, applicants, status pill, pool pill, pinned pack, Manage. Loading, error-with-retry and empty states ("Create first job" → `/jobs?create=1`) as today.
- **Create form in a Drawer:**
  - When `searchParams.get("create") === "1"`, render `<Drawer open title="New requisition" onClose={() => router.push("/jobs")} className="drawer--wide">` containing the **existing** `CreateJobForm` unchanged in logic.
  - Its Cancel and X go to `/jobs`; submit still navigates to `/jobs/{id}`.
  - Read `components/ui/drawer.tsx` for the actual props (`open`, `onClose`, `title`, `footer`).
  - Move the form's action buttons into the drawer footer if the component allows it; otherwise keep them at the end of the form.
- Form layout: `form-grid` (auto-fit). Title, Location, Work mode, Domain pack and Description are full width; the sandbox sub-fields sit in a 3-column grid. The "Auto-generate with AI" button sits in the Description field's label row (it must wrap on mobile). Keep the "Generated by AI" marker.

**Job detail:**
- `PageHeader title={posting.title} meta={<>{location} · {workMode} · <Pill …>{status}</Pill></>} actions={[Open pipeline (N) Link, Publish button (draft; disabled + title tooltip until pool locked), Close button (published; confirm)]}`.
- Body: `<div className="detail-grid">` (`minmax(0,1fr) 320px`, one column ≤1120px):
  - **Main:** Question pool panel, Sandbox panel, Job description panel.
  - **Aside:** the metadata panel as a `<dl className="meta-list">`, with the Requisition ID in mono font and the copy button (keep the 2s check feedback).
- Everything inside the Question pool stays (generate, reorder ↑↓, remove (min 1), regenerate, save curation, discard, lock → confirm `Modal`, version pill). Only restyle: question rows become `.pool-row` (index, prompt, competency pill, controls wrapping on mobile).

**CSS (`jobs.css`):**

```css
.detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.detail-grid__main, .detail-grid__aside { display: grid; gap: 16px; min-width: 0; }
.meta-list { display: grid; gap: 0; margin: 0; }
.meta-list > div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.meta-list dt { color: var(--ink-3); font-size: 12.5px; }
.meta-list dd { margin: 0; min-width: 0; overflow-wrap: anywhere; font-weight: 500; }
.mono { font-family: var(--font-mono); font-size: 12.5px; }
.pool-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.pool-row__index { color: var(--ink-3); font-variant-numeric: tabular-nums; }
.pool-row__controls { display: flex; flex-wrap: wrap; gap: 4px; }
.label-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.jd { display: grid; gap: 8px; line-height: 1.6; }
@media (max-width: 1120px) { .detail-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .pool-row { grid-template-columns: 22px minmax(0, 1fr); } .pool-row__controls { grid-column: 1 / -1; } }
```

**E2E `e2e/parity/jobs.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("jobs list and create drawer", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await page.getByRole("link", { name: "New job" }).first().click();
  await expect(page).toHaveURL(/create=1/);
  const drawer = page.getByRole("dialog", { name: "New requisition" });
  for (const label of ["Job Title", "Location", "Work Mode", /Domain Pack/, /Job Description/]) await expect(drawer.getByLabel(label).first()).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Auto-generate with AI/ })).toBeVisible();
  await drawer.getByLabel(/Proctored Practical Assessment Sandbox/).check();
  await expect(drawer.getByLabel(/Time Limit/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/jobs$/);
});

test("job detail controls", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto(`/jobs/${ids.postingId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Pipeline/i })).toHaveAttribute("href", new RegExp(`posting=${ids.postingId}`));
  await expect(page.getByText(/Question Pool/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /copy/i })).toBeVisible();
});
```

> If labels differ slightly in the existing form (for example "Domain Pack (Standardized Ontology & Question Pool)"), the regexes above already tolerate that. Keep the visible labels as they are. Do not rename fields.

- [ ] Step 1: parity spec (red: no drawer yet)
- [ ] Step 2: jobs list + create drawer
- [ ] Step 3: job detail restyle
- [ ] Step 4: typecheck, test, parity, layout (`jobs`, `jobs-create`, `job-detail`) all green
- [ ] Step 5: commit `feat(ui): jobs list with create drawer, job detail layout`

---

## Task 10: Talent and Messages (both personas)

**Files:**
- Modify: `Frontend/components/talent/talent-discovery-page.tsx`
- Modify: `Frontend/app/messages/page.tsx`
- Modify: `Frontend/app/candidate/messages/page.tsx`
- Modify: `Frontend/components/messages/messaging-thread-view.tsx` (JSX and classes only; polling, send and Ctrl+Enter unchanged)
- Create: `Frontend/styles/screens/talent.css` and `Frontend/styles/screens/messages.css`
- E2E: `Frontend/e2e/parity/talent-messages.spec.ts`

**Talent:**
- `PageHeader title="Talent" meta="Verified candidates who applied or opted into discovery"`.
- Filter bar `<form className="filter-bar" role="search">`: Keywords input, Domain pack select (same source `GET /api/v1/packs/catalog`), Min score number (0–100), Search (submit), Clear.
- Results `<div className="talent-grid">` of `.talent-card`: initials, name, headline, email, up to 6 skill pills, a "Why this match" list, `ScoreBadge`, a requisition-count or "Discovery opt-in" pill, and a pack pill.
- **Remove every hard-coded colour** (PRD §8.2). Empty start state: `EmptyState` with the button "Display all discoverable talent" (same handler). No-results state: "Clear filters".

**Messages (both pages share the structure):**
- `PageHeader title="Messages"` (employer meta: "Conversations with applicants"; candidate meta: "Conversations with employers").
- Wrapper `<div className="msg" data-view={selectedId && isNarrow ? "thread" : "list"}>`:
  - `isNarrow` comes from `window.matchMedia("(max-width: 899px)")`, held in state with a listener.
  - Alternatively, always set `data-view` from the selection and let CSS decide. **Preferred:** set `data-view="thread"` whenever a thread is selected **by the user** (not auto-selected), and use CSS so desktop shows both panes regardless.
- **Left pane** `.msg__list`: search input (same filter fields) and thread buttons (name, date, posting, preview, "N new" pill). Keep auto-selecting the first thread **on desktop only**: do not set `data-view="thread"` for the auto-selection.
- **Right pane** `.msg__thread`:
  - Header: a Back button (`aria-label="Back to conversations"`, visible <900px; sets `data-view` back to list), "Conversation with X", posting pill, and for employers **"View application"** (`/pipeline?applicationId={application_id}`, now working).
  - Then `MessagingThreadView`.
- Keep the `?c={conversationId}` param in sync: read it on mount to select, and `router.replace` on select. This is an addition; nothing depends on it.
- Height: `.msg { height: calc(100dvh - var(--topbar-h) - 120px); min-height: 420px; }`. On mobile, also subtract `var(--tabbar-h)`.
- The thread view's message list scrolls (`min-height: 0; overflow-y: auto`), and the composer is a non-shrinking footer, so it is always visible (G6).

**CSS (`messages.css`):**

```css
.msg { display: grid; grid-template-columns: 320px minmax(0, 1fr); height: calc(100dvh - var(--topbar-h) - 120px); min-height: 420px; overflow: hidden; border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--surface); }
.msg__list { display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border); }
.msg__search { padding: 10px; border-bottom: 1px solid var(--border); }
.msg__threads { flex: 1; min-height: 0; overflow-y: auto; }
.msg__item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; width: 100%; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--border); background: none; text-align: left; cursor: pointer; }
.msg__item.is-active { background: var(--brand-soft); box-shadow: inset 3px 0 0 var(--brand); }
.msg__item b, .msg__item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msg__item small { grid-column: 1 / -1; color: var(--ink-3); }
.msg__thread { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.msg__thread-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.msg__back { display: none; }
.thread { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.thread__messages { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; display: grid; gap: 10px; align-content: start; }
.thread__bubble { max-width: min(560px, 85%); padding: 8px 12px; border-radius: 12px; background: var(--surface-2); }
.thread__bubble--mine { justify-self: end; background: var(--brand-soft); }
.thread__composer { flex: none; display: flex; gap: 8px; align-items: flex-end; padding: 10px; border-top: 1px solid var(--border); }
.thread__composer textarea { flex: 1; min-height: 44px; max-height: 160px; }
@media (max-width: 899px) {
  .msg { grid-template-columns: minmax(0, 1fr); height: calc(100dvh - var(--topbar-h) - var(--tabbar-h) - 110px); }
  .msg[data-view="thread"] .msg__list { display: none; }
  .msg[data-view="list"] .msg__thread { display: none; }
  .msg__list { border-right: 0; }
  .msg__back { display: inline-grid; }
}
```

> Map these classes onto `messaging-thread-view.tsx`'s existing elements. The message list container gets `thread__messages`, bubbles get `thread__bubble`, the composer form gets `thread__composer`. Keep its "Live sync active" indicator, day separators and read receipts.

**E2E `e2e/parity/talent-messages.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("talent filters and results", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/talent");
  await expect(page.getByRole("search")).toBeVisible();
  await page.getByRole("button", { name: /Display all discoverable talent/i }).click();
  await expect(page.locator(".talent-card").first()).toBeVisible();
});

for (const [persona, path] of [["employer", "/messages"], ["candidate", "/candidate/messages"]] as const) {
  test(`${persona} messages: desktop two panes, composer visible`, async ({ page }, testInfo) => {
    onlyProject(testInfo);
    await signIn(page, persona);
    await readOnly(page);
    await page.goto(path);
    await expect(page.getByRole("textbox").last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });
  test(`${persona} messages: mobile list → thread → back`, async ({ page }, testInfo) => {
    onlyProject(testInfo, "w390");
    await signIn(page, persona);
    await readOnly(page);
    await page.goto(path);
    const first = page.locator(".msg__item").first();
    test.skip((await first.count()) === 0, "no conversations seeded");
    await first.click();
    await expect(page.getByRole("button", { name: "Send" })).toBeInViewport();
    await page.getByRole("button", { name: "Back to conversations" }).click();
    await expect(first).toBeVisible();
  });
}
```

- [ ] Step 1: parity spec (red)
- [ ] Step 2: Talent restyle (no hard-coded colours)
- [ ] Step 3: Messages, both pages + thread view
- [ ] Step 4: green on parity + layout (`talent`, `messages`, `cand-messages`)
- [ ] Step 5: commit `feat(ui): talent filter bar, responsive messages list→thread`

---

## Task 11: Analytics

**Files:**
- Modify: `Frontend/components/analytics/analytics-dashboard.tsx`
- Create: `Frontend/styles/screens/analytics.css`
- Test: `Frontend/tests/analytics.test.tsx`
- E2E: `Frontend/e2e/parity/analytics.spec.ts`

**Changes (PRD §6.1 Analytics, §8.4):**
- `PageHeader title="Analytics" actions={<SegmentedControl label="Section" value={tab} options={[{value:"funnel",label:"Funnel"},{value:"sla",label:"SLA & bottlenecks"},{value:"fairness",label:"Fairness & calibration"}]} />}`.
- KPI `StatTile`s: Time to hire, Active pipeline, Offer acceptance, Requisitions.
  - **Delete every hard-coded fallback constant** (search the file for `18.5`, `87.5`, `0.96`, `6.2`, `92.4`, `12`, and any `??` / `||` that feeds a literal number into a KPI).
  - A missing value renders `"—"` with hint "Not enough data".
- Each of the five requests (`overview`, `funnel`, `velocity`, `fairness`, `calibration`) gets its own loading skeleton and `ErrorState` with retry, where its section renders.
- **Funnel tab:** wrap the existing waterfall in a `ChartCard` titled "Hiring funnel".
  - Bars use `--viz-mag`.
  - **Zero values get 0 width.** Remove any minimum bar width.
  - Pass-through and drop-off stay as text.
  - Add a Table view through the `ChartCard table` prop.
- **SLA tab:** SLA cards show a status icon **and** a text label (Healthy / Warning / Critical), never colour alone. The bottleneck table keeps "Open pipeline" and "Inspect" (`/pipeline?applicationId=…`, which works after Task 8).
- **Fairness tab:** the parity "Passed" pill must come from data: if the parity index is ≥ the threshold the code or API provides, show "Within threshold"; otherwise "Review needed". If there is no threshold in the response, show the number only, with no pass/fail pill.

**Unit test `tests/analytics.test.tsx`:**

```tsx
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async () => { throw new (await orig<typeof import("@/lib/api")>()).ApiError(500, "boom", "Server error"); }) },
}));
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

it("never shows fabricated KPI numbers when the API fails", async () => {
  render(<AnalyticsDashboard />);
  expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
  expect(screen.queryByText("18.5")).toBeNull();
  expect(screen.queryByText(/87\.5|92\.4/)).toBeNull();
});
```

> Check the component's real export name (`AnalyticsDashboard` vs default export) and the `ApiError` constructor signature in `lib/api.ts`.

**E2E `e2e/parity/analytics.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";
test("analytics tabs", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/analytics");
  const section = page.getByRole("group", { name: "Section" });
  await expect(page.getByRole("region", { name: "Hiring funnel" })).toBeVisible();
  await section.getByRole("button", { name: "SLA & bottlenecks" }).click();
  await expect(page.getByText(/Healthy|Warning|Critical|within SLA/i).first()).toBeVisible();
  await section.getByRole("button", { name: "Fairness & calibration" }).click();
  await expect(page.getByText(/parity/i).first()).toBeVisible();
});
```

- [ ] Step 1: tests (red)
- [ ] Step 2: restyle + remove fallbacks + error states
- [ ] Step 3: green (unit, parity, layout `analytics`)
- [ ] Step 4: commit `feat(ui): analytics with chart cards, honest KPIs, error states`

---

## Task 12: Automations and Administration

**Files:**
- Modify: `Frontend/components/automations/automation-builder.tsx`
- Modify: `Frontend/components/admin/admin-page.tsx`
- Create: `Frontend/styles/screens/automations.css` and `Frontend/styles/screens/admin.css`
- Test: `Frontend/tests/admin-hash.test.tsx`
- E2E: `Frontend/e2e/parity/automations-admin.spec.ts`

**Automations:**
- `PageHeader title="Automations" actions={<Button onClick={openCreate}>Create automation</Button>}`.
- **Recipes** become a row of 3 cards (`auto-fit, minmax(min(100%,260px),1fr)`), each with title, description and "Use this recipe" (same prefill handler).
- **Rules table:** Name, Trigger, Conditions, Actions, Executions (runs · last run) and Status. Status becomes a `<Switch label={…sr text} …>` calling the existing toggle handler. Then Simulate and Delete (`confirm()`).
- **Run log table:** unchanged columns.
- **Create and Simulation modals:** same fields and logic, using `form-grid`.
- **PRD §8.5:** toggle and delete failures, which today only `console.error`, also call `toast.error(...)`.

**Administration** (settings layout, PRD §6.1):
- `PageHeader title={organization.name} meta={`Your role: ${role}`}`.
- Superadmin pending panel above the layout (unchanged logic). **Reject** opens a `Modal` with a required reason `textarea`. Its Confirm calls the existing reject request with that reason, replacing `window.prompt` (PRD §8.8).
- Layout `<div className="settings">`:
  - **Nav:** `<nav className="settings__nav" aria-label="Administration sections">` with buttons in this order: Departments & units (`units`), Staff & roles (`members`), Domain packs (`packs`), Hiring workflow (`workflows`), Email templates (`emails`), Audit log (`audit`), **Organization** (`organization`). Each has `aria-current="true"` when active.
  - **Content:** `<div className="settings__body">`. The new Organization section is a panel with the text "Register another organization or review onboarding" and a `Link` → `/register/organization`.
- **Hash sync (PRD §8.6).** Replace the mount-only hash read with:

```tsx
const SECTIONS = ["units", "members", "packs", "workflows", "emails", "audit", "organization"] as const;
type Section = (typeof SECTIONS)[number];
useEffect(() => {
  const sync = () => {
    const h = window.location.hash.replace("#", "");
    if ((SECTIONS as readonly string[]).includes(h)) setActiveTab(h as Section);
  };
  sync();
  window.addEventListener("hashchange", sync);
  return () => window.removeEventListener("hashchange", sync);
}, []);
// on nav click: setActiveTab(s); window.location.hash = s;  (existing write behaviour)
```

  > Widen the `activeTab` state type to include `"organization"`.
- All section contents keep their forms and lists: units tree + add; members list + recent invites + create staff; packs list, set default, create/edit/delete; workflow chips, checkboxes, preview, save; email templates edit/save/reset; audit (first 30).

**CSS (`admin.css`, which also serves the candidate profile in Task 14):**

```css
.settings { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 18px; align-items: start; }
.settings__nav { position: sticky; top: calc(var(--topbar-h) + 16px); display: grid; gap: 2px; }
.settings__nav button { height: 34px; padding: 0 12px; border: 0; border-radius: var(--r-md); background: none; color: var(--ink-2); font-weight: 500; text-align: left; white-space: nowrap; cursor: pointer; }
.settings__nav button[aria-current="true"] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow-1), inset 0 0 0 1px var(--border); }
.settings__body { display: grid; gap: 16px; min-width: 0; }
@media (max-width: 960px) {
  .settings { grid-template-columns: minmax(0, 1fr); }
  .settings__nav { position: static; display: flex; overflow-x: auto; scrollbar-width: none; }
}
```

**Unit test `tests/admin-hash.test.tsx`:**

```tsx
import { act, render, screen } from "@testing-library/react";
import { vi } from "vitest";
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  api: { get: vi.fn(async (p: string) => (p.endsWith("/organizations/current") ? { organization: { name: "NUT" }, role: "administrator", units: [] } : p.includes("pending") ? { organizations: [] } : {})), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
import { AdminPage } from "@/components/admin/admin-page";

it("follows hash changes after mount", async () => {
  window.location.hash = "";
  render(<AdminPage />);
  await screen.findByRole("heading", { level: 1, name: "NUT" });
  act(() => { window.location.hash = "#audit"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(screen.getByRole("button", { name: "Audit log" })).toHaveAttribute("aria-current", "true");
});
```

> Check the real export name in `admin-page.tsx`.

**E2E `e2e/parity/automations-admin.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("automations page", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/automations");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Use this recipe/i })).toHaveCount(3);
});

test("admin sections + hash navigation", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Administration sections" });
  for (const s of ["Departments & units", "Staff & roles", "Domain packs", "Hiring workflow", "Email templates", "Audit log", "Organization"])
    await expect(nav.getByRole("button", { name: s })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#packs"; });
  await expect(nav.getByRole("button", { name: "Domain packs" })).toHaveAttribute("aria-current", "true");
  await nav.getByRole("button", { name: "Organization" }).click();
  await expect(page.getByRole("link", { name: /Register/i })).toHaveAttribute("href", "/register/organization");
});
```

- [ ] Step 1: tests (red)
- [ ] Step 2: automations restyle + toasts
- [ ] Step 3: admin settings layout, hash sync, reject modal, Organization section
- [ ] Step 4: green (unit, parity, layout `automations` + all `admin*`)
- [ ] Step 5: commit `feat(ui): automations cards/table, admin settings layout with hash sync`

---

## Task 13: Candidate Home and Jobs

**Files:**
- Modify: `Frontend/components/candidate/candidate-overview.tsx`
- Modify: `Frontend/components/candidate/candidate-jobs-page.tsx`
- Create: `Frontend/lib/candidate-next-step.ts`
- Create: `Frontend/styles/screens/candidate.css`
- Test: `Frontend/tests/candidate-next-step.test.ts`
- E2E: `Frontend/e2e/parity/candidate-home-jobs.spec.ts`

**Interfaces (produced, also used by Task 14):**
```ts
// lib/candidate-next-step.ts
export type NextStep = { label: string; href: string; tone: "brand" | "violet" } | null;
export function nextStep(app: CandidateApplication): NextStep;
// invited|in_progress interview → { "Take your job interview", /candidate/applied/{attempt_id}, brand }
// sandbox.required && interview submitted|evaluated && sandbox.status not in submitted|evaluated|expired → { "Complete the proctored sandbox", /candidate/sandbox/{attempt_id}, violet }
// else null
```

> Before writing `nextStep`, copy the exact sandbox CTA conditions from `candidate-applications-page.tsx` (the "Take sandbox" / "Sandbox complete" / "Sandbox pending" logic), so Home and Applications agree with today's behaviour. Then make both screens use this helper.

- [ ] **Step 1: Failing test** `tests/candidate-next-step.test.ts`

```ts
import { nextStep } from "@/lib/candidate-next-step";
import type { CandidateApplication } from "@/lib/types";
const base = { id: "a", job_title: "J", organization_name: "O", status: "Interview", status_order: [], applied_at: "", updated_at: "" } as unknown as CandidateApplication;

it("interview first", () => {
  expect(nextStep({ ...base, applied_interview: { attempt_id: "x", status: "invited" } })?.href).toBe("/candidate/applied/x");
});
it("then sandbox", () => {
  expect(nextStep({ ...base, applied_interview: { attempt_id: "x", status: "evaluated", sandbox: { required: true, status: null } } })?.href).toBe("/candidate/sandbox/x");
});
it("nothing when sandbox done", () => {
  expect(nextStep({ ...base, applied_interview: { attempt_id: "x", status: "evaluated", sandbox: { required: true, status: "submitted" } } })).toBeNull();
});
```

- [ ] **Step 2: Implement `nextStep`.** Run the test until it is green.

- [ ] **Step 3: Home layout** (PRD §6.2; prototype `cand_A_overview_*`, source `OverviewA` in `git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp-candidate/variants.tsx`). Keep all four existing fetches and per-section loading/error states.

```tsx
<PageHeader title={`Welcome back${first ? `, ${first}` : ""}`} meta="Here's where your applications stand" />
{step ? (
  <Link className={`hero hero--${step.tone}`} href={step.href}>
    <span className="hero__eyebrow">Your next step</span><b>{step.label}</b>
    <span className="hero__sub">{app.job_title} · {app.organization_name}</span>
    <span className="button button--primary hero__cta">Start</span>
  </Link>
) : (
  <div className="hero"><span className="hero__eyebrow">You're all caught up</span><b>Nothing needs you right now</b><span className="hero__sub">We'll notify you when an employer moves your application.</span></div>
)}
<div className="stat-grid">
  <StatTile label="Profile screening" value={best ?? "—"} href="/candidate/interview" action={inProgress ? "Resume screening" : best !== null ? "Retake" : "Start screening"} />
  <StatTile label="Active applications" value={active.length} href="/candidate/applications" action="View all" />
  <StatTile label="Open jobs" value={openJobsCount ?? "—"} href="/candidate/jobs" action="Browse" />
  <StatTile label="Discoverable" value={profile?.consents.discovery ? "On" : "Off"} href="/candidate/profile#privacy" action="Privacy" />
</div>
<div className="two-col">
  <section className="panel" aria-label="Applications">…rows: title, org, status pill, "Take job interview" link when invited|in_progress…</section>
  <section className="panel" aria-label="Suggested jobs">…matches (title, location, first reason, ScoreBadge "Match", "View role" → /candidate/jobs), "Browse all jobs"…</section>
</div>
<details className="panel screening-history"><summary>Screening history ({attempts.length})</summary>…attempt rows: #, pack, status, score…</details>
<section className="panel" aria-label="Profile snapshot">headline, ≤5 skill pills, discovery pill, "Edit profile" → /candidate/profile</section>
```

  - `openJobsCount`: if the Home page does not fetch `/api/v1/jobs` today, **do not add a request**. Show the tile as "Browse" with value "—".
  - The "Open jobs" value is optional; never fabricate it.

- [ ] **Step 4: Jobs page.**
  - `PageHeader title="Find jobs" meta={`${jobs.length} open roles`}`.
  - Each job is an `<article className="panel job-card">` with a header (`flex-wrap: wrap`) containing:
    - org eyebrow and title (`flex: 1 1 260px; min-width: 0`)
    - meta line: location · employment type
    - chips: "Screening required"
    - the action at the right that wraps below on mobile: Apply now (existing handler) or the "Applied" pill
  - Body: description (240-char truncation, "Read full description / Show less") and the process steps line.
  - This fixes G8.

- [ ] **Step 5: CSS (`candidate.css`)**

```css
.hero { display: grid; gap: 6px; padding: 20px 22px; margin-bottom: 16px; border: 1px solid var(--border); border-left: 4px solid var(--border-strong); border-radius: var(--r-lg); background: var(--surface); color: inherit; }
.hero--brand { border-left-color: var(--brand); background: linear-gradient(90deg, var(--brand-soft), var(--surface) 60%); }
.hero--violet { border-left-color: var(--violet); background: linear-gradient(90deg, var(--violet-soft), var(--surface) 60%); }
.hero b { font-size: 18px; font-weight: 650; }
.hero__eyebrow { font-size: 12px; font-weight: 600; color: var(--ink-3); }
.hero__sub { color: var(--ink-3); }
.hero__cta { justify-self: start; }
.two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); gap: 16px; margin-bottom: 16px; }
.row-link { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); color: inherit; }
.row-link__text { flex: 1 1 200px; min-width: 0; }
.row-link__text b { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-link__text small { color: var(--ink-3); }
.screening-history summary { padding: 12px 16px; cursor: pointer; font-weight: 600; }
.job-card { margin-bottom: 12px; }
.job-card__head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px 16px; padding: 16px; }
.job-card__title { flex: 1 1 260px; min-width: 0; }
.job-card__title h2 { font-size: 16px; }
.job-card__org { font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-3); }
.job-card__meta { font-size: 12.5px; color: var(--ink-3); }
.job-card__body { display: grid; gap: 10px; padding: 0 16px 16px; }
.job-card__process { padding: 10px 12px; border-radius: var(--r-md); background: var(--surface-2); font-size: 12.5px; color: var(--ink-2); }
```

- [ ] **Step 6: E2E `e2e/parity/candidate-home-jobs.spec.ts`**

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";
test("candidate home", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate");
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText(/Your next step|You're all caught up/)).toBeVisible();
  for (const t of ["Profile screening", "Active applications", "Discoverable"]) await expect(page.getByText(t, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Suggested jobs" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Edit profile/i })).toHaveAttribute("href", "/candidate/profile");
});
test("candidate jobs", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/jobs");
  await expect(page.locator(".job-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply now/i }).or(page.getByText("Applied")).first()).toBeVisible();
});
```

- [ ] **Step 7:** green on unit, parity and layout (`cand-home`, `cand-jobs`). Commit `feat(ui): candidate home next-step hero and job cards`.

---

## Task 14: Candidate Applications (journey) and Profile (settings)

**Files:**
- Modify: `Frontend/components/candidate/candidate-applications-page.tsx`
- Modify: `Frontend/components/candidate/candidate-profile-page.tsx`
- Modify: `Frontend/components/candidate/avatar-panel.tsx`
- Modify: `Frontend/styles/screens/candidate.css` (append)
- E2E: `Frontend/e2e/parity/candidate-apps-profile.spec.ts`

**Applications** (PRD §6.2; prototype `JourneyCard` in `variants.tsx`):
- `PageHeader title="My applications" meta="Every step, and what happens next"`.
- One `<article className="panel journey">` per application:
  - **Header:** title, `org · applied {date} · updated {date}`, status pill.
  - **Timeline:** `<Stepper orientation="vertical" steps={app.status_order} current={app.status_order.indexOf(app.status)} renderStep={…}/>`. The **current** step's body shows the inline action:
    - `nextStep(app)` button, if any;
    - else the existing sandbox state pills ("Sandbox complete" / "Sandbox pending") exactly as today;
    - else "Waiting on the employer".
  - **Scores row:** `ScoreBadge` "Match" (`job_match_score`), "Interview" (`applied_interview.interview_score`), "Sandbox" (`sandbox.score`).
  - **Footer:**
    - "Details" toggle (`aria-expanded`). It **lazy-loads the existing timeline request** and renders the dated steps plus "Expected next step", and the AI growth roadmap markdown (existing renderer).
    - "Withdraw" for non-terminal applications.
- **Withdraw** (PRD §8.3): replace the custom dialog with `<Modal open title="Withdraw application?" onClose={…}>` containing the reason field (if the existing dialog collected one) and the buttons **Keep application** / **Confirm withdrawal** (same handler and endpoint).
- Empty state: "Browse open jobs" → `/candidate/jobs`.

**Profile** (settings layout; reuse `.settings` from Task 12):
- `PageHeader title="Profile & privacy"`.
- `<div className="settings">`. The nav has sections **Profile, Photo, Resume, Privacy** (`aria-current`), synced to `location.hash` (`#profile`, `#photo`, `#resume`, `#privacy`) with the same hashchange pattern as Task 12, so Home's "Privacy" tile can deep-link.
  - **Profile:** the existing form (Headline ≤200, Summary ≤4000, Skills CSV, Credentials CSV), Save, inline success/error.
  - **Photo:** `avatar-panel.tsx` restyled.
    - Replace the visible native file input with `<label className="button button--primary file-button">Upload photo<input type="file" className="file-input-hidden" accept="image/jpeg,image/png,image/webp" …existing onChange/></label>`.
    - Keep the 5 MB check, Remove, `AuthedImage`, and the identity-check copy.
  - **Resume:**
    - A drop zone `<label className="dropzone">` wrapping the hidden file input (same accept list, same handler). Show the selected name and size.
    - Paste textarea (≤100k).
    - "Parse & update profile" button, keeping the existing enable rule (file, or ≥40 chars) and the existing endpoints.
    - Structured resume preview.
  - **Privacy:** two `Switch`es, labels "Let employers discover me" (`discovery`) and "Process my applications" (`application_processing`), with descriptions. Each calls the existing consent `PUT`. Below them sits the matching-index status line.

**CSS (append to `candidate.css`):**

```css
.journey { display: grid; gap: 12px; padding: 16px 18px; margin-bottom: 14px; }
.journey__head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 8px 12px; }
.journey__title { flex: 1 1 240px; min-width: 0; }
.journey__title h2 { font-size: 16px; }
.journey__title small { color: var(--ink-3); }
.journey__scores, .journey__foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.journey__foot { padding-top: 10px; border-top: 1px solid var(--border); }
.journey__details { display: grid; gap: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.dropzone { display: grid; justify-items: center; gap: 6px; padding: 24px; border: 1.5px dashed var(--border-strong); border-radius: var(--r-lg); background: var(--surface-2); color: var(--ink-2); text-align: center; cursor: pointer; }
.dropzone:hover, .dropzone:focus-within { border-color: var(--brand); color: var(--brand); }
.photo { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; }
.photo__frame { display: grid; place-items: center; width: 72px; height: 72px; flex: none; overflow: hidden; border: 1px dashed var(--border-strong); border-radius: 99px; background: var(--surface-3); color: var(--ink-3); }
```

**E2E `e2e/parity/candidate-apps-profile.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";
test("applications journey", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/applications");
  const card = page.locator(".journey").first();
  await expect(card.getByRole("list", { name: "Progress" })).toBeVisible();
  await card.getByRole("button", { name: "Details" }).click();
  await expect(card.getByRole("button", { name: "Details" })).toHaveAttribute("aria-expanded", "true");
  const withdraw = card.getByRole("button", { name: "Withdraw" });
  if (await withdraw.count()) {
    await withdraw.click();
    await expect(page.getByRole("dialog", { name: /Withdraw application/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
test("profile settings sections", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/profile#privacy");
  await expect(page.getByRole("switch", { name: /Let employers discover me/ })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: /Parse/ })).toBeVisible();
  await page.getByRole("button", { name: "Photo" }).click();
  await expect(page.getByText(/Upload photo/)).toBeVisible();
});
```

- [ ] Step 1: parity spec (red)
- [ ] Step 2: Applications journey + Withdraw `Modal`
- [ ] Step 3: Profile settings + avatar + resume + switches
- [ ] Step 4: green (parity, layout `cand-applications`, `cand-profile`)
- [ ] Step 5: commit `feat(ui): candidate journey cards and settings-style profile`

---

## Task 15: Focus layout for the voice interview, sandbox and interview room

**Visual only.** Do not change WebSocket messages, LiveKit options, mic gating, timers, identity check, recording, proctoring, autosave or any API call. Run the diff check in Step 6.

**Files:**
- Modify the pages, which drop `CandidateShell` in favour of `RequireAuth` + the component's own `FocusLayout`:
  - `app/candidate/interview/page.tsx` → `<RequireAuth><ProfileScreeningLauncher /></RequireAuth>`
  - `app/candidate/applied/[attemptId]/page.tsx` → `<RequireAuth><VoiceInterviewPortal kind="applied" attemptId={attemptId} label="Job interview" /></RequireAuth>`
  - `app/candidate/sandbox/[attemptId]/page.tsx` → `<RequireAuth><SandboxPortal attemptId={attemptId} /></RequireAuth>`
- Modify: `components/interviews/voice/voice-portal.tsx`. Wrap the rendered flow in `<FocusLayout title={label} steps={<StepIndicator …existing props…/>} exitHref="/candidate">`. `ProfileScreeningLauncher` renders its loading, error and explainer states inside `<FocusLayout title="Skill screening" exitHref="/candidate">`, and passes `label="Skill screening"` to the portal.
- Modify (JSX and classes only):
  - `StepIndicator.tsx`: compact horizontal steps for the header (numbered circles, check when done, current label shown; ≤900px shows only the current label)
  - `PermissionCheck.tsx`, `DeviceCheck.tsx`, `InterviewSetup.tsx`, `LiveKitRoomWrapper.tsx`, `InterviewInterface.tsx`, `MicLevelIndicator.tsx`, `EndInterviewModal.tsx`
- Modify: `components/sandbox/sandbox-portal.tsx`, `code-editor.tsx`, `sandbox-timer.tsx`, `written-exercise.tsx` (JSX and classes)
- Modify: `components/interviews/livekit-interview-room.tsx`. Render the lobby inside `<FocusLayout title="Interview room" right={<PackChip …/>} exitHref="/">`; keep the in-call `VideoConference` full-bleed.
- Create: `Frontend/styles/screens/focus.css`. Port the "focus layout" section of `git show prototype/ui-revamp:Frontend/app/prototype/ui-revamp-candidate/cand.css`: remove the `.proto ` prefix and rename `f-*` → `fx-*`.
- E2E: `Frontend/e2e/parity/focus.spec.ts`

**Specific requirements:**

1. **InterviewInterface title fix (PRD §8.7).** Add an optional prop `title?: string` to `InterviewInterface`. Replace the hard-coded "Job Interview" text (around line 1121) with `{title ?? "Job interview"}`. Pass `title={label}` from `VoicePortal`.
2. **Live layout** (`.fx-live`): stage column (AI tile with the existing wave/state, self video tile mirrored as today, mic bar with `MicLevelIndicator` and the Muted/Live badge) plus the transcript panel.
   - The existing header row (connected state, interviewer name, timer turning red after 85%, End) becomes `.fx-live__bar` at the top of the stage column.
   - At ≤900px it becomes one column: stage tiles get fixed heights 220px and 160px, and the transcript gets 320px with its own scroll. **No fixed height plus `overflow: hidden` on the outer container** (G16 / design rule).
3. **PermissionCheck:** a centred `.fx-card` with icon, title, explanation, an amber `.fx-alert` for the denied / camera-in-use cases, and Retry (existing reload behaviour).
4. **DeviceCheck:** `.fx-card--wide` with `.fx-device` (preview | controls). Keep the 10s test recording, playback, Record again, the confirm checkbox and Continue gating.
5. **InterviewSetup:** details and instruction list, Start, then the 3-stage `.fx-progress` and bar; keep the failure card.
6. **Complete screen** (in `voice-portal.tsx`): `.fx-card` with a success icon. Keep "Continue to the sandbox" (when required) and "Back to candidate home".
7. **EndInterviewModal:** use `.dialog` styling. Keep Esc → cancel and Cancel default focus.
8. **Sandbox:**
   - `SandboxPortal` renders `<FocusLayout title={`Proctored sandbox · ${difficulty}`} right={state === "active" ? <><span className="fx-rec">REC</span><SandboxTimer …/><Button onClick={submit}>Submit</Button></> : undefined} exitHref={state === "active" ? undefined : "/candidate/applications"} full={state === "active"}>`.
     - There is **no Exit while active.** Leaving would exit fullscreen, and that auto-submits.
   - **Lobby:** `.fx-card--wide` with config, rules list, the "Share your screen" and "Enable camera & microphone" buttons rendered as `.fx-check` (with an `.is-done` state when the stream exists), and Start/Resume in fullscreen (same gating).
   - **Active coding:** `.fx-ide` grid (problem | editor), stacking ≤960px. `CodeEditor` keeps its gutter, Tab = 2 spaces and language select.
   - **Written:** the per-prompt textareas with "Question i of n" and the live word count.
   - **Violation notice:** a `.fx-violation` pill at the bottom centre (not top), so it never covers the editor header.
   - **Analyzing overlay:** kept, restyled as `.fx-overlay` (full-screen scrim with spinner).
   - **Done:** `.fx-card` with the score (`N/100`, keeping the special copy for 0) and the two links.
   - **Not required / submitted / expired:** states use `.fx-card`.

**E2E `e2e/parity/focus.spec.ts`:**

```ts
import { expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("screening uses focus layout (no app rail)", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page); // attempt creation is blocked → launcher shows its error card, still inside the focus layout
  await page.goto("/candidate/interview");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText("Skill screening").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveAttribute("href", "/candidate");
});

test("sandbox lobby", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  test.skip(!ids.attemptId, "no applied interview attempt in seed data");
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto(`/candidate/sandbox/${ids.attemptId}`);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText(/Before you begin|No sandbox required|submitted|Assessment/i).first()).toBeVisible();
});

test("applied interview page renders inside focus layout", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  test.skip(!ids.attemptId, "no attempt");
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto(`/candidate/applied/${ids.attemptId}`);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText(/Job interview/i).first()).toBeVisible();
});
```

> For deeper sandbox coverage, add a spec that stubs `navigator.mediaDevices.getDisplayMedia` and `Element.prototype.requestFullscreen` with `page.addInitScript`, and mocks `GET {base}` with `page.route` to return an active session, as described in `assets/research-playwright.md` §Sandbox. Assert that the problem pane, the editor and the Submit button are visible at w1366 and w390. This is recommended, not blocking.

- [ ] Step 1: parity spec (red: the rail is present today)
- [ ] Step 2: pages → `RequireAuth` + `FocusLayout`; `StepIndicator` in header
- [ ] Step 3: voice components restyle; title prop fix
- [ ] Step 4: sandbox restyle
- [ ] Step 5: interview room lobby
- [ ] Step 6: **diff check.** For each of `InterviewInterface.tsx`, `voice-portal.tsx`, `sandbox-portal.tsx`, `use-proctoring.ts` and `sandbox-recorder.tsx`, run `git diff -U0 <file> | grep -E "^[-+]" | grep -vE "className|style=|^[-+]\s*<|^[-+]\s*\)|^[-+]\s*\}|title"` and confirm nothing behavioural changed. `use-proctoring.ts` and `sandbox-recorder.tsx` should have **no** diff at all.
- [ ] Step 7: green on parity + layout (`cand-screening`, `cand-applied`, `cand-sandbox`, `interview-room`)
- [ ] Step 8: **manual check** (tell the user if you cannot do it). With the backend AI keys configured, start a profile screening at `/candidate/interview` and confirm permissions → device check → setup → live (transcript updates, mic opens on your turn, End works). Without keys, record that in the sign-off file.
- [ ] Step 9: commit `feat(ui): focus layout for voice interview, sandbox and interview room`

---

## Task 16: Public auth pages

**Files:**
- Modify: `Frontend/components/auth/login-form.tsx`, `register-form.tsx`, `organization-apply-form.tsx`
- Create: `Frontend/components/auth/auth-layout.tsx`
- Modify: `Frontend/app/globals.css`. Remove the old "Specialized Screen: Auth Pages" block once nothing uses its classes.
- Create: `Frontend/styles/screens/auth.css`
- E2E: `Frontend/e2e/parity/auth.spec.ts`

**`AuthLayout({ title, subtitle, children, wide })`:**
- At ≥1024px it is a two-column page:
  - **Left brand panel** (`.auth__brand`, `--surface-2` background): wordmark, the value statement "Hire on verified skills, not guesswork.", and the trust line "Tenant-isolated & WCAG 2.2 AA compliant".
  - **Right:** a centred card (`.auth__card`, `max-width: 420px`, or 720px when `wide`) with an h1 title.
- Below 1024px: a single column, with the brand reduced to the wordmark above the card.

**Keep everything** from feature-inventory §1–3:
- **Login:**
  - Prefilled credentials and the Quick Demo Accounts buttons (Employer Admin / Candidate).
  - Sign in with loading state and inline error.
  - The redirect rule (employer → `/`, else `/candidate`).
  - The links to `/register` and `/register/organization`.
- **Register:** the fields, the minimum length, and the redirect to `/candidate`.
- **Register organization** (`wide`):
  - Auth-check gating and the admin account block when signed out.
  - The org fields as a `form-grid` (2 columns ≥720px; Address full width).
  - The success panel ("Application Received" + "Proceed to Sign In").
  - Back/Cancel targets that depend on auth. This fixes G7.

**E2E `e2e/parity/auth.spec.ts`:**

```ts
import { expect, onlyProject, signIn, test } from "../fixtures";
test("login demo accounts and links", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "public");
  await page.goto("/login");
  await expect(page.getByLabel(/Email/)).toHaveValue("ayesha.khan@nut.edu.pk");
  await page.getByRole("button", { name: /Candidate/ }).click();
  await expect(page.getByLabel(/Email/)).toHaveValue("hira.ahmed@gmail.com");
  await expect(page.getByRole("link", { name: /Register Organization/i })).toHaveAttribute("href", "/register/organization");
});
test("org registration fields fit on mobile", async ({ page }, testInfo) => {
  onlyProject(testInfo, "w390");
  await signIn(page, "public");
  await page.goto("/register/organization");
  await expect(page.getByRole("button", { name: /Submit/ })).toBeInViewport({ ratio: 1 }).catch(async () => {
    await page.getByRole("button", { name: /Submit/ }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /Submit/ })).toBeInViewport({ ratio: 1 });
  });
});
```

- [ ] Step 1: parity spec
- [ ] Step 2: `AuthLayout` + three forms restyled
- [ ] Step 3: green (parity, layout `login`, `register`, `register-org`)
- [ ] Step 4: commit `feat(ui): auth layout for login, register and organization onboarding`

---

## Task 17: Cleanup (orphans, GlobalSearch, dead CSS, colour gate)

**Files:** deletions and CSS pruning across `Frontend/`, plus `Frontend/scripts/check-colors.mjs` (new) and a `package.json` script.

- [ ] **Step 1: Delete the orphans** (PRD §9). First confirm each one has no importers: `grep -rn "<name>" Frontend/app Frontend/components Frontend/lib Frontend/tests`. Then:

```bash
git rm Frontend/components/candidate/interview-session.tsx \
       Frontend/components/interviews/voice/DevicePermissionGate.tsx \
       Frontend/components/interviews/voice/ContextBanner.tsx \
       Frontend/components/interviews/voice/AIVisualizer.tsx \
       Frontend/lib/dashboard-data.ts Frontend/lib/persona.ts \
       Frontend/components/dashboard/global-search.tsx
```

  `TranscriptOverlay.tsx` is used only for its exported type. Move that type into `InterviewInterface.tsx` (or a `voice/types.ts`), update the import, and delete the file.

- [ ] **Step 2: Remove dead CSS.**
  - For every class selector in `styles/components.css`, `styles/layout.css`, `styles/utilities.css` and `app/globals.css`, check usage: `grep -rn "<class-without-dot>" Frontend/components Frontend/app --include=*.tsx`.
  - Delete rules whose class is never used.
  - Remove the now-shadowed legacy duplicates of the primitives restyled in Task 3. The `D primitives` section is the single definition; keep only one rule per selector.
  - In `styles/tokens.css`, delete the compatibility aliases (`--color-*`, `--danger-*`, `--surface-raised`, `--surface-muted`, `--text-muted`, `--teal-200`, `--red-200`) that `grep -rn "var(--<name>)" Frontend --include=*.css --include=*.tsx` shows unused.
  - Delete the sidebar tokens (`--surface-sidebar*`, `--sidebar-width`, `--sidebar-collapsed-width`) if nothing references them.

- [ ] **Step 3: Colour gate.** Create `Frontend/scripts/check-colors.mjs`:

```js
// Fails if any component/app TSX hard-codes a colour (PRD §12 dark-mode drift guard).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const roots = ["components", "app"];
const bad = /(#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl)\(|["'`]\s*(?:white|black)\s*["'`])/;
const allow = [/components[\\/]charts[\\/]/]; // charts use var(--viz-*) but keep the door open for documented exceptions
const hits = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (!p.endsWith(".tsx") || allow.some((r) => r.test(p))) return;
  readFileSync(p, "utf8").split("\n").forEach((line, i) => { if (bad.test(line) && !line.includes("color-gate-ignore")) hits.push(`${p}:${i + 1}: ${line.trim()}`); });
});
roots.forEach(walk);
if (hits.length) { console.error("Hard-coded colours found:\n" + hits.join("\n")); process.exit(1); }
console.log("colour gate: ok");
```

  Add the script `"check:colors": "node scripts/check-colors.mjs"`, then run it. Fix every hit by moving the colour into CSS with tokens. The media video tiles may keep a `/* color-gate-ignore */` comment on the line if a dark media surface truly needs it.

- [ ] **Step 4: Run everything.** `npm run typecheck && npm run lint && npm test && npm run build && npm run check:colors`. Expected: all green.

- [ ] **Step 5: Commit** `chore(ui): remove orphaned components, dead CSS and legacy tokens; add colour gate`

---

## Task 18: Full verification and parity sign-off

- [ ] **Step 1: The full Playwright run** (all 5 viewports, both themes). Servers must be running.

```bash
cd Frontend
npx playwright test e2e/layout.spec.ts          # every route × 5 viewports × 2 themes
npx playwright test e2e/parity                  # all parity specs
```

  Expected: **0 failures**. For each failure, fix the CSS or markup (not the rule) and re-run. Only add `data-layout-ignore` to a wrapper if the element is an intentional off-canvas thing (a closed drawer kept in the DOM, for example), and explain why in a comment.

- [ ] **Step 2: Capture screenshots for the user.** Run `npm run e2e:capture`. It writes `e2e/__screens__/{project}/{theme}/{route}.png`. Open a sample (w1280, w390 and dark) and compare with `.scratch/ui-revamp/assets/proto/D_*` and `cand_*`.

- [ ] **Step 3: Parity sign-off.**
  - Copy `.scratch/ui-revamp/feature-inventory.md` to `.scratch/ui-revamp/parity-signoff.md`.
  - Tick every `- [ ]`. Cover each one by a parity spec, a unit test, or a manual check you actually did; next to each, add ` — e2e:<spec>` / ` — unit:<test>` / ` — manual`.
  - Any item you could not verify stays unticked, with a reason.
  - The README-mismatch section becomes "fixed in docs (Task 19)".

- [ ] **Step 4: Final checks.** `npm run typecheck && npm run lint && npm test && npm run build && npm run check:colors`. All green.

- [ ] **Step 5: Commit** `test(e2e): parity specs and sign-off for the UI revamp` (include `parity-signoff.md`; do **not** commit `e2e/__screens__`, which is gitignored).

---

## Task 19: Documentation

**Files:** `design.md`, `Frontend/README.md`, `README.md`.

- [ ] **Step 1: `design.md` → v3.0 (rewrite).** Same section skeleton as v2.0 (Philosophy, Stack, Color, Typography, Spacing/Radii/Elevation, Layout & Responsive, Components, HCI & Accessibility), with the D system content:
  - **Philosophy:** "calm, dense, premium (Ashby/Linear)". Employer compact, candidate comfortable.
  - **Stack:**
    - Load order: `tokens.css` → `theme.css` → `typography.css` → `utilities.css` → `components.css` → `charts.css` → `layout.css` → `styles/screens/*.css` → globals.
    - Semantic tokens first.
  - **Color:** the PRD §4.1 table (both themes) and the chart palette (PRD §4.2), with the validation note and the relief rule.
  - **Typography:** Inter, JetBrains Mono, and the size scale.
  - **Layout:**
    - Shells: the rail, the requisitions panel (Home and Pipeline only, toggle and remembered), the topbar, bottom tabs and More sheet, and the focus layout.
    - The breakpoint table from Global Constraints; height rules (`100dvh`); grid rules.
  - **Components:** the inventory, including the new ones (PageHeader, Switch, Stepper, StatTile, Popover, SegmentedControl, CommandPalette, NotificationsPanel, FocusLayout, and the charts).
  - **Verification:**
    - The 5 viewports × 2 themes.
    - `npm run e2e`, `npm run e2e:layout`, `npm run e2e:capture` and `npm run check:colors`.
    - The 7 must-hold rules.
- [ ] **Step 2: `Frontend/README.md`.**
  - Route map: every route, its persona and its shell type (rail / focus / auth).
  - Shells, the component inventory, and the testing section (Vitest + Playwright commands, how to run with existing servers or `PW_START_SERVERS=1`, and the read-only guard).
  - **Correct the claims that don't match the code**:
    - Job detail has no "matches".
    - Analytics has no "sources" view.
    - Candidate jobs show no match scores.
    - Pipeline keyboard moves use the per-card "Move stage" select, plus drag and drop on the Board.
    - `app/api/interviews/token` returns `{ token, serverUrl }`.
- [ ] **Step 3: Root `README.md`.**
  - Update the frontend overview: the new navigation (rail, ⌘K, notifications, the requisitions panel, the Today dashboard with charts, the pipeline funnel/board/table, the candidate journey, and the focus layout for interviews).
  - Add e2e to the "Running" or "Checks" section.
  - Keep the backend sections unchanged.
- [ ] **Step 4: Proofread.** Check every command in the docs actually runs, and every path exists (`ls` them).
- [ ] **Step 5: Commit** `docs: design.md v3.0 and READMEs for the UI revamp`

---

## Finish

- [ ] **Run everything one last time** from `Frontend/`:
  - `npm run typecheck && npm run lint && npm test && npm run build && npm run check:colors`
  - `npx playwright test --grep-invert @capture`
  - Report the actual output to the user. If anything is red, say so; do not claim success.
- [ ] **Update the Wayfinder map.** Append to `.scratch/ui-revamp/map.md` under "Decisions so far": `- Implementation complete on feat/ui-revamp — see plan.md (all tasks ticked) and parity-signoff.md.`
- [ ] **Merging:** invoke `superpowers:finishing-a-development-branch` to decide how to merge or open a PR. **Do not push or open a PR without the user's go-ahead.** The local branch `prototype/ui-revamp` is throwaway: never merge it. Delete it only if the user asks.

---

## Appendix A: Plan self-review (done by the plan author)

**PRD coverage:**

| PRD section | Covered by |
|---|---|
| §4.1 tokens | Task 2 |
| §4.2 charts | Task 4 |
| §4.3 primitives | Task 3 |
| §5.1 / §5.2 shells | Task 6 |
| §5.1 palette and notifications | Task 5 |
| §5.3 focus | Tasks 6 and 15 |
| §5.4 kept behaviour | Task 6 |
| §6.1 Home | Task 7 |
| §6.1 Pipeline | Task 8 |
| §6.1 Jobs | Task 9 |
| §6.1 Talent, Messages | Task 10 |
| §6.1 Analytics | Task 11 |
| §6.1 Automations, Admin | Task 12 |
| §6.2 candidate | Tasks 13–14 |
| §6.3 media | Task 15 |
| §6.4 public | Task 16 |
| §7 acceptance | Tasks 1 and 18 |
| §8 fixes | 1 → T8, 2 → T10, 3 → T14, 4 → T11, 5 → T8/T12, 6 → T12, 7 → T15, 8 → T12, 9 → T6 |
| §9 cleanup | Task 17 |
| §10 verification | Tasks 1 and 18 |
| §11 docs | Task 19 |

**Known adaptation points** (the executor must check these against the code; each is flagged inline with `>`):
- the drawer and analytics export names;
- `ApiError` constructor arguments;
- `api.post` body requirements;
- the `Drawer` props;
- the Next `devIndicators` option shape;
- the backend database env var name;
- the existing macro-phase mapping in `pipeline-page.tsx`.

**Names used across tasks** (keep them consistent):
- `PageHeader`, `Switch`, `Stepper`, `StatTile`, `Popover`, `SegmentedControl`
- `CommandPalette`, `NotificationsPanel`, `AppShell` (`nav`, `manageNav`, `topbarAction`), `RequisitionsPanel`, `FocusLayout`
- `ChartCard`, `ChartTable`, `FunnelChart`, `StageMixChart`, `TrendColumns`, `ScoreHistogram`, `useChartTooltip`
- `PHASES`, `allCards`, `phaseCards` (`lib/pipeline-phases.ts`)
- `nextStep` (`lib/candidate-next-step.ts`)
- e2e: `signIn`, `readOnly`, `resolveIds`, `onlyProject`, `ROUTES`, `resolvePath`, `detectLayoutIssues`
