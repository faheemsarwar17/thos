# Session handoff: UI revamp + proctoring (written 2026-10-24)

Read this first in a new session. Branch: **`feat/ui-revamp`** (pushed to `origin`). **Never commit or push to `main`.**
The user asked: do the UI plan first, then the proctoring ("tracking") plan, all on this branch, and push to this branch.

## Where things stand

### UI revamp (`.scratch/ui-revamp/plan.md`)
- **Tasks 1–17: DONE and pushed.** Each task is ticked in plan.md, with a `> Note:` under its heading recording any deviations.
- **Task 18 (verification): IN PROGRESS.**
  - A full `npx playwright test --grep-invert @capture` run was started but its results were not collected. **Re-run it**:
    `cd Frontend && npx playwright test --grep-invert @capture --reporter=line` (takes ~25 min).
  - Fix any failures in CSS/markup (not the rules), then rerun.
  - Then do Step 2 (`npm run e2e:capture`, spot-check screenshots), Step 3 (copy `feature-inventory.md` → `.scratch/ui-revamp/parity-signoff.md` and tick every item with `— e2e:<spec>` / `— unit:<test>` / `— manual`), Step 4 (all checks), Step 5 (commit).
  - Per-task runs were all green: layout rules for every route at all 5 viewports × 2 themes, and every parity spec.
- **Task 19 (docs): IN PROGRESS.**
  - `design.md` v3.0 is **written** (committed with this handoff).
  - Still to do: `Frontend/README.md` (route map with shell type rail/focus/auth; shells; components; testing section with `npm run e2e`, `e2e:layout`, `e2e:capture`, `check:colors`, `PW_START_SERVERS=1`, the read-only guard; correct the README claims: job detail has no "matches", analytics has no "sources", candidate jobs show no match scores, pipeline keyboard moves = per-card Move select + board drag-and-drop, `/api/interviews/token` returns `{ token, serverUrl }`), and root `README.md` (frontend overview + e2e commands; backend sections unchanged).
- **Finish section:** run everything, append "Implementation complete on feat/ui-revamp…" to `.scratch/ui-revamp/map.md`.

### Proctoring (`.scratch/proctoring/plan.md`, PRD `prd.md`, `decisions.md`)
- **NOT STARTED.** Read prd.md + plan.md fully (plan is ~1800 lines; tasks 0–18, incl. 7A drawer bug fix).
- **Adaptation already agreed in this session:** Task 0 says "wait until feat/ui-revamp is merged into main, branch feat/proctoring". The user does not want anything on main, so **implement proctoring on `feat/ui-revamp` itself**, on top of the finished revamp. Record this as a `> Note:` under Task 0 and skip the merge/branch checks (the revamp files exist on this branch).
- The plan says "don't push unless asked": the user **has** asked to push to this branch, so push after each task.

## Facts discovered (save time)
- Windows; repo uses CRLF in the working tree (`core.autocrlf=true`). Node edit scripts must normalise `\r\n` → `\n` before string matching. Long heredocs mixed with `node -e '…'` in one Bash call break the shell; write scripts to files instead.
- Servers this session: backend `cd Backend && THOS_DATABASE_PATH=<some scratch path>/e2e.db uv run uvicorn app.main:app --port 8000` (a scratch SQLite DB, so tracked `Backend/data/thos.db` stays clean; `Backend/data/e2e.db` is gitignored if you use that path), frontend `cd Frontend && npm run dev` on :3000. No `Backend/.env` → SQLite, no LiveKit/OpenAI keys (the live interview stage can't be exercised; voice `/start` returns 503).
- Seeded data has **no conversations**; I created one via the API (`GET /conversations/by-application/{id}` + POST a message). A fresh DB needs that again for the desktop messages parity test (it skips otherwise).
- Hira (candidate) is in profile-screening cooldown; `omar.farooq@gmail.com` / `Password123!` reaches the permission → device-check flow.
- **Never run `npm run build` against the dev server's `.next`.** Use `NEXT_DIST_DIR=.next-build npm run build` (next.config reads it), then `git checkout tsconfig.json next-env.d.ts` because the build rewrites them. Never commit `Frontend/tsconfig.tsbuildinfo`.
- Next 15: `devIndicators: false` in next.config (bottom-left covered the rail).
- Lint baseline now: 0 errors, 10 warnings (all pre-existing hook-deps warnings in untouched logic).
- Backend calibration endpoint returns 6.2 / 92.4 / 12, the same numbers the old frontend fallbacks used, so it's likely a backend placeholder. Flag it to the user (out of scope).
- Useful layout: `components/messages/messages-inbox.tsx` is shared by both Messages pages; `lib/pipeline-phases.ts` (`PHASES`, `phaseOf`), `lib/candidate-next-step.ts` (`nextStep`, `sandboxState`, `isTerminal`), `lib/rel-time.ts`; voice transcript type is now `components/interviews/voice/types.ts`.
- `InterviewInterface` takes an optional `title` prop (passed through `LiveKitRoomWrapper` from `voice-portal`). Profile screening is labelled "Skill screening", the applied interview "Job interview".

## Commit convention
Conventional messages ending with:
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```
`git add` only changed files; `git push origin feat/ui-revamp` after each task.
