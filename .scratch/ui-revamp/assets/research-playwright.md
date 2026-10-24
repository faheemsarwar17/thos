# Research: Playwright suite for `Frontend/` (auth, local backend, screenshot matrix, media routes)

Status: research only, no app code changed. Date: 2026-10-23. Latest `@playwright/test` on npm at time of writing: **1.64.1** (`npm view @playwright/test version`).

Sources are cited inline as [S#]; the list is at the bottom. Repo facts cite file paths.

---

## 0. Repo facts that drive the design

| Fact | Where | Consequence |
| --- | --- | --- |
| Session = 3 localStorage keys `thos.access_token`, `thos.refresh_token`, `thos.session` (JSON `AuthSession`). No cookies. | `Frontend/lib/auth.ts` | `storageState` must carry `origins[].localStorage`, which Playwright supports [S1]. |
| Login: `POST {API}/api/v1/auth/login` `{email,password}` → full `AuthSession` body; frontend `login()` just `saveSession(body)`. | `Frontend/lib/api.ts:157`, `Backend/app/api/v1/auth.py:117` | An API login can produce byte-identical localStorage to a UI login. |
| Access TTL 900 s; refresh tokens are **single-use** (rotated + old one revoked). On a 401 the client refreshes; if refresh fails it calls `clearSession()`. | `Backend/app/core/config.py:66`, `Backend/app/services/auth_tokens.py:89-120`, `Frontend/lib/api.ts:25-57` | A single shared `storageState` file goes bad after 15 min: the first context to refresh revokes the token every other context still holds, which then gets logged out and redirected to `/login`. See section 2. |
| Guard is client-side: `RequireAuth` renders "Checking your session…" then redirects or renders children; employer-only routes bounce candidates to `/candidate`. | `Frontend/components/auth/require-auth.tsx` | No server-side auth, so a navigation needs no cookie, only localStorage present before hydration. |
| CORS allow-list default is `http://localhost:3000,...` (not `127.0.0.1`). | `Backend/app/core/config.py:30`, `Backend/.env.example` | `baseURL` **must** be `http://localhost:3000`, or browser API calls fail CORS. |
| Theme: `ThemeToggle` (mounted only inside `AppShell`) reads `localStorage['thos-theme']` in `useEffect` and sets `<html data-theme>`. With no attribute, `tokens.css` falls back to `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`. No pre-hydration inline script. | `Frontend/components/ui/theme-toggle.tsx`, `Frontend/styles/tokens.css:222-224`, `Frontend/components/layout/app-shell.tsx:248` | Set **both** `thos-theme` in localStorage and `colorScheme` emulation. Then pages without AppShell (`/login`, `/register`) and the pre-hydration frame also render in the right theme. |
| Fonts: `@import url("https://fonts.googleapis.com/css2?family=Poppins…Inter…JetBrains+Mono…&display=swap")`. | `Frontend/styles/typography.css:6` | Needs network. `display=swap` means a fallback-font frame exists, so wait for `document.fonts.ready` (screenshots do this automatically, see section 3). |
| Timers: messages poll every 3 s (`messaging-thread-view.tsx:54`), pipeline timer (`pipeline-page.tsx:204`), `ContextBanner`/`InterviewSetup` intervals, sandbox autosave every 10 s + timer each 1 s. CSS has infinite `spin`/`shimmer` keyframes. | `Frontend/components/**` | Handled by the screenshot auto-stabilisation + `animations:'disabled'`; freeze `Date` with `page.clock` for relative timestamps. |
| Seed data is created with `utc_now()` at first boot, IDs are generated. | `Backend/app/db/seed.py` | Attempt IDs for `/candidate/applied/[id]` and `/candidate/sandbox/[id]` must be discovered at runtime (`GET /api/v1/candidates/me/applications` → `applied_interview.attempt_id`). Relative dates drift run to run unless the clock is frozen. |
| Vitest uses default `include`, which matches `**/*.{test,spec}.?(c|m)[jt]s?(x)`. | `Frontend/vitest.config.ts` | Playwright `*.spec.ts` files would be picked up by `npm test`. Add `exclude: ['e2e/**', ...configDefaults.exclude]` to vitest config when implementing (a tooling change, not app code). |

---

## 1. Recommended layout, scripts, config

### Folder layout (inside `Frontend/`)

```
Frontend/
  playwright.config.ts
  e2e/
    fixtures.ts             # test.extend: persona option, apiSession (worker), storageState (test), theme, freezeClock
    routes.ts               # route manifest: path | resolver, persona, readyLocator, mask[], skip-viewports
    helpers/
      api-login.ts          # POST /api/v1/auth/login via APIRequestContext
      media-stubs.ts        # addInitScript stubs for getDisplayMedia / requestFullscreen (sandbox)
      screenshot.css        # stylePath: hide blinking carets, live timers, toasts
    auth.setup.ts           # optional: UI-login smoke + writes playwright/.auth/*.json
    visual/
      routes.visual.spec.ts # the route × theme matrix (viewports come from projects)
    media/
      interview.spec.ts     # device-check flows with fake media
      sandbox.spec.ts       # lobby → permissions → (stubbed) fullscreen
  playwright/.auth/         # gitignored
  test-results/  playwright-report/   # gitignored
```

The existing `Frontend/tests/` is for Vitest/jsdom, so keep Playwright in `e2e/` to avoid mixing runners.

### npm scripts

```jsonc
"e2e":            "playwright test",
"e2e:ui":         "playwright test --ui",
"e2e:visual":     "playwright test e2e/visual",
"e2e:update":     "playwright test e2e/visual --update-snapshots",
"e2e:capture":    "cross-env CAPTURE_ONLY=1 playwright test e2e/visual",   // plain PNGs, no assertions
"e2e:report":     "playwright show-report",
"e2e:install":    "playwright install chromium"
```

Dev deps: `@playwright/test` (plus `cross-env`, since the repo is developed on Windows).

### `playwright.config.ts` sketch

```ts
import { defineConfig, devices } from '@playwright/test';

const FRONTEND = 'http://localhost:3000';      // must be "localhost": backend CORS allow-list
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const START_SERVERS = process.env.PW_START_SERVERS === '1';

const VIEWPORTS = {
  'd1280': { width: 1280, height: 620 },
  'd1366': { width: 1366, height: 768 },
  'd1536': { width: 1536, height: 730 },
  'd1920': { width: 1920, height: 1080 },
  'm390':  { width: 390,  height: 844 },
} as const;

const fakeMediaArgs = [
  '--use-fake-device-for-media-stream',            // test pattern + beep instead of real devices [S8]
  '--use-fake-ui-for-media-stream',                // auto-accept the permission prompt [S8]
];

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  // One baseline tree, no OS suffix inside the name (we pin the OS by convention, see caveats):
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',        // default already, stated for clarity [S4]
      caret: 'hide',
      maxDiffPixelRatio: 0.01,
      stylePath: './e2e/helpers/screenshot.css',
    },
  },
  use: {
    baseURL: FRONTEND,
    locale: 'en-US',
    timezoneId: 'Asia/Karachi',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: fakeMediaArgs },
    permissions: ['camera', 'microphone'],   // belt-and-braces with the fake-ui flag [S6]
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    ...Object.entries(VIEWPORTS).map(([name, viewport]) => ({
      name,
      testMatch: /visual\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        ...(name === 'm390' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {}),
      },
    })),
    { name: 'media', testMatch: /media\/.*\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: START_SERVERS ? [
    {
      name: 'api',
      command: 'uv run uvicorn app.main:app --port 8000',
      cwd: '../Backend',
      url: `${API}/health/ready`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        // Throwaway SQLite, auto-seeded on boot. Deterministic and leaves the dev Postgres alone.
        THOS_DATABASE_URL: '',
        THOS_DATABASE_PATH: './data/e2e.db',   // delete before each run (globalSetup or script)
        THOS_SEED_DEMO_DATA: 'true',
        THOS_ENVIRONMENT: 'development',
      },
    },
    {
      name: 'web',
      command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
      url: FRONTEND,
      reuseExistingServer: true,
      timeout: 180_000,
      env: { NEXT_PUBLIC_API_URL: API },
    },
  ] : undefined,
});
```

Notes on the config:
- `webServer` accepts an array of servers, each with `command`, `url`, `cwd`, `env`, `reuseExistingServer`, `timeout`, `name` [S3]. `url` readiness accepts 2xx/3xx/4xx [S3]. Backend readiness has its own endpoint, `/health/ready` (root README).
- **(b) Recommendation:** keep `reuseExistingServer: true` and make starting servers opt-in (`PW_START_SERVERS=1`). The default local flow is the README quickstart (Postgres in Docker, `uvicorn --reload`, `npm run dev`) with Playwright attaching to it. For CI or a clean baseline run, set `PW_START_SERVERS=1`, which boots the backend on a fresh SQLite file. The settings code treats an empty `THOS_DATABASE_URL` as unset (`config.py:102-110`) and falls back to `database_path`, and `seed_if_empty` seeds it (`app/main.py:21-24`). Postgres is not needed for screenshots.
- Next.js recommends testing against the production build (`npm run build && npm run start`) "to more closely resemble how your application will behave", with `webServer` as the alternative [S9]. For visual baselines, prefer `build+start`: the dev server can show overlays/indicators and compiles on first hit, so the first visit to each route is slow. Use `next dev` only for quick local iterations.
- `NEXT_PUBLIC_API_URL` is inlined at build time, so it must be set when `next build` runs.

---

## 2. (a) Authentication: UI login vs API login

Playwright's documented pattern: a **setup project** that authenticates and saves `storageState` to `playwright/.auth/<role>.json` (gitignored, since it holds live tokens), with other projects depending on it [S1]. `storageState` persists cookies, **localStorage**, and IndexedDB (sessionStorage is not persisted) [S1][S6]. It documents both UI login and "authenticate via API request" with `request` [S1], plus a **worker-scoped fixture** variant for one account per worker [S1].

| | UI login in setup (`page.fill` → click → `waitForURL('/')` → `context.storageState({path})`) | API login (`request.post('/api/v1/auth/login')` → build storageState object / `addInitScript`) |
| --- | --- | --- |
| Speed | ~2–5 s per role, needs the frontend up | ~100–300 ms, needs only the backend |
| Fidelity | Exercises the real `login()` → `saveSession()` path | Must replicate `saveSession` (3 keys). Trivial, but a contract to keep in sync with `lib/auth.ts` |
| Token expiry (15 min, single-use refresh) | Same problem: one file shared by all contexts | Can mint a fresh session per worker or per test, so the problem goes away |
| Flake surface | Login form, redirects, hydration | Only HTTP |

**Recommendation: API login as the main mechanism, plus one UI-login test as a smoke test.**

1. A worker-scoped fixture `apiSession` logs in through `APIRequestContext` (Node side, so no CORS) for the persona the project/test needs. It caches `{ body, issuedAt }` and re-logs in when the cache is older than about 10 minutes. This avoids the rotation trap from section 0.
2. A test-scoped override of the built-in `storageState` option returns an **object**, not a path:
   ```ts
   storageState: async ({ apiSession, theme }, use) => use({
     cookies: [],
     origins: [{ origin: 'http://localhost:3000', localStorage: [
       { name: 'thos.access_token',  value: apiSession.access_token },
       { name: 'thos.refresh_token', value: apiSession.refresh_token },
       { name: 'thos.session',       value: JSON.stringify(apiSession) },
       { name: 'thos-theme',         value: theme },
     ]}],
   }),
   ```
   With this, localStorage is in place before any app script runs, so `RequireAuth` passes on the first effect. No `addInitScript` is needed, and it avoids `addInitScript`'s re-run-on-every-navigation behaviour (it runs "after the document was created but before any of its scripts", on every navigation and frame [S6]), which would clobber tokens the app had just rotated.
3. Keep `auth.setup.ts` as a **UI login** for each persona: fill `ayesha.khan@nut.edu.pk` / `hira.ahmed@gmail.com`, assert the redirect (`/` vs `/candidate`, per `login-form.tsx:24`), and save to `playwright/.auth/{employer,candidate}.json`. This covers the login UI and leaves files ready for ad-hoc `codegen --load-storage` debugging. The visual suite does not depend on these files for its tokens.
4. Persona selection: a custom fixture option `persona: 'employer' | 'candidate' | 'anon'` (`test.extend` with `{ option: true }` [S10]). Each route in the manifest declares its persona, and the spec calls `test.use({ persona })` inside a `describe` per persona.

Parallel workers using the same account is fine here: login just issues a new token pair per call, and the screenshot suite does not mutate state. The docs' "one account per worker" advice [S1] applies only to tests that change server-side state, such as sending messages or withdrawing applications. Run those serially or against a fresh DB.

---

## 3. (c) Screenshot matrix: 22 routes × 5 viewports × 2 themes

### Projects vs parametrised tests

- **Viewports → projects.** Viewport, `isMobile`, `hasTouch`, and `deviceScaleFactor` are context options and belong in a project's `use` [S5][S7]. Projects give per-viewport filtering (`--project=m390`), per-viewport snapshot folders via `{projectName}` in `snapshotPathTemplate`, and parallelism across workers. "Each project runs your entire test suite once" [S7], so the visual project must `testMatch` only the visual specs.
- **Themes → parametrised `describe` (`for (const theme of ['light','dark'])`).** Test names must be unique [S10], so put the theme in the title. Theme is cheap to switch and is not a browser property. The test sets `test.use({ colorScheme: theme })` (emulates `prefers-color-scheme` [S5]) and the `thos-theme` localStorage entry is injected through the `storageState` fixture above. After navigation, assert `await expect(page.locator('html')).toHaveAttribute('data-theme', theme)` on AppShell routes to prove the theme actually applied.
- **Routes → data-driven loop** over `e2e/routes.ts`. Each entry has `path` (or `resolve(api)` for `[attemptId]`/`[postingId]` routes), `persona`, `ready` locator (for example the page `h1` or a known table row), and optional `mask` (relative times, avatars, live timers).
- Alternative considered: 10 projects (viewport × theme). It works, but doubles the project list and couples theme to a browser context. Parametrising the theme keeps the matrix readable. Either is supported [S10].

Size: about 22 routes × 2 themes = 44 tests per project, × 5 projects = 220 screenshots. Use `fullPage: false` for the stated viewport sizes, plus an optional `fullPage: true` variant for long pages.

### `toHaveScreenshot` vs plain `page.screenshot`

| | `expect(page).toHaveScreenshot()` | `page.screenshot({ path })` |
| --- | --- | --- |
| Purpose | Regression baseline + diff | Review artefacts for the design revamp |
| Stability | Retakes until **two consecutive screenshots match**, then compares [S2][S4] | Single shot |
| Animations default | `'disabled'` [S4] | `'allow'` [S11] |
| Caret default | `'hide'` [S4] | `'hide'` |
| Fonts | Both wait for `document.fonts.ready` before capture (Playwright `screenshotter.ts`) [S11] | same |
| Output | `__screenshots__/…` baselines + diff images in the report | Any path you choose |

**Recommendation:** use one spec with a `CAPTURE_ONLY` switch.
- Default: `await expect(page).toHaveScreenshot(\`${route.slug}-${theme}.png\`, { mask })` for regression.
- `CAPTURE_ONLY=1`: `await page.screenshot({ path: \`.scratch/ui-revamp/shots/${project}/${slug}-${theme}.png\`, animations: 'disabled', mask })` to dump before/after images while the revamp is in flux, when baselines would churn every commit. Pass `animations: 'disabled'` explicitly, because the plain API defaults to `'allow'`.

### Flakiness controls, in order of impact

1. **Readiness, not timeouts.** After `goto`, wait for the route's `ready` locator, and for "Checking your session…" to be gone (`expect(page.getByText('Checking your session')).toHaveCount(0)`). Avoid `networkidle` as a general gate: the 3 s message poll makes it timing-dependent.
2. **Animations:** `animations: 'disabled'` fast-forwards finite CSS animations/transitions and **cancels infinite ones** (the `spin`, `shimmer` keyframes), then restores them afterwards [S11]. Also set `reducedMotion: 'reduce'` in `use` [S5] so JS-driven motion that checks the media query settles too.
3. **Polling (messages every 3 s):** the auto-retry-until-stable loop [S2] tolerates re-renders that produce the same pixels. Same seed data means same pixels. If a poll changes the DOM (new message), that is a real diff. For full determinism, `page.clock.install({ time })` **before** `goto` and then `page.clock.pauseAt(...)`. This controls `setInterval`/`setTimeout`/`Date` [S12]. `install` must precede any other clock call [S12].
4. **Relative timestamps** ("2 minutes ago") drift because the seed uses `utc_now()`. Either freeze `Date` with `page.clock.setFixedTime(...)` [S12] (only shifts relative labels if the anchor is near seed time, so pick "seed time + 1 h" from a backend field) or `mask` those elements. `mask` paints `#FF00FF` boxes [S4]. A `stylePath` CSS that sets `visibility:hidden` on `[data-testid=relative-time]` gives cleaner images, but needs test-ids added later (that is app code, out of scope here).
5. **Fonts (Google Fonts):** screenshot capture already awaits `document.fonts.ready` [S11]. Because of `display=swap`, add `await page.evaluate(() => document.fonts.ready)` before asserting layout-sensitive locators too. For offline/CI determinism, cache the woff2 files once and serve them with `page.route('https://fonts.gstatic.com/**', …)` / `routeFromHAR`. Then a network blip cannot produce fallback-font baselines.
6. **Scrollbars and carets:** `caret: 'hide'` is the default [S4]. Add `::-webkit-scrollbar { display:none }` in `screenshot.css` if scrollbars vary.
7. **Theme first paint:** set both `colorScheme` and `thos-theme` (section 0) so the pre-hydration frame and the post-`useEffect` frame match. Otherwise the stability loop can catch a light→dark flip.
8. **Toasts:** hide `.toast*` via `stylePath`.

---

## 4. (d) Media routes: `/candidate/interview`, `/candidate/applied/[id]`, `/candidate/sandbox/[id]`

### Camera and microphone (`getUserMedia`)

Used in `DevicePermissionGate.tsx:41`, `DeviceCheck.tsx:73`, `PermissionCheck.tsx:18`, `sandbox-portal.tsx:261`, and via LiveKit `createLocalVideoTrack`.

- `--use-fake-device-for-media-stream`: "Use fake device for Media Stream to replace actual camera and microphone" (Chromium `media/base/media_switches.cc`) [S8]. The WebRTC test docs describe it as feeding "a test pattern to getUserMedia() instead of live camera input" [S13]. Audio is a periodic beep, so `AnalyserNode`-driven mic level meters move.
- `--use-fake-ui-for-media-stream`: "Bypass the media stream infobar by selecting the default device for media streams… Works with --use-fake-device-for-media-stream. Prefer --auto-accept-camera-and-microphone-capture which does not interact with screen/tab capture." (Chromium `content/public/common/content_switches.cc`) [S8]. Use `--auto-accept-camera-and-microphone-capture` instead if you want screen capture to stay unaffected.
- Optional deterministic media: `--use-file-for-fake-video-capture=<file.y4m>` and `--use-file-for-fake-audio-capture=<file.wav>` ("Must also be used with … kUseFakeDeviceForMediaStream"; append `%noloop` to stop at the end) [S8]. Use these if the default moving test pattern makes video-preview screenshots unstable. Otherwise **mask the `<video>` element**.
- `context.grantPermissions(['camera','microphone'])` / `use.permissions` is supported, but Playwright warns that permission support "differ[s] between browsers… Any permission may stop working after an update" [S6]. Playwright's own tests note that Chromium needs `--use-fake-device-for-media-stream` for capture, and Firefox has no camera/mic permission mapping [S14]. **Keep media tests Chromium-only.**
- `MediaRecorder` (`DeviceCheck`, `InterviewInterface`, `sandbox-recorder`) works on fake streams in Chromium, so recording UI states can be reached.

### Screen share (`getDisplayMedia`) and fullscreen (sandbox)

- Chromium has `--auto-select-desktop-capture-source=<title>` (for example `"Entire screen"`) and tab-capture auto-select switches for automated tests. They exist in Chromium's desktop-capture code, but I could not pull their definition file at `main` (`chrome/common/chrome_switches.cc` returned 404 from both googlesource and the GitHub mirror). Treat them as **unverified for current Chromium and for headless mode**. In headless there is no real desktop to pick.
- **Recommended:** stub `getDisplayMedia` in `e2e/helpers/media-stubs.ts` with `page.addInitScript` [S6]. Return a `MediaStream` from a `<canvas>.captureStream()`, so the app's `setScreen(stream)` path, preview, and `MediaRecorder` all run. This is deterministic and works headless.
- `requestFullscreen()` (`use-proctoring.ts:99`) needs user activation. Playwright clicks are trusted input, so clicking "Start" provides it. Headless fullscreen behaviour is not something I could confirm from a primary source. To be safe, stub `Element.prototype.requestFullscreen` in the same init script so it resolves and sets a fake `document.fullscreenElement`. **Caution:** `useProctoring` force-submits on `fullscreenchange` with no `fullscreenElement`, and logs violations on `blur`/`visibilitychange`. Never toggle the stub back, and don't switch pages/tabs inside an active sandbox test.
- **Server state:** pressing Start creates an active sandbox attempt, and auto-submit ends it. Hira's seeded sandbox is already evaluated (README: "has an evaluated job interview + sandbox"), so the portal will show `done`. To screenshot `lobby` and `active` without mutating the DB, intercept `GET /api/v1/candidates/me/applied-interviews/{id}/sandbox` with `page.route` and return a fixture body with the needed phase. Otherwise, run against the throwaway SQLite DB from section 1.

### What cannot be automated meaningfully

- The **native permission prompt and screen-picker UI** (browser chrome, not page DOM). Flags/stubs bypass them, but they cannot be screenshotted.
- The **real voice interview loop** (LiveKit room + AI agent STT/TTS). It needs LiveKit + `THOS_AI_API_KEY`. Without them, voice endpoints return 503 (README). Screenshot only the pre-join/device-check/setup states, or mock `/api/interviews/token` and backend voice endpoints. A full conversation is an integration test, not a visual one.
- Real camera framing, echo/noise, OS-level screen recording content, and true OS fullscreen. Behaviour under real tab switching is approximable with `page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))`, but that is a synthetic event.
- Firefox/WebKit parity for media. WebKit has mock capture devices gated on permissions [S14], but the flags above are Chromium-only.

---

## 5. Caveats

1. **Baselines are OS-specific.** "Browser rendering can vary based on the host OS, version, settings, hardware, power source… headless mode" [S2]. The default template also adds a `-{platform}` suffix [S2]. The template above drops the suffix, so **generate and compare baselines on one OS only**: the Playwright Docker image in CI, or a single designated Windows machine. Don't mix.
2. `localhost` vs `127.0.0.1`: see CORS row in section 0.
3. Token TTL and refresh rotation: don't share one `storageState` file across a run longer than 15 min (section 2).
4. Vitest will pick up `e2e/**/*.spec.ts` unless excluded (section 0). Also add `playwright/.auth`, `test-results`, `playwright-report`, `blob-report` to `.gitignore`, and consider excluding `e2e` from the Next `tsconfig` `include` if type-check noise appears.
5. `Backend/data/thos.db` is tracked in git and is currently modified in the main checkout. Point e2e runs at a separate file (`data/e2e.db`, gitignored) so running the suite doesn't dirty the repo.
6. `isMobile` is Chromium-only (Firefox does not support it). Fine, since the suite is Chromium-only.
7. Dynamic route IDs come from `GET /api/v1/candidates/me/applications` (candidate) and the jobs list (employer) at test time, via the persona's `APIRequestContext`. Never hard-code them.

---

## Sources

- [S1] Playwright: Authentication: https://playwright.dev/docs/auth
- [S2] Playwright: Visual comparisons: https://playwright.dev/docs/test-snapshots
- [S3] Playwright: Web server: https://playwright.dev/docs/test-webserver
- [S4] Playwright API: `PageAssertions.toHaveScreenshot` options/defaults: https://playwright.dev/docs/api/class-pageassertions
- [S5] Playwright: Emulation (viewport, colorScheme, reducedMotion, permissions): https://playwright.dev/docs/emulation
- [S6] Playwright API: BrowserContext (`grantPermissions`, `addInitScript`, `storageState`): https://playwright.dev/docs/api/class-browsercontext
- [S7] Playwright: Projects: https://playwright.dev/docs/test-projects
- [S8] Chromium source, switch definitions: `media/base/media_switches.cc` (`use-fake-device-for-media-stream`, `use-file-for-fake-audio-capture`, `use-file-for-fake-video-capture`) and `content/public/common/content_switches.cc` (`use-fake-ui-for-media-stream`, `auto-accept-camera-and-microphone-capture`), fetched from https://chromium.googlesource.com/chromium/src/+/refs/heads/main/
- [S9] Next.js: How to set up Playwright with Next.js (lastUpdated 2026-10-15): https://nextjs.org/docs/app/guides/testing/playwright
- [S10] Playwright: Parameterize tests: https://playwright.dev/docs/test-parameterize
- [S11] Playwright source `packages/playwright-core/src/server/screenshotter.ts` (awaits `document.fonts.ready`; `animations:'disabled'` finishes finite / cancels infinite animations) and `class-page`/`class-locator` screenshot docs (`animations` default `"allow"`), via context7 `/microsoft/playwright`
- [S12] Playwright: Clock: https://playwright.dev/docs/clock
- [S13] WebRTC testing flags: https://webrtc.github.io/webrtc-org/testing/
- [S14] Playwright source `tests/library/permissions.spec.ts` (per-browser camera/mic support comment), via context7 `/microsoft/playwright`
