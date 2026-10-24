# Session handoff: UI revamp + proctoring (written 2026-10-24)

Read this first in a new session. Branch: **`feat/ui-revamp`** (pushed to `origin`). **Never commit or push to `main`.**
The user asked: do the UI plan first, then the proctoring ("tracking") plan, all on this branch, and push to this branch.

## Where things stand

### UI revamp (`.scratch/ui-revamp/plan.md`)
- **DONE and pushed (Tasks 1–19 + Finish), 2026-10-24.** Everything is ticked in plan.md except "Merging", which is the user's call: no PR has been opened.
- Final results are in the Finish note in plan.md. Parity evidence is in `.scratch/ui-revamp/parity-signoff.md`; the unticked items there need a successful write or a live LiveKit stage.
- Commits this session: `288a15e` (READMEs), `cdb6407` (signoff spec + parity-signoff + Withdraw icon fix + no focus ring on tabindex=-1 panels), plus the Finish bookkeeping commit.

### Proctoring (`.scratch/proctoring/plan.md`, PRD `prd.md`, `decisions.md`)
- **NOT STARTED. ASK THE USER BEFORE STARTING IT** (they asked for this checkpoint on 2026-10-24). Then read prd.md + plan.md fully (plan is ~1800 lines; tasks 0–18, incl. 7A drawer bug fix).
- **Adaptation already agreed in this session:** Task 0 says "wait until feat/ui-revamp is merged into main, branch feat/proctoring". The user does not want anything on main, so **implement proctoring on `feat/ui-revamp` itself**, on top of the finished revamp. Record this as a `> Note:` under Task 0 and skip the merge/branch checks (the revamp files exist on this branch).
- The plan says "don't push unless asked": the user **has** asked to push to this branch, so push after each task.

## Facts discovered (save time)
- Only ever run **one** Playwright run at a time: concurrent runs share `e2e/.results` and clobber each other's traces (ENOENT failures). Check with `Get-CimInstance Win32_Process | ? CommandLine -like '*playwright*test*'`.
- The dev server occasionally stalls or restarts mid-run, giving `ERR_CONNECTION_*` or heading timeouts on whatever routes ran then. Re-run just those routes before treating them as real failures.
- `e2e/parity/signoff.spec.ts` mocks GETs (via `route.fetch()` + `fulfill`) when the seed lacks a state; register the mock **after** `readOnly(page)` so it takes precedence.
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
