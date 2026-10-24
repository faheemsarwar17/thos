# Research a Playwright setup for this Next.js app with a real backend

Type: research
Mode: AFK
Status: resolved
Blocked by: —

## Question

How should a Playwright suite be set up in `Frontend/` to (a) authenticate as employer and candidate when sessions live in localStorage (`thos.access_token`, `thos.refresh_token`, `thos.session`) — storageState vs API login, (b) run against the local FastAPI backend with seeded demo data, (c) capture screenshots per route × 5 viewports × 2 themes (`data-theme` / `thos-theme`), and (d) cover routes needing media permissions (voice interview, sandbox) without real devices (fake media flags)? Output: recommended config, folder layout, scripts and caveats for Next 15 / Playwright current version.

## Answer

Full findings: [research-playwright.md](../assets/research-playwright.md) (also on branch `research/playwright-setup`, commit `0a03a71`).

- Suite in `Frontend/e2e/` (exclude from Vitest). Auth by **API login per worker** injected into `storageState` (`thos.*` keys + `thos-theme`) — a shared storageState breaks because refresh tokens are single-use (15-min access tokens); keep one UI-login smoke test.
- `baseURL` must be `http://localhost:3000` (CORS allow-list). Default `reuseExistingServer`; `PW_START_SERVERS=1` starts uvicorn (throwaway SQLite, auto-seeded) + Next `build && start`.
- 5 viewports = projects; light/dark = parametrised describe setting `colorScheme` + `thos-theme`. Routes from a data list (persona, ready-locator, masks); `[attemptId]` resolved from the API.
- `toHaveScreenshot` for regression, `CAPTURE_ONLY=1` for plain review captures. Wait on locators not `networkidle` (3s message polling); `page.clock` + masks for relative times; animations disabled + reducedMotion.
- Media: Chromium fake-device flags + granted permissions; sandbox stubs `getDisplayMedia`/`requestFullscreen` via `addInitScript` and `page.route` mocks for lobby/active. Not automatable: native pickers, real LiveKit/AI voice loop, OS fullscreen. Baselines single-OS; e2e DB separate from tracked `Backend/data/thos.db`.
