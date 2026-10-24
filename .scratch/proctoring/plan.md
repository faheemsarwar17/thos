# THOS Interview Proctoring: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax so you can track progress; tick them in this file as you go.

> ## ⛔ HARD PRECONDITION: THE UI REVAMP MUST BE FINISHED FIRST
> This plan runs **only after** `.scratch/ui-revamp/plan.md` is fully implemented and `feat/ui-revamp` is merged into `main`. Task 0 checks this mechanically. **If any check fails, stop and tell the user. Do not start, and do not do the revamp yourself.**
> Reason: the revamp restyles every voice-interview file and freezes its logic. This plan changes that logic on top of the revamped markup. See [prd.md §0](prd.md).

**Goal:** add proctoring to both AI voice interviews (profile screening and the job interview).
- **Gaze** is analysed in the browser (MediaPipe) and enforced: 2 warnings, then the 3rd violation ends and submits the interview with a visible reason.
- **Voice** is analysed on the server (LiveKit audio tap + SpeechBrain ECAPA, with a no-model fallback) and only flags.
- Consent, calibration and voice enrolment happen up front.
- Employers see a timeline with snapshots. The server holds all authority over strikes.
- **Also fixes** the pre-existing crash where the employer application drawer breaks on voice-evaluated interviews (Task 7A).

**Architecture:**
- **Backend:**
  - A pure policy module (`app/proctoring/policy.py`) decides strikes, warnings and termination over a JSON **proctoring record** stored on the attempt row.
  - A service layer persists it atomically, stores snapshots and tells the live `InterviewSession` to pause, resume or terminate.
  - A `VoiceMonitor` taps the candidate's LiveKit audio inside the existing in-process agent.
- **Frontend:**
  - A pure gaze rule engine is fed by a MediaPipe face tracker running on the existing self-view `<video>`.
  - Hooks for focus/tab and AI-turn speech.
  - New consent and calibration steps, a blocking warning modal and a Terminated card, all inside the revamp's `FocusLayout`.

**Tech stack:**
- Next.js 15 / React 19 / TypeScript strict, plain CSS on the revamp tokens, `react-icons/lu`.
- New frontend dependencies: `@mediapipe/tasks-vision@^1.1.1` and `@ricky0123/vad-web@^0.0.31`.
- FastAPI / Python 3.13, raw SQL on SQLite and Postgres, `livekit-agents` 1.x, pytest.
- New **optional** uv dependency group `proctoring-voice`: `speechbrain`, `torch` (CPU), `torchaudio`, `numpy`.

**Spec:** [`prd.md`](prd.md). **Read all of it before Task 1.** Every task implicitly includes the PRD sections it touches. Decisions are in [`decisions.md`](decisions.md) and the research is in [`assets/research-detection.md`](assets/research-detection.md). **Do not re-open decisions.**

---

## 0. START HERE (fresh agent, no prior context)

### 0.1 What this is

THOS is a hiring platform with an AI voice interview. The candidate talks to an AI interviewer over LiveKit; the backend runs an in-process LiveKit agent (`Backend/app/ai/runtime/session.py`). The user asked for **eye-tracking** and **voice-anomaly** proctoring on that interview:
- reading answers from somewhere → 2 warnings, then the 3rd violation pauses and submits the interview, with the stop reason recorded and shown;
- voice anomalies → flagged only.

A planning session locked every decision. **Implement; don't redesign.**

### 0.2 Files to read, in order

| File | Why |
|---|---|
| `.scratch/proctoring/prd.md` | **The spec**: behaviour, data model, API, modules, acceptance |
| `.scratch/proctoring/decisions.md` | Why each choice was made (Q1–Q24) |
| `.scratch/proctoring/assets/research-detection.md` | MediaPipe and ECAPA details, maths for yaw/pitch/iris, LiveKit audio tap, legal notes |
| `.scratch/ui-revamp/prd.md` §5.3, §6.3 and `.scratch/ui-revamp/plan.md` Task 15 | How the voice flow and `FocusLayout` look after the revamp |
| `Backend/app/api/v1/voice_interviews.py` | Voice endpoints. You add proctoring hooks to `/start` and `_session_payload` |
| `Backend/app/ai/runtime/session.py`, `manager.py` | The live interview runtime you extend |
| `Backend/app/services/sandbox.py` (`log_violation`) | The existing violation pattern (dedup, JSON-on-attempt) |
| `Backend/app/services/synthesis_service.py` (`_apply_identity_verdict`) | The pattern for attaching integrity info to the report |
| `Frontend/components/interviews/voice/*` | `voice-portal.tsx` (step machine), `PermissionCheck`, `DeviceCheck`, `InterviewInterface.tsx` (camera at "Publish camera track", identity frame grab, WebSocket switch, mic gating effect, `finalizeInterviewSession`) |
| `Frontend/components/pipeline/application-drawer.tsx` | Job Interview tab. You add the Proctoring panel there |

### 0.3 Environment

- **OS:** Windows 11. Shells: Git Bash and PowerShell 5.1. In Git Bash, prefix commands whose arguments start with `/` with `MSYS_NO_PATHCONV=1`.
- **Branch:** create **`feat/proctoring`** from up-to-date `main` (after the revamp merge). **Never commit to `main`.** Never commit `Backend/data/thos.db` or `Frontend/tsconfig.tsbuildinfo`; leave them unstaged.
- **Servers** (the user usually has them running; check first):
  - Backend: `cd Backend && uv run uvicorn app.main:app --reload --port 8000`
  - Frontend: `cd Frontend && npm run dev` (`http://localhost:3000`)
  - Health: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/docs` and `…:3000/login` should both print `200`.
- **Demo accounts** (password `Password123!`): employer admin `ayesha.khan@nut.edu.pk`, candidate `hira.ahmed@gmail.com`.
- **Checks:**
  - Backend (from `Backend/`): `uv run pytest -q`, `uv run ruff check app tests`
  - Frontend (from `Frontend/`): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run e2e`
- **The real voice interview** needs `THOS_LIVEKIT_*` and `THOS_AI_API_KEY` in `Backend/.env`. Without them, `/voice/start` returns 503. Most tests don't need them; Task 16 is the manual live check.

### 0.4 Ground rules

1. **The server is authoritative.** The browser never decides that a warning or termination happens. It reports events and renders the server's `decision`.
2. **Pure cores, thin shells.** `policy.py`, `voice.py` heuristics, `gaze-engine.ts`, `calibration.ts` and `wav-encoder.ts` contain no I/O and are unit-tested first (TDD: red → green).
3. **Don't regress proctoring-off.** Every new path is gated on `proctoring.enabled`. A job posting with `proctoring_enabled=false` must behave exactly like today. Task 18 checks this.
4. **Change the revamped interview files surgically.** In `InterviewInterface.tsx` and `voice-portal.tsx`:
   - add new hooks, state and JSX;
   - change existing logic **only** where this plan says so (camera-required branch, mic gating condition, WebSocket switch cases, completion screen choice);
   - review your diff.
5. **Styling:** revamp tokens and classes only (`--surface`, `--ink-*`, `--red`, `--amber`, `.fx-card`, `Modal`, `Pill`, `Switch`). No hex colours in `.tsx`. Put new CSS in `Frontend/styles/screens/proctoring.css`, imported where `focus.css` is imported.
6. **Privacy:**
   - never write audio to disk;
   - never log embeddings, snapshots or transcripts (rules.md 2.4);
   - candidate responses use `public_view(record, "candidate")` only.
7. **Commits:** commit at the end of every task, adding only the files you changed. Use conventional messages ending with:
   ```
   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
   Don't push unless the user asks.
8. **Tick boxes** in this file as you complete steps.
9. **If the code differs from this plan** (a renamed prop or moved file, especially after the revamp), adapt to the code, keep the PRD's intent, and add a `> Note:` under the task heading.

### 0.5 Execution order

Tasks run **strictly in order 0 → 18**. Tasks 9 and 10 (pure frontend) may run in parallel with Tasks 5 and 6 (backend runtime and voice) if you use parallel subagents; they touch disjoint files.

| # | Task | Main files |
|---|---|---|
| 0 | Precondition gate + branch | — |
| 1 | Settings, migrations, store plumbing, posting toggle | `core/config.py`, `db/database.py`, `db/store.py`, `api/v1/postings.py` |
| 2 | Pure policy (TDD) | `app/proctoring/{__init__,config,policy}.py`, `tests/test_proctoring_policy.py` |
| 3 | Service: atomic mutate, snapshots, purge, decision dispatch | `app/proctoring/service.py`, `tests/test_proctoring_service.py` |
| 4 | Candidate API + `/voice/start` and payload changes | `app/api/v1/proctoring.py`, `voice_interviews.py`, `router.py`, `tests/test_proctoring_api.py` |
| 5 | Runtime: pause/resume/terminate, pausable timer, heartbeat watchdog | `ai/runtime/session.py`, `manager.py`, `tests/test_proctoring_runtime.py` |
| 6 | Voice: enrolment, monitor, embedders, heuristics | `app/proctoring/{enrolment,voice}.py`, `pyproject.toml`, `tests/test_proctoring_voice.py` |
| 7 | Synthesis summary, employer API, purge loop, demo seed | `synthesis_service.py`, `pipeline.py`, `search.py`, `main.py`, `scripts/seed_proctoring_demo.py` |
| 7A | **Bug fix:** voice-evaluation shape crashes the application drawer | `domain/evaluation.py`, `synthesis_service.py`, `pipeline.py`, `voice_interviews.py`, `candidates.py`, `lib/evaluation.ts`, `application-drawer.tsx` |
| 8 | Frontend dependencies, assets, API client, types | `package.json`, `scripts/copy-proctoring-assets.mjs`, `proctoring-api.ts`, `lib/types.ts` |
| 9 | Pure frontend cores (TDD) | `gaze-engine.ts`, `calibration.ts`, `wav-encoder.ts` + tests |
| 10 | Face tracker + hooks | `face-tracker.ts`, `use-*.ts` |
| 11 | Pre-interview UI: consent, calibration, voice sample | `ConsentStep`, `CalibrationPanel`, `VoiceSamplePanel`, `voice-portal.tsx`, `DeviceCheck.tsx`, `PermissionCheck.tsx` |
| 12 | In-interview integration: camera required, modal, terminated card | `InterviewInterface.tsx`, `ProctoringWarningModal`, `ProctoringTerminatedCard`, `ProctoredChip` |
| 13 | Employer UI: job switch, drawer panel, chips, retake | `jobs/*`, `pipeline/proctoring-panel.tsx`, `pipeline-page.tsx`, `talent/*` |
| 14 | Candidate applications page | `candidate-applications-page.tsx`, `api/v1/jobs.py` |
| 15 | E2E specs | `Frontend/e2e/proctoring/*.spec.ts`, `playwright.config.ts` |
| 16 | Manual live verification + performance note | `.scratch/proctoring/assets/perf-note.md` |
| 17 | Docs and spec amendments | `THOS_Development_Spec.md`, `architecture.md`, `rules.md`, READMEs, `design.md` |
| 18 | Final verification | — |

---

## Task 0: Precondition gate and branch

> Note (2026-10-24): adapted with the user's agreement. The revamp is fully implemented and ticked on `feat/ui-revamp` (`focus-layout.tsx`, `focus.css`, `e2e/fixtures.ts` all present), but the user does not want anything on `main`, so it is **not merged** and proctoring is built **on `feat/ui-revamp` itself** (no `feat/proctoring` branch). The user asked to push after every task, overriding §0.4.7's "don't push".
> Baseline: backend `uv run pytest` 105 passed, 8 skipped; `uv run ruff check app tests` 201 pre-existing errors (176 E501), so the rule is "add none". Frontend typecheck/lint (0 errors, 10 warnings)/36 vitest/build/colour gate/e2e all green (see the revamp plan's Finish note). The backend suite rewrites the tracked `Backend/data/thos.db` on every run: restore it with `git checkout Backend/data/thos.db` and never stage it.

- [x] **Step 1: Check that the revamp is done.** Run from the repo root (Git Bash):

```bash
git fetch origin
git checkout main && git pull --ff-only
test -f Frontend/components/layout/focus-layout.tsx && echo OK-focus || echo MISSING-focus
test -f Frontend/styles/screens/focus.css && echo OK-css || echo MISSING-css
test -f Frontend/e2e/fixtures.ts && echo OK-e2e || echo MISSING-e2e
grep -c -- "- \[ \]" .scratch/ui-revamp/plan.md   # must print 0
git branch -r --merged main | grep -q "feat/ui-revamp" && echo OK-merged || echo NOT-MERGED
```

All of these must hold: `OK-focus`, `OK-css`, `OK-e2e`, `0` unticked boxes, and `OK-merged`. If the revamp branch was squash-merged, `--merged` may not show it; in that case confirm with `git log main --oneline | grep -i "ui-revamp"` and the file checks.

**If anything fails: STOP and report it to the user** with the exact failing checks.

- [x] **Step 2: Branch.** `git checkout -b feat/proctoring` (skipped: stays on `feat/ui-revamp`, see note)
- [x] **Step 3: Baseline.** Run every check in §0.3 and record pass or fail in a note under this task. Pre-existing failures are not yours, but you must not add new ones.

---

## Task 1: Settings, migrations, store plumbing, posting toggle

**Files:**
- Modify: `Backend/app/core/config.py`: add every setting in PRD §9 "New settings", grouped under `# Interview proctoring`.
- Modify: `Backend/app/db/database.py`: append to `_AUTH_COLUMN_MIGRATIONS`:
  ```python
      # Interview proctoring (gaze + voice)
      ("profile_interview_attempts", "proctoring", "TEXT"),
      ("applied_interview_attempts", "proctoring", "TEXT"),
      ("postings", "proctoring_enabled", "INTEGER NOT NULL DEFAULT 1"),
  ```
- Modify: `Backend/app/db/store.py`:
  - add `"proctoring"` to the JSON key tuples in `_attempt_row_to_dict` and `_applied_row_to_dict`;
  - coerce `proctoring_enabled` to bool next to every `sandbox_required` coercion (lines around 1653, 1669 and 1727; grep `sandbox_required`);
  - add:
    ```python
    def get_attempt_proctoring(conn, *, kind: str, attempt_id: str) -> dict | None
    def set_attempt_proctoring(conn, *, kind: str, attempt_id: str, record: dict | None) -> None
    def lock_attempt_row(conn, *, kind: str, attempt_id: str) -> None
    def best_profile_attempt(conn, *, candidate_id: str) -> dict | None
    ```
  - `_ATTEMPT_TABLE = {"profile": "profile_interview_attempts", "applied": "applied_interview_attempts"}`.
  - `lock_attempt_row` runs `SELECT id FROM {table} WHERE id=? FOR UPDATE` on Postgres. On SQLite it runs `BEGIN IMMEDIATE` if no transaction is open. Detect the engine the same way `database.py` does: check whether the connection is `PostgresConnection`.
  - `best_profile_attempt` returns the evaluated attempt with the highest `evaluation.overall_score`, mirroring `best_profile_score`.
- Modify: `Backend/app/api/v1/postings.py`:
  - `_posting_body` gets `"proctoring_enabled": bool(posting.get("proctoring_enabled", True))`;
  - `CreatePostingRequest.proctoring_enabled: bool = True`, stored in `posting`;
  - `UpdatePostingRequest.proctoring_enabled: bool | None = None`, written when not `None` and audited with the other fields.
  - Check `store.create_posting`'s column list and add the column there if the insert is explicit.
- Test: `Backend/tests/test_proctoring_store.py`

- [x] **Step 1: Write the failing tests** `tests/test_proctoring_store.py`:
  - migration adds both `proctoring` columns and `postings.proctoring_enabled` (check with `SELECT proctoring FROM … LIMIT 0`);
  - `set_attempt_proctoring` / `get_attempt_proctoring` round-trip a dict for both kinds;
  - a created posting defaults to `proctoring_enabled == True` in `GET /api/v1/postings/{id}`;
  - `PATCH` with `{"proctoring_enabled": false}` on a draft persists `False`.
  - Reuse the helpers in `tests/test_sandbox.py` (`_create_org_and_workflow`, `_create_posting`). Import them, or copy the minimum into a new `tests/proctoring_helpers.py` that later tasks also use.
- [x] **Step 2:** `uv run pytest tests/test_proctoring_store.py -q`. Expected: FAIL.
- [x] **Step 3:** Implement as listed above.
- [x] **Step 4:** `uv run pytest -q`. Expected: all PASS, including the existing suite.
- [x] **Step 5: Commit**: `feat(proctoring): settings, attempt/posting columns and store helpers`

---

## Task 2: Pure policy (TDD)

**Files:**
- Create: `Backend/app/proctoring/__init__.py` (empty)
- Create: `Backend/app/proctoring/config.py`
- Create: `Backend/app/proctoring/policy.py`
- Test: `Backend/tests/test_proctoring_policy.py`

> Note: `ProctoringConfig` also carries `accommodation_email` (exposed as `accommodationEmail` in `client_view()`), which Task 11 needs for the consent step.

**Interfaces (used by every later backend task):**

```python
# config.py
@dataclass(frozen=True)
class ProctoringConfig:
    max_warnings: int
    strike_cooldown_seconds: float
    flag_dedup_seconds: float
    gaze_sustained_seconds: float
    glance_seconds: float
    glance_count: int
    glance_window_seconds: float
    reading_min_seconds: float
    reading_reversals: int
    face_missing_seconds: float
    multi_face_seconds: float
    multi_face_confidence: float
    question_grace_seconds: float
    ai_speaking_multiplier: float
    tab_hidden_seconds: float
    blur_seconds: float
    heartbeat_interval_seconds: float
    heartbeat_timeout_seconds: float
    envelope_margin_degrees: float
    fallback_yaw_degrees: float
    fallback_pitch_down_degrees: float
    fallback_pitch_up_degrees: float
    calibration_min_presence: float
    policy_version: str

    @classmethod
    def from_settings(cls, settings) -> "ProctoringConfig": ...   # maps proctoring_* fields 1:1
    def client_view(self) -> dict[str, Any]: ...                  # camelCase JSON for the browser (every gaze/focus/heartbeat field + maxWarnings + policyVersion)
```

- [x] **Step 1: Write the failing tests** `tests/test_proctoring_policy.py`:

```python
from datetime import UTC, datetime, timedelta

import pytest

from app.proctoring import policy

T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


def rec():
    return policy.new_record(enabled=True, kind="applied", now=T0)


def apply(r, type_, seconds, **kw):
    return policy.apply_event(
        r, type_=type_, now=T0 + timedelta(seconds=seconds),
        max_warnings=2, cooldown_seconds=20, flag_dedup_seconds=30, **kw,
    )


def ack(r, strike, seconds):
    policy.acknowledge(r, strike=strike, now=T0 + timedelta(seconds=seconds))


def test_two_warnings_then_terminate():
    r = rec()
    d1 = apply(r, "gaze_off_screen_sustained", 0)
    assert (d1.action, d1.strike, d1.counted) == ("warn", 1, True)
    ack(r, 1, 5)
    d2 = apply(r, "tab_hidden", 30)
    assert (d2.action, d2.strike) == ("warn", 2)
    ack(r, 2, 35)
    d3 = apply(r, "face_missing", 60)
    assert (d3.action, d3.strike) == ("terminate", 3)
    assert r["terminated"]["reason"] == "gaze_violation"
    assert [s["type"] for s in r["terminated"]["strikes"]] == [
        "gaze_off_screen_sustained", "tab_hidden", "face_missing"]
    assert policy.outcome(r) == "terminated"


def test_cooldown_and_pending_warning_do_not_count():
    r = rec()
    apply(r, "gaze_reading_pattern", 0)                 # strike 1, warning pending
    d = apply(r, "gaze_repeated_glances", 2)
    assert (d.counted, d.note, d.action) == (False, "warning_pending", "none")
    ack(r, 1, 3)
    d = apply(r, "window_blur", 10)                     # < 20 s after strike 1
    assert (d.counted, d.note) == (False, "cooldown")
    assert r["strikes"] == 1


def test_after_termination_is_ignored():
    r = rec()
    for i, s in enumerate((0, 30, 60), start=1):
        apply(r, "face_missing", s)
        if i < 3:
            ack(r, i, s + 1)
    d = apply(r, "face_missing", 120)
    assert (d.counted, d.note, d.action) == (False, "after_termination", "none")


def test_flags_never_count_and_are_deduped():
    r = rec()
    d = apply(r, "voice_mismatch", 0, metrics={"cosine": 0.1})
    assert (d.action, d.counted) == ("none", False)
    d = apply(r, "voice_mismatch", 10)
    assert d.note == "deduplicated"
    assert sum(e["type"] == "voice_mismatch" for e in r["events"]) == 1
    apply(r, "multiple_faces", 40)
    assert r["strikes"] == 0
    assert policy.outcome(r) == "flagged"


def test_clean_outcome_and_unknown_type():
    r = rec()
    policy.record_session_event(r, type_="consent_given", now=T0)
    assert policy.outcome(r) == "clean"
    with pytest.raises(ValueError):
        apply(r, "made_up", 0)


def test_acknowledge_wrong_strike_raises():
    r = rec()
    apply(r, "tab_hidden", 0)
    with pytest.raises(policy.PolicyError):
        policy.acknowledge(r, strike=2, now=T0)


def test_event_cap_keeps_strikes():
    r = rec()
    apply(r, "tab_hidden", 0)
    for i in range(600):
        policy.record_session_event(r, type_="enrolment_fallback", now=T0 + timedelta(seconds=i))
    assert len(r["events"]) <= policy.MAX_EVENTS
    assert any(e.get("counted") for e in r["events"])


def test_candidate_view_hides_flags_and_events():
    r = rec()
    apply(r, "voice_mismatch", 0)
    apply(r, "tab_hidden", 1)
    r["calibration"] = {"completed_at": "x", "face_presence": 0.9,
                        "envelope": {"yaw": [-10, 10], "pitch": [-8, 8], "iris_h": [0.4, 0.6], "iris_v": [0.4, 0.6]}}
    v = policy.public_view(r, audience="candidate", max_warnings=2)
    assert "events" not in v and "counts" not in v and "outcome" not in v
    assert v["warnings_used"] == 1 and v["pending_warning"]["strike"] == 1
    assert v["envelope"] == {"yaw": [-10, 10], "pitch": [-8, 8], "irisH": [0.4, 0.6], "irisV": [0.4, 0.6]}


def test_employer_view_has_counts_and_outcome():
    r = rec()
    apply(r, "voice_mismatch", 0)
    v = policy.public_view(r, audience="employer", max_warnings=2)
    assert v["outcome"] == "flagged" and v["counts"]["flags"]["voice_mismatch"] == 1


def test_reason_messages_cover_all_violation_types():
    for t in policy.GAZE_VIOLATIONS:
        assert policy.reason_message(t)
```

- [x] **Step 2:** `uv run pytest tests/test_proctoring_policy.py -q`. Expected: FAIL (module missing).

- [x] **Step 3: Implement `app/proctoring/policy.py`**

```python
"""Pure proctoring policy: strikes, warnings, termination, views. No I/O.

The record is a plain dict stored as JSON on the attempt row (PRD §6).
Functions mutate the record passed in; callers persist it.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

RECORD_VERSION = 1
MAX_EVENTS = 500
TERMINATION_REASON = "gaze_violation"

GAZE_VIOLATIONS: frozenset[str] = frozenset({
    "gaze_off_screen_sustained", "gaze_repeated_glances", "gaze_reading_pattern",
    "face_missing", "tab_hidden", "window_blur", "detector_heartbeat_lost",
})
FLAGS: frozenset[str] = frozenset({
    "multiple_faces", "voice_mismatch", "second_voice", "whisper_background",
    "tts_cadence", "speech_during_ai_turn",
})
SESSION_EVENTS: frozenset[str] = frozenset({
    "consent_given", "calibration_completed", "enrolment_completed", "enrolment_fallback",
    "warning_acknowledged", "candidate_disconnected", "terminated", "voice_model_unavailable",
})
# Types a browser may POST (server-only types are rejected at the API layer).
BROWSER_EVENT_TYPES: frozenset[str] = (GAZE_VIOLATIONS - {"detector_heartbeat_lost"}) | {
    "multiple_faces", "speech_during_ai_turn",
}

_MESSAGES = {
    "gaze_off_screen_sustained": "You looked away from the screen for too long.",
    "gaze_repeated_glances": "You repeatedly looked at the same place away from the screen.",
    "gaze_reading_pattern": "It looked like you were reading from somewhere off the screen.",
    "face_missing": "Your face was not visible to the camera.",
    "tab_hidden": "You left the interview tab.",
    "window_blur": "You switched to another window.",
    "detector_heartbeat_lost": "Proctoring stopped responding in your browser.",
}

Action = Literal["none", "warn", "terminate"]


class PolicyError(ValueError):
    """Invalid transition (e.g. acknowledging a warning that is not pending)."""


@dataclass(frozen=True)
class Decision:
    action: Action
    counted: bool
    strike: int | None
    event_id: str | None
    note: str | None
    warnings_used: int


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _parse(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def family_of(type_: str) -> str:
    if type_ in GAZE_VIOLATIONS:
        return "gaze"
    if type_ == "multiple_faces":
        return "gaze"
    if type_ in FLAGS:
        return "voice"
    if type_ in SESSION_EVENTS:
        return "session"
    raise ValueError(f"unknown proctoring event type: {type_}")


def new_record(*, enabled: bool, kind: str, now: datetime) -> dict[str, Any]:
    return {
        "version": RECORD_VERSION,
        "enabled": enabled,
        "kind": kind,
        "started_at": _iso(now),
        "consent": None,
        "calibration": None,
        "strikes": 0,
        "last_strike_at": None,
        "pending_warning": None,
        "terminated": None,
        "heartbeat_at": None,
        "voice": {"enrolled": False, "source": None, "model": None},
        "events": [],
        "history": [],
    }


def _new_event_id() -> str:
    return f"pev_{secrets.token_hex(8)}"


def _append(record: dict[str, Any], event: dict[str, Any]) -> None:
    events = record.setdefault("events", [])
    events.append(event)
    if len(events) > MAX_EVENTS:
        # Drop oldest session events first, then oldest uncounted; never counted strikes.
        for predicate in (
            lambda e: e.get("family") == "session",
            lambda e: not e.get("counted"),
        ):
            while len(events) > MAX_EVENTS:
                idx = next((i for i, e in enumerate(events) if predicate(e)), None)
                if idx is None:
                    break
                events.pop(idx)


def record_session_event(
    record: dict[str, Any], *, type_: str, now: datetime, metrics: dict[str, Any] | None = None
) -> dict[str, Any]:
    if type_ not in SESSION_EVENTS:
        raise ValueError(f"not a session event: {type_}")
    event = {"id": _new_event_id(), "family": "session", "type": type_, "at": _iso(now),
             "counted": False, "strike": None, "note": None, "metrics": metrics or {},
             "snapshot": None}
    _append(record, event)
    return event


def _warnings_used(record: dict[str, Any], max_warnings: int) -> int:
    return min(int(record.get("strikes") or 0), max_warnings)


def apply_event(
    record: dict[str, Any],
    *,
    type_: str,
    now: datetime,
    max_warnings: int,
    cooldown_seconds: float,
    flag_dedup_seconds: float,
    metrics: dict[str, Any] | None = None,
    snapshot: str | None = None,
    event_id: str | None = None,
) -> Decision:
    family = family_of(type_)
    if family == "session":
        raise ValueError("use record_session_event for session events")
    event = {"id": event_id or _new_event_id(), "family": family, "type": type_,
             "at": _iso(now), "counted": False, "strike": None, "note": None,
             "metrics": metrics or {}, "snapshot": snapshot}
    used = _warnings_used(record, max_warnings)

    if type_ not in GAZE_VIOLATIONS:  # flags
        for past in reversed(record.get("events", [])):
            if past.get("type") != type_:
                continue
            at = _parse(past.get("at"))
            if at and (now - at).total_seconds() < flag_dedup_seconds:
                return Decision("none", False, None, None, "deduplicated", used)
            break
        _append(record, event)
        return Decision("none", False, None, event["id"], None, used)

    note: str | None = None
    if record.get("terminated"):
        note = "after_termination"
    elif record.get("pending_warning"):
        note = "warning_pending"
    else:
        last = _parse(record.get("last_strike_at"))
        if last and (now - last).total_seconds() < cooldown_seconds:
            note = "cooldown"
    if note:
        event["note"] = note
        _append(record, event)
        return Decision("none", False, None, event["id"], note, used)

    strikes = int(record.get("strikes") or 0) + 1
    record["strikes"] = strikes
    record["last_strike_at"] = _iso(now)
    event.update(counted=True, strike=strikes)
    _append(record, event)
    if strikes <= max_warnings:
        record["pending_warning"] = {"strike": strikes, "event_id": event["id"], "at": _iso(now)}
        return Decision("warn", True, strikes, event["id"], None, _warnings_used(record, max_warnings))
    counted = [e for e in record["events"] if e.get("counted")]
    record["terminated"] = {
        "reason": TERMINATION_REASON,
        "at": _iso(now),
        "event_id": event["id"],
        "strike": strikes,
        "strikes": [{"type": e["type"], "at": e["at"], "event_id": e["id"]} for e in counted],
    }
    record_session_event(record, type_="terminated", now=now, metrics={"strikes": strikes})
    return Decision("terminate", True, strikes, event["id"], None, max_warnings)


def acknowledge(record: dict[str, Any], *, strike: int, now: datetime) -> None:
    pending = record.get("pending_warning")
    if not pending or int(pending.get("strike", -1)) != int(strike):
        raise PolicyError("no matching pending warning")
    record["pending_warning"] = None
    record_session_event(record, type_="warning_acknowledged", now=now, metrics={"strike": strike})


def heartbeat(record: dict[str, Any], *, now: datetime) -> None:
    record["heartbeat_at"] = _iso(now)


def outcome(record: dict[str, Any] | None) -> str | None:
    if not record or not record.get("enabled"):
        return None
    if record.get("terminated"):
        return "terminated"
    if int(record.get("strikes") or 0) > 0:
        return "flagged"
    if any(e.get("type") in FLAGS for e in record.get("events", [])):
        return "flagged"
    return "clean"


def reason_message(code: str) -> str:
    return _MESSAGES.get(code, "A proctoring rule was triggered.")


def termination_message(record: dict[str, Any]) -> str | None:
    term = record.get("terminated")
    if not term:
        return None
    parts = [reason_message(s["type"]) for s in term.get("strikes", [])]
    return f"{len(parts)} proctoring violations: " + " ".join(parts)


def public_view(record: dict[str, Any] | None, *, audience: str, max_warnings: int) -> dict[str, Any] | None:
    if record is None:
        return None
    base = {
        "enabled": bool(record.get("enabled")),
        "max_warnings": max_warnings,
        "warnings_used": _warnings_used(record, max_warnings),
        "pending_warning": record.get("pending_warning"),
        "terminated": (
            {
                "reason_code": record["terminated"]["reason"],
                "message": termination_message(record),
                "at": record["terminated"]["at"],
                "strikes": [
                    {"type": s["type"], "at": s["at"], "message": reason_message(s["type"])}
                    for s in record["terminated"].get("strikes", [])
                ],
            }
            if record.get("terminated")
            else None
        ),
    }
    if audience == "candidate":
        calibration = record.get("calibration") or {}
        env = calibration.get("envelope")
        base["consent_given"] = bool(record.get("consent"))
        base["calibrated"] = bool(calibration)
        base["envelope"] = (
            {"yaw": env["yaw"], "pitch": env["pitch"], "irisH": env["iris_h"], "irisV": env["iris_v"]}
            if env else None
        )
        return base
    flags: dict[str, int] = {}
    for e in record.get("events", []):
        if e.get("type") in FLAGS:
            flags[e["type"]] = flags.get(e["type"], 0) + 1
    return {
        **base,
        "outcome": outcome(record),
        "strikes": int(record.get("strikes") or 0),
        "counts": {"strikes": int(record.get("strikes") or 0), "flags": flags},
        "consent": record.get("consent"),
        "calibration": (
            {"completed_at": record["calibration"].get("completed_at"),
             "face_presence": record["calibration"].get("face_presence")}
            if record.get("calibration") else None
        ),
        "voice": record.get("voice"),
        "events": [
            {k: e.get(k) for k in ("id", "family", "type", "at", "counted", "strike", "note",
                                   "metrics", "snapshot", "snapshot_purged")}
            | {"label": reason_message(e["type"]) if e["type"] in GAZE_VIOLATIONS else e["type"]}
            for e in record.get("events", [])
        ],
        "history_count": len(record.get("history") or []),
    }
```

- [x] **Step 4: Implement `config.py`** as in the interface block. `client_view()` returns camelCase keys: `sustainedS, glanceS, glanceCount, glanceWindowS, readingMinS, readingReversals, faceMissingS, multiFaceS, multiFaceConfidence, questionGraceS, aiSpeakingMultiplier, tabHiddenS, blurS, heartbeatIntervalS, envelopeMarginDeg, fallbackYawDeg, fallbackPitchDownDeg, fallbackPitchUpDeg, calibrationMinPresence, maxWarnings, policyVersion`. Add a test that `ProctoringConfig.from_settings(Settings())` reads `gaze_sustained_seconds == 10.0`.
- [x] **Step 5:** `uv run pytest tests/test_proctoring_policy.py -q`. Expected: PASS. Then `uv run ruff check app/proctoring tests/test_proctoring_policy.py`.
- [x] **Step 6: Commit**: `feat(proctoring): pure strike/warning/termination policy`

---

## Task 3: Service: atomic mutate, snapshots, purge, decision dispatch

**Files:**
- Create: `Backend/app/proctoring/service.py`
- Test: `Backend/tests/test_proctoring_service.py`

> Note: the image decoder moved to `identity.decode_data_url_image`, which raises `ValueError` with a user-facing message; `voice_interviews._decode_live_image` wraps it in the same 422 `invalid_image` as before. Snapshots are also checked for the JPEG magic bytes, and `service.delete_snapshot` exists for the dedup clean-up in Task 4. Async tests use `asyncio.run` inside sync tests, matching the existing suite.

**Interfaces:**

```python
def mutate(conn, *, kind: str, attempt_id: str, fn: Callable[[dict], T]) -> tuple[dict, T]:
    """lock row → load record (create via new_record(enabled=False) if None) → fn(record) → save → return (record, result).
    Caller commits."""

def ensure_record(conn, *, kind, attempt_id, enabled: bool, now) -> dict   # used by /start (freezes enabled)
def save_snapshot(settings, *, attempt_id: str, event_id: str, data_url: str) -> str   # returns file name
def read_snapshot(settings, *, attempt_id: str, file_name: str) -> bytes | None
def delete_attempt_snapshots(settings, *, attempt_id: str) -> None
def purge_expired_snapshots(conn, settings, *, now: datetime) -> int     # returns files removed
async def dispatch_decision(*, conn, settings, kind, attempt_id, decision: policy.Decision, record: dict) -> None
```

**`dispatch_decision` behaviour (PRD §5.5 and §5.6):**
- `warn`:
  - `await interview_manager.pause_for_proctoring(attempt_id)`. Task 5 adds it; until then it is a stub that returns False.
  - Send WebSocket `proctoring_warning` via `get_websocket_manager().send_message(attempt_id, {"type": "proctoring_warning", "content": {"strike", "max_warnings", "reason_code", "message"}})`.
- `terminate`:
  - `handled = await interview_manager.terminate_for_proctoring(attempt_id, reason=...)`.
  - If not handled (no live session), mark the attempt `submitted` via `store.update_*_interview_voice(..., status="submitted")`, commit, and `await synthesis_service.analyze_interview(attempt_id)` (the same as `/complete`).
  - Always send WebSocket `proctoring_terminated {reason_code, message}`.

**Snapshot rules:**
- Accept only `data:image/jpeg;base64,…`. Reuse `_decode_live_image` logic: move it into `app/services/identity.py` as `decode_data_url_image(raw, allowed={"image/jpeg"})` and make `voice_interviews.py` call the moved helper.
- Max `proctoring_snapshot_max_bytes`. Write to `Path(snapshots_dir)/attempt_id/f"{event_id}.jpg"`.
- `event_id` must match `^pev_[0-9a-f]{16}$`. Reject anything else, so path traversal is impossible.
- `purge_expired_snapshots`:
  - walk `snapshots_dir`; for files whose `mtime` is older than the retention period, delete them;
  - update the matching event (`snapshot=None, snapshot_purged=True`) in the owning attempt's record. Find the kind by trying applied first, then profile.

- [x] **Step 1: Failing tests:**
  - `mutate` creates a record on first use and persists changes (both kinds);
  - two sequential `mutate` calls see each other's writes;
  - `save_snapshot` rejects PNG, oversize data and a bad `event_id`, and writes a valid JPEG. Use a tiny valid JPEG: the bytes `b"\xff\xd8\xff\xe0" + b"\x00" * 64 + b"\xff\xd9"` base64-encoded.
  - `purge_expired_snapshots` with `now = file mtime + 181 days` removes the file and flags the event;
  - `dispatch_decision("terminate")` with no live session sets status `submitted`, then `evaluated` (monkeypatch `synthesis_service.analyze_interview` with an async stub that records the call);
  - `dispatch_decision("warn")` calls the manager (monkeypatched) and sends a WebSocket message (monkeypatch `get_websocket_manager().send_message`).
- [x] **Step 2:** Run. Expected: FAIL.
- [x] **Step 3:** Implement. Add stubs to `manager.py` now so the imports resolve:
  ```python
  async def pause_for_proctoring(session_id: str) -> bool: return False
  async def resume_after_proctoring(session_id: str) -> bool: return False
  async def terminate_for_proctoring(session_id: str, *, reason: str) -> bool: return False
  ```
  Task 5 fills them in.
- [x] **Step 4:** `uv run pytest -q`. Expected: PASS.
- [x] **Step 5: Commit**: `feat(proctoring): record persistence, snapshots, purge and decision dispatch`

---

## Task 4: Candidate API, plus `/voice/start` and payload changes

**Files:**
- Create: `Backend/app/api/v1/proctoring.py`
- Modify: `Backend/app/api/v1/router.py` (include the router after `voice_interviews_router`)
- Modify: `Backend/app/api/v1/voice_interviews.py`
- Test: `Backend/tests/test_proctoring_api.py`

**Routes:** PRD §7 candidate table, for **both** kinds. Write one internal implementation per route that takes `kind`, plus two thin decorated wrappers (the same style as `voice_interviews.py`). Shared helpers:

```python
def _load(conn, ctx, kind, attempt_id) -> dict      # voice.load_profile_attempt / load_applied_attempt
def _enabled_for(conn, attempt, kind) -> bool       # record.enabled if record exists and started; else profile→True; applied→posting.proctoring_enabled
def _cfg(settings) -> ProctoringConfig
```

**Rules:**
- `GET …/proctoring` returns:
  ```python
  {"enabled": _enabled_for(...), "config": cfg.client_view(),
   "consent_required": enabled and not record.consent,
   "calibration_required": enabled and not record.calibration,
   **policy.public_view(record, audience="candidate", max_warnings=cfg.max_warnings)}
  ```
  When there is no record yet, use `pending_warning=None`, `warnings_used=0` and `terminated=None`.
- `POST /consent`:
  - validate `accepted is True`, `signature_name.strip()` with 2–120 characters, and `policy_version == cfg.policy_version` (otherwise 422 `stale_policy`);
  - `mutate` → `record["consent"] = {...}` plus `record_session_event("consent_given")`.
  - The `user_agent` comes from the request header and is truncated to 300 characters.
- `POST /calibration`: Pydantic model `{envelope: {yaw: [float, float], pitch: [...], iris_h: [...], iris_v: [...]}, face_presence: float}`. Each pair must satisfy `lo <= hi`, and the angles must be within ±90. If `face_presence < cfg.calibration_min_presence`, return 422 `calibration_failed`. Then store it and record `calibration_completed`.
- `POST /events`:
  - `type` must be in `policy.BROWSER_EVENT_TYPES`, otherwise 422;
  - the attempt status must be `in_progress` (409 `attempt_not_active`) and the record must be enabled (409 `proctoring_disabled`);
  - snapshot: only when `kind == "applied"` (422 `snapshot_not_allowed` for profile) and only for `family == "gaze"` events;
  - **flow:**
    1. generate `event_id` first;
    2. save the snapshot file (if any);
    3. `mutate(fn=lambda r: policy.apply_event(r, type_=..., event_id=event_id, snapshot=file, metrics={**metrics, "client_ts": client_ts}, ...))`;
    4. if the event was not appended (`decision.event_id is None`, i.e. deduplicated), delete the saved file;
    5. `conn.commit()`, then `await service.dispatch_decision(...)`.
  - **Response:** `{decision: d.action, strike: d.strike, counted: d.counted, warnings_used: d.warnings_used, message: policy.reason_message(type)}`.
  - `metrics` is a dict of str to number, string or bool, with max 30 keys and values ≤ 200 characters. Reject anything else with 422.
- `POST /acknowledge`: `mutate(policy.acknowledge)` (`PolicyError` → 409 `no_pending_warning`), commit, then `await interview_manager.resume_after_proctoring(attempt_id)`, and send WebSocket `proctoring_resumed {}`.
- `POST /heartbeat`: `mutate(policy.heartbeat)` and return `{ok, pending_warning, terminated}` (candidate view).
- `POST /enrolment`: implemented in Task 6. Register the route now and return `{"enrolled": False}`.

**Changes in `voice_interviews.py`:**
- In both `start_*_voice`, after the `evaluated` check:
  ```python
  enabled = proctoring_api.enabled_for(conn, attempt, kind)
  record = proctoring_service.ensure_record(conn, kind=kind, attempt_id=attempt_id, enabled=enabled, now=utc_now())
  if record.get("terminated"):
      raise ApiError(code="proctoring_terminated", message="This interview was ended by proctoring.", status_code=409)
  if enabled and (not record.get("consent") or not record.get("calibration")):
      raise ApiError(code="proctoring_setup_incomplete", message="Complete the proctoring consent and calibration first.", status_code=409)
  config["proctoring_enabled"] = enabled
  ```
  `ensure_record` sets `enabled` only when the record has never been started (`record["started_at_interview"]` is unset). It then stamps `started_at_interview`, so the value is frozen at the first start.
- `_session_payload` adds:
  ```python
  "proctoring": {"enabled": bool((attempt.get("proctoring") or {}).get("enabled")),
                 "terminated": policy.public_view(attempt.get("proctoring"), audience="candidate", max_warnings=2)["terminated"] if attempt.get("proctoring") else None}
  ```
  For an applied attempt that has never started, `enabled` comes from the posting (use `enabled_for`). The `max_warnings` value comes from settings: read `get_settings()`.

- [ ] **Step 1: Failing tests** `tests/test_proctoring_api.py`. Use the profile-attempt flow, because profile attempts are created `in_progress` and need no LiveKit; log in as the demo-style candidate the way `test_profile_interview.py` does.
  - `GET` before consent: `consent_required` and `calibration_required` are both true.
  - `consent` → `calibration` → `GET` shows both false.
  - **Strike flow with cooldown 0** (override settings: `settings.proctoring_strike_cooldown_seconds = 0` via the fixture):
    - event 1 → `warn`;
    - event 2 before acknowledging → uncounted;
    - `acknowledge` → ok;
    - event 2 → `warn`;
    - `acknowledge`;
    - event 3 → `terminate`;
    - the attempt status is now `submitted` or `evaluated`. `analyze_interview` runs without an AI key, so check the insufficient-report path or monkeypatch it.
  - `POST /voice/start` on the terminated attempt → 409 `proctoring_terminated`. `/start` first calls `ensure_voice_ready`; monkeypatch it to a no-op so you reach the check.
  - `/start` with proctoring enabled but no consent → 409 `proctoring_setup_incomplete`.
  - A snapshot on a profile event → 422.
  - A `voice_mismatch` POSTed by the browser → 422 (server-only type).
  - Another candidate's attempt id → 404.
  - The candidate `GET` never contains `"events"` or `"counts"`.
  - **Applied job with `proctoring_enabled=false`:** `GET` → `enabled: false`; `/events` → 409 `proctoring_disabled`; `/start` (with `ensure_voice_ready` and `start_voice_session` monkeypatched) succeeds without consent.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `uv run pytest -q` and `uv run ruff check app tests`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(proctoring): candidate proctoring API and start gating`

---

## Task 5: Runtime: pause, resume, terminate, pausable timer, heartbeat watchdog

**Files:**
- Modify: `Backend/app/ai/runtime/session.py`
- Modify: `Backend/app/ai/runtime/manager.py`
- Test: `Backend/tests/test_proctoring_runtime.py`

**Changes to `InterviewSession`:**

1. **New state in `__init__`:**
   ```python
   self.proctoring_enabled = bool(config.get("proctoring_enabled"))
   self._paused = False
   self._deadline_remaining: float | None = None
   self._timer_started_at: float | None = None
   self._last_agent_text = ""
   self._candidate_connected = False
   self._watchdog_task = None
   self._voice_monitor = None
   ```
2. **Pausable timer.** Replace `_duration_timer(seconds)` usage with `_start_timer(seconds)`, `_pause_timer()` and `_resume_timer()`:
   - `_start_timer` stores `self._deadline_remaining = seconds` and `self._timer_started_at = loop.time()`, then spawns `_duration_timer(seconds)`.
   - `_pause_timer` cancels `_timer_task` and sets `_deadline_remaining -= loop.time() - _timer_started_at`.
   - `_resume_timer` respawns `_duration_timer(max(1, _deadline_remaining))`.
   - `_duration_timer` keeps its `reason="time_limit"` behaviour.
3. **`_last_agent_text`.** In `_wire_events._on_item`, when `speaker == "agent"`, set `self._last_agent_text = text`.
4. **`async def pause_for_proctoring(self) -> None`:**
   - return if `_completed` or `_paused`;
   - set `_paused = True`;
   - `_pause_timer()`;
   - `with contextlib.suppress(Exception): self.agent_session.interrupt()`;
   - `with contextlib.suppress(Exception): self.agent_session.input.set_audio_enabled(False)`. Check the installed livekit-agents API with `uv run python -c "import livekit.agents as a, inspect; print(inspect.signature(a.AgentSession.interrupt))"`. If `input.set_audio_enabled` doesn't exist, skip it and rely on client mic gating (note it).
5. **`async def resume_after_proctoring(self) -> None`:**
   - return if not `_paused` or `_completed`;
   - set `_paused = False`;
   - re-enable audio input;
   - `_resume_timer()`;
   - `self.agent_session.say("Thanks. Let's continue. " + self._last_agent_text, allow_interruptions=True)` if `_last_agent_text`, otherwise `"Thanks. Let's continue."`.
6. **`async def terminate_for_proctoring(self, reason: str) -> None`:** the same as `_finish`, but with **no closing utterance**.
   - Refactor `_finish(self, *, reason, speak_closing=True)` and call `_finish(reason="proctoring_terminated", speak_closing=False)`.
   - Interrupt speech first.
   - Everything else is unchanged: flush assessments, `_send_completed`, `_schedule_analysis`.
7. **Candidate presence.** In `start()` after `room.connect`:
   - register `room.on("participant_connected")` and `room.on("participant_disconnected")` handlers that set `_candidate_connected` for identities starting with `candidate-`;
   - initialise it from `room.remote_participants`;
   - on disconnect while proctoring is enabled, spawn `service`-level recording of the `candidate_disconnected` session event (use a new `connect()` connection, the same as the `_persist_plan` pattern).
8. **Heartbeat watchdog.** When `proctoring_enabled`, spawn `_heartbeat_watchdog()` after `_started_ok = True`:
   ```python
   async def _heartbeat_watchdog(self) -> None:
       cfg = ProctoringConfig.from_settings(self.settings)
       lost_since_flagged = False
       while not self._completed:
           await asyncio.sleep(cfg.heartbeat_interval_seconds)
           if self._paused or not self._candidate_connected:
               continue
           record = proctoring_store_load(...)  # store.get_attempt_proctoring via connect()
           hb = policy._parse((record or {}).get("heartbeat_at"))
           stale = hb is None or (now - hb).total_seconds() >= cfg.heartbeat_timeout_seconds
           if stale and not lost_since_flagged:
               lost_since_flagged = True
               await proctoring_service.record_server_violation(self.settings, kind=self.kind,
                   attempt_id=self.attempt_id, type_="detector_heartbeat_lost",
                   metrics={"last_heartbeat": (record or {}).get("heartbeat_at")})
           elif not stale:
               lost_since_flagged = False
   ```
   Add `record_server_violation(settings, *, kind, attempt_id, type_, metrics)` to `service.py`. It opens its own connection, mutates, commits and dispatches. Server-originated violations and flags (the watchdog in this task, the voice monitor in Task 6) share it, under the name `record_server_event`.
   - The watchdog's first check happens only after the first `heartbeat_timeout_seconds` since the interview became ready, so a slow first heartbeat isn't punished.
9. **`stop()`:** cancel the watchdog and stop the voice monitor (Task 6).

**`manager.py`:** replace the stubs with:
```python
async def pause_for_proctoring(session_id: str) -> bool:
    s = get_session(session_id)
    if s is None or not s.has_started: return False
    await s.pause_for_proctoring(); return True
# same shape for resume_after_proctoring / terminate_for_proctoring(session_id, *, reason)
```

**WebSocket (client contract).** The new message types `proctoring_warning`, `proctoring_resumed` and `proctoring_terminated` are sent from `service.dispatch_decision` and the acknowledge route. The session's own `interview_completed` keeps `reason: "proctoring_terminated"`.

- [ ] **Step 1: Failing tests** `tests/test_proctoring_runtime.py`. These are unit tests with fakes; no LiveKit is needed.
  - Build an `InterviewSession` with a fake `agent_session` (an object with `interrupt()`, `say()` returning a handle with `async wait_for_playout()`, `input.set_audio_enabled()`), `config={"proctoring_enabled": True}` and the `settings` fixture.
  - Monkeypatch `_send_completed` and `_schedule_analysis` to record calls.
  - **Timer:** with `asyncio`'s loop time faked by monkeypatching `self._now_loop = lambda: t[0]`, start 600 s, advance 100, pause, advance 1000 (no fire), resume → remaining ≈ 500.
  - **resume:** says `"Thanks. Let's continue. <last agent text>"`.
  - **terminate:** never calls `say`, calls `_send_completed("proctoring_terminated")` once, and a second call is a no-op.
  - **manager:** with no session, every function returns False.
  - **watchdog:** with `heartbeat_timeout_seconds=0.05`, `heartbeat_interval_seconds=0.01`, `_candidate_connected=True` and no heartbeat, `record_server_violation` (monkeypatched) is called **once** with `detector_heartbeat_lost`.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** `uv run pytest -q`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(proctoring): pausable interview runtime, proctoring termination and heartbeat watchdog`

---

## Task 6: Voice: enrolment, monitor, embedders, heuristics

**Files:**
- Modify: `Backend/pyproject.toml`: add
  ```toml
  [dependency-groups]
  # existing groups stay
  proctoring-voice = ["speechbrain>=1.0", "torch>=2.4", "torchaudio>=2.4", "numpy>=1.26"]
  ```
  Use the PyTorch CPU index if uv picks CUDA wheels on Windows: add `[[tool.uv.index]] name="pytorch-cpu" url="https://download.pytorch.org/whl/cpu" explicit=true` and `[tool.uv.sources] torch = { index = "pytorch-cpu" }`, `torchaudio = { index = "pytorch-cpu" }`. **Do not** add these to the default dependencies.
- Create: `Backend/app/proctoring/enrolment.py`
- Create: `Backend/app/proctoring/voice.py`
- Modify: `Backend/app/api/v1/proctoring.py` (the real enrolment route)
- Modify: `Backend/app/ai/runtime/session.py` (start/stop the monitor)
- Test: `Backend/tests/test_proctoring_voice.py`

**`enrolment.py`:**
```python
class EnrolmentRegistry:            # process-global singleton: get_enrolment_registry()
    def put(self, attempt_id: str, embedding: Sequence[float], *, source: str) -> None   # TTL 2h
    def get(self, attempt_id: str) -> tuple[list[float], str] | None
    def pop(self, attempt_id: str) -> None
def decode_wav_pcm16_mono_16k(data: bytes) -> "np.ndarray[float32]"   # stdlib wave; reject non-16k/mono/16-bit with ValueError
```
- The enrolment route:
  - validates the size (≤ 2 MB) and the duration (5–20 s);
  - decodes in memory;
  - `embedder = get_embedder(settings)`;
  - if `embedder.available`, compute the embedding in a thread with `await asyncio.to_thread(embedder.embed, pcm)`, then `registry.put(...)`, mutate `record.voice = {"enrolled": True, "source": "device_check", "model": embedder.name}` and record `enrolment_completed`; otherwise return `{"enrolled": False}`.
  - Never write the bytes anywhere, and `del` the buffers after use.

**`voice.py`.** The pure heuristics are importable without torch; numpy is imported lazily. If numpy is missing, the heuristics return `None` and the monitor records `voice_model_unavailable` once and only tracks nothing.

```python
def spectral_flatness(frame: np.ndarray) -> float          # geometric/arith mean of |rfft|^2 (+1e-10)
def pause_ratio(vad_probs: Sequence[float], threshold=0.5) -> float
def rms_cv(pcm: np.ndarray, win: int = 320) -> float       # coefficient of variation of 20 ms RMS envelope
def cosine(a, b) -> float

class SpeakerEmbedder(Protocol):
    name: str; available: bool
    def embed(self, pcm16k: np.ndarray) -> list[float]: ...
class NullEmbedder:  name="none"; available=False
class EcapaEmbedder: # lazy: from speechbrain.inference.speaker import EncoderClassifier
    # EncoderClassifier.from_hparams(source=settings.proctoring_voice_model, savedir=f"{proctoring_model_dir}/ecapa", run_opts={"device":"cpu"})
    # embed: classifier.encode_batch(torch.from_numpy(pcm)[None]).squeeze().tolist()
def get_embedder(settings) -> SpeakerEmbedder   # cached; returns NullEmbedder on ImportError/any load error (log once, warning)

@dataclass
class VoiceDecisionState: ...    # consecutive mismatches, enrolment accumulation, baseline flatness, last flag times

class VoiceAnalyzer:              # PURE decision logic over segments — unit-tested
    def __init__(self, cfg: ProctoringConfig-like voice fields, embedder: SpeakerEmbedder, enrolment: list[float] | None)
    def on_non_speech(self, pcm: np.ndarray, vad_prob: float, t: float) -> list[Flag]   # baseline + whisper rule
    def on_segment(self, pcm: np.ndarray, vad_probs: list[float], t: float) -> list[Flag] # mismatch, second voice, tts cadence, fallback enrolment
Flag = tuple[str, dict]  # (type, metrics)

class VoiceMonitor:               # I/O shell — wired into InterviewSession
    def __init__(self, *, settings, kind, attempt_id, room: rtc.Room)
    async def start(self) -> None   # waits for candidate participant mic track; AudioStream.from_participant(..., sample_rate=16000, num_channels=1); silero VAD stream for segmentation; runs analyzer in executor; flags → service.record_server_event(...)
    async def stop(self) -> None    # cancel tasks, close streams, registry.pop(attempt_id) — embeddings discarded
```

**Rules: implement exactly PRD §5.8.**
- **Thresholds** come from settings.
- **Fallback enrolment:** while there is no enrolment, accumulate segment embeddings until ≥ `proctoring_enrolment_fallback_seconds` of speech, then average them. Record `enrolment_fallback` (once) and set `record.voice.source = "interview_fallback"`.
- **`second_voice` sub-windows:** 1 s windows with a 0.5 s hop. Flag if `min(pairwise cosine) < second_voice_threshold` and `max(cos to enrolment) > second_voice_match`.
- **Whisper baseline:** the median flatness over the first 20 s of non-speech frames. Until a baseline exists, never flag.
- **Silero segmentation:** use `silero.VAD.load(...)` → `vad.stream()`; `push_frame` each `rtc.AudioFrame`; iterate the events (`START_OF_SPEECH`, `INFERENCE_DONE` with `.probability`, `END_OF_SPEECH` with `.frames`). Check the installed `livekit.agents.vad` API names and adapt.

**Session wiring.** In `InterviewSession.start()`, after `agent_session.start(...)`:
```python
if self.proctoring_enabled:
    self._voice_monitor = VoiceMonitor(settings=self.settings, kind=self.kind, attempt_id=self.attempt_id, room=self.room)
    self._spawn(self._voice_monitor.start(), name=f"voice-monitor-{self.attempt_id}")
```
`stop()` awaits `self._voice_monitor.stop()` inside `suppress(Exception)`.

- [ ] **Step 1: Failing tests** `tests/test_proctoring_voice.py`. Skip the whole module with `pytest.importorskip("numpy")`. numpy is transitive via livekit, so it is normally present.
  - `spectral_flatness`: white noise > 0.5; a 200 Hz sine < 0.1.
  - `pause_ratio([1, 1, 0, 1])` = 0.25. `rms_cv` of constant-amplitude noise < 0.15; of an AM-modulated signal > 0.3.
  - **VoiceAnalyzer with a fake embedder** returning preset vectors per call:
    - two consecutive low-cosine segments → exactly one `voice_mismatch`;
    - a single low one → none;
    - a high one resets the run.
  - **second_voice:** a fake embedder returns orthogonal vectors for alternating sub-windows, one of which matches the enrolment → `second_voice`.
  - **Fallback enrolment:** no enrolment; segments totalling 46 s → `enrolment_fallback` marker emitted once, then mismatch checks become active.
  - **Whisper:** baseline from noise; a sub-threshold-probability, high-flatness window ≥ 1.5 s → `whisper_background`.
  - **`tts_cadence`:** a 20 s segment with no pauses and flat RMS → a flag whose metrics contain `confidence: "low"`.
  - **The enrolment route:**
    - with `get_embedder` monkeypatched to `NullEmbedder` → `{"enrolled": false}`, 200;
    - with a fake available embedder → `{"enrolled": true}` and the registry holds it;
    - a non-16 kHz WAV → 422;
    - assert that **no new files appear** under `tmp_path` after the call.
  - `get_embedder` returns `NullEmbedder` when `speechbrain` import fails (monkeypatch `builtins.__import__` for that name).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement.
- [ ] **Step 4:** `uv run pytest -q`, **without** the voice group installed. Expected: PASS.
- [ ] **Step 5: Optional real-model smoke test** (if network is allowed):
  ```bash
  uv sync --group proctoring-voice
  uv run python -c "from app.core.config import get_settings; from app.proctoring.voice import get_embedder; import numpy as np; e=get_embedder(get_settings()); print(e.name, e.available, len(e.embed(np.random.randn(32000).astype('float32')*0.01)))"
  ```
  Expected: `ecapa True 192`. Record the result in a note. If it fails, note it; the fallback covers it.
- [ ] **Step 6: Commit**: `feat(proctoring): server-side voice enrolment and anomaly flags`

---

## Task 7: Synthesis summary, employer API, purge loop, demo seed

**Files:**
- Modify: `Backend/app/services/synthesis_service.py`
- Modify: `Backend/app/api/v1/pipeline.py`
- Modify: `Backend/app/api/v1/search.py` (`GET /talent`)
- Modify: `Backend/app/main.py` (lifespan purge loop)
- Create: `Backend/scripts/seed_proctoring_demo.py`
- Test: `Backend/tests/test_proctoring_employer.py`

**Steps:**
1. **Synthesis.**
   - Add `_load_proctoring(interview_id, kind)`, the same as `_load_identity_verdict`.
   - Add `_apply_proctoring_summary(report, record)`:
     - append a concern: "Interview ended early by proctoring after {n} gaze violations: {messages}." when terminated, else "Proctoring: {n} gaze warning(s)" if strikes > 0;
     - plus "Voice flags for review: 2 voice mismatch, 1 second voice." if there are any flags;
     - set `report["proctoring"] = {"outcome", "strikes", "flags": counts}`.
   - **Never touch scores.**
   - Call it in `analyze_interview` right after the identity verdict.
2. **The application detail.** In `get_application`, add `"proctoring": _employer_proctoring(attempt, application_id)` to `applied_interview`. It returns `policy.public_view(..., audience="employer")`, where each event's `snapshot` becomes `snapshot_url = f"/api/v1/applications/{application_id}/proctoring/snapshots/{event_id}"`, or `None`.
3. **Snapshot route:**
   ```python
   @router.get("/applications/{application_id}/proctoring/snapshots/{event_id}")
   ```
   - `require_role(context, EMPLOYER_ROLES)`; tenant-scoped `store.get_application` (404 otherwise);
   - the attempt must exist;
   - find the event in `attempt.proctoring.events` with a non-null `snapshot`;
   - `service.read_snapshot`;
   - return a `Response(content, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=300"})`.
   - Mirror the `candidate-avatar` route (`pipeline.py`, grep `candidate-avatar`) for structure.
4. **Allow retake.** `POST /applications/{id}/applied-interview/allow-retake` with `require_role(context, PIPELINE_ROLES)`.
   - 409 `not_terminated` unless `proctoring.terminated`.
   - Otherwise update the attempt row:
     - `status='invited'`, `transcripts='[]'`, `responses='{}'`;
     - `evaluation`, `interview_plan`, `answer_assessments`, `identity_verification`, `room_name`, `started_at`, `submitted_at` all set to NULL (`'[]'` for JSON lists);
     - `proctoring = new_record(enabled=<posting flag>, …)` with `history = old.history + [old minus history]`.
   - `store.write_audit(action="applied_interview.retake_allowed", resource_type="applied_interview_attempt", resource_id=attempt_id)`.
   - Commit. Add a `store.reset_applied_attempt_for_retake(conn, *, attempt_id, proctoring)` helper for the SQL.
5. **Cards.** In `_application_card`, add:
   - `"applied_interview_proctoring": policy.outcome((attempt or {}).get("proctoring"))`;
   - `"profile_proctoring_status": policy.outcome((store.best_profile_attempt(conn, candidate_id=application["candidate_id"]) or {}).get("proctoring"))`.
6. **Talent.** In `search.py`'s `/talent` result builder, add `"profile_proctoring_status"` the same way.
7. **Purge loop.** In `main.py`'s lifespan, start an `asyncio` task that runs `purge_expired_snapshots(conn, settings, now=utcnow())` once at startup and then every 24 h. Use its own `connect(settings.database)` and close it each run; cancel the task on shutdown. Skip it when `settings.environment == Environment.TEST`, so tests call it directly.
8. **Demo seed.** `Backend/scripts/seed_proctoring_demo.py`, run with `uv run python scripts/seed_proctoring_demo.py`. Idempotent:
   - picks the first applied attempt of the demo candidate `hira.ahmed@gmail.com`;
   - writes a terminated proctoring record with 3 counted strikes (one with a generated snapshot file), 1 uncounted cooldown event, 2 voice flags, consent and calibration;
   - sets status `evaluated`, keeping any existing evaluation.
   - It also marks the best profile attempt as `flagged` (1 voice flag).
   - Flag `--fresh-applied` (used by the Task 15 e2e) instead resets that applied attempt to `in_progress` with an empty, enabled record that already has consent and calibration, then prints `{"attempt_id": "..."}` as the last stdout line.
   - Honour `THOS_DATABASE_PATH` / `THOS_DATABASE_URL` through `get_settings()`, so the e2e run targets `e2e.db`.
   - Print what it changed. **Never use it from pytest.**

- [ ] **Step 1: Failing tests:**
  - **The employer detail:** with a terminated record seeded through `store.set_attempt_proctoring`, the detail has `proctoring.outcome == "terminated"` and the events carry `snapshot_url`.
  - **Snapshot route:** 200 `image/jpeg` for the owning tenant; 404 for another tenant's employer; 401 or 403 for a candidate.
  - **Allow retake:** resets the status to `invited` and moves the old record into `history`; 409 when not terminated; an audit row exists.
  - The pipeline card has `applied_interview_proctoring`.
  - `_apply_proctoring_summary` adds concerns and leaves `overall_score` unchanged (a pure test on a dict).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** `uv run pytest -q` and ruff. Expected: PASS.
- [ ] **Step 5:** Run the seed script against the dev DB (backend stopped, or it's fine with SQLite WAL) and confirm `GET /api/v1/applications/{id}` as Ayesha shows the record.
- [ ] **Step 6: Commit**: `feat(proctoring): employer visibility, retake, report summary and snapshot retention`

---

## Task 7A: Bug fix: voice-evaluation shape crashes the application drawer

**The bug (pre-existing, confirmed in code):**
- `ApplicationDrawer` (`Frontend/components/pipeline/application-drawer.tsx`) assumes the **text-answer** evaluation shape from `Backend/app/domain/evaluation.py:118-131`: `dimension_scores: [{dimension_id, label, score}]` and `evidence: [{dimension_id, text, timestamp_range?}]`.
- **Voice** interviews are evaluated by `synthesis_service.map_report_to_evaluation` (`Backend/app/services/synthesis_service.py:115-151`), which emits a different shape: `dimensions: [{id, label, score, rationale}]` and `evidence: string[]`, with no `dimension_scores`.

**Failure:**
- `application-drawer.tsx:284`, `const rubricDimensions = evaluation?.dimension_scores.map(...)`, runs at the **top level of the component** on every render. `?.` guards only `evaluation`, so for any evaluated voice job interview it throws `TypeError: Cannot read properties of undefined (reading 'map')` and **the whole drawer crashes**, not just one tab.
- Lines 475 and 480 (`dimension_scores.length` / `.map`) would throw too.
- Lines 492–494 render string evidence as blank rows (`ev.dimension_id` / `ev.text` are undefined).

Every existing voice-evaluated attempt in the DB already has the voice shape, so the fix must handle **stored data**, not just new evaluations.

**Fix design** (canonical shape on the backend, plus a defensive normaliser on the frontend):
1. **One backend normaliser** used at every API boundary, so old stored rows are fixed on read with no data migration.
2. **New voice evaluations** are written with the canonical keys too, keeping the old keys for backward compatibility.
3. **A frontend normaliser** so the UI can never crash on a malformed or legacy evaluation.

**Files:**
- Modify: `Backend/app/domain/evaluation.py`: add `normalize_evaluation`
- Modify: `Backend/app/services/synthesis_service.py`: `map_report_to_evaluation` also emits canonical keys
- Modify: `Backend/app/api/v1/pipeline.py` (`get_application`, line ~262), `Backend/app/api/v1/voice_interviews.py` (`_session_payload`, line ~47), `Backend/app/api/v1/candidates.py` (lines ~381 and ~471): wrap every returned `evaluation` in `normalize_evaluation(...)`. Grep `"evaluation":` in `Backend/app/api/v1` once more and wrap any other attempt evaluation you find. Sandbox evaluations are a different object; leave them alone.
- Create: `Frontend/lib/evaluation.ts`
- Modify: `Frontend/lib/types.ts`: `Evaluation.dimension_scores` and `strengths`/`gaps` become optional; add `NormalizedEvaluation`
- Modify: `Frontend/components/pipeline/application-drawer.tsx`
- Tests: `Backend/tests/test_evaluation_normalize.py`, `Frontend/tests/evaluation-normalize.test.ts`, `Frontend/tests/application-drawer-voice-eval.test.tsx`

**Backend `normalize_evaluation`** (pure, idempotent, never raises):

```python
def normalize_evaluation(evaluation: Any) -> dict[str, Any] | None:
    """Return the canonical evaluation shape the UI expects, for text- or voice-evaluated attempts.

    Canonical: dimension_scores=[{dimension_id,label,score}], evidence=[{dimension_id,text,timestamp_range?}],
    strengths/gaps lists. Voice-shape keys (dimensions, string evidence) are converted; unknown keys are kept.
    """
    if not isinstance(evaluation, dict):
        return None
    out = dict(evaluation)
    dims = out.get("dimension_scores")
    if not isinstance(dims, list):
        dims = []
        for d in out.get("dimensions") or []:
            if isinstance(d, dict) and d.get("id") is not None:
                dims.append({
                    "dimension_id": str(d["id"]),
                    "label": str(d.get("label") or d["id"]).strip(),
                    "score": _clamp_score(d.get("score")),
                    **({"rationale": d["rationale"]} if d.get("rationale") else {}),
                })
    out["dimension_scores"] = [d for d in dims if isinstance(d, dict) and "dimension_id" in d]
    evidence = []
    for item in out.get("evidence") or []:
        if isinstance(item, str) and item.strip():
            evidence.append({"dimension_id": "", "text": item.strip()})
        elif isinstance(item, dict) and (item.get("text") or "").strip():
            evidence.append({**item, "dimension_id": str(item.get("dimension_id") or "")})
    out["evidence"] = evidence
    out["strengths"] = [s for s in (out.get("strengths") or []) if isinstance(s, str)]
    out["gaps"] = [s for s in (out.get("gaps") or []) if isinstance(s, str)]
    if out.get("overall_score") is None and out.get("score") is not None:
        out["overall_score"] = out["score"]
    return out
```

`_clamp_score(v)` returns `max(0, min(100, round(float(v))))`, or `0` when it can't parse the value.

**In `map_report_to_evaluation`:** after building `dimensions`, also set:
- `"dimension_scores": [{"dimension_id": d["id"], "label": d["label"], "score": d["score"], "rationale": d["rationale"]} for d in dimensions]`;
- `"evidence": [{"dimension_id": "", "text": t} for t in highlights[:5]]`.

Keep `"dimensions"` for backward compatibility. Before changing `evidence`, grep `Backend/app` for any consumer of voice `evaluation["evidence"]` that expects strings (`ai_feedback.py`, `matching.py`); if one exists, convert it at that consumer. Update `tests/test_voice_interview.py`'s `map_report_to_evaluation` assertions to the new evidence shape.

**Frontend `lib/evaluation.ts`:**

```ts
import type { Evaluation } from "./types";

export type NormalizedEvaluation = Omit<Evaluation, "dimension_scores" | "evidence" | "strengths" | "gaps"> & {
  dimension_scores: { dimension_id: string; label: string; score: number; rationale?: string }[];
  evidence: { dimension_id: string; text: string; timestamp_range?: { start: number; end: number } }[];
  strengths: string[];
  gaps: string[];
};

/** Accepts canonical (text-answer) or legacy voice-shaped evaluations; never throws. */
export function normalizeEvaluation(raw: unknown): NormalizedEvaluation | null
```

It mirrors the backend rules. It reads `dimension_scores`, or else maps `dimensions[{id,label,score,rationale}]`; turns string evidence into `{dimension_id:"", text}`; drops malformed entries; and returns `null` for non-objects. This is defence in depth in case an endpoint was missed.

**`application-drawer.tsx` changes:**
- `const evaluation = normalizeEvaluation(application?.applied_interview?.evaluation);` (line 283).
- `const rubricDimensions = evaluation && evaluation.dimension_scores.length > 0 ? evaluation.dimension_scores.map((d) => d.label) : ["Structure", "Reasoning", "Domain correctness"];` (line 284).
- **"Graded on N rubric dimensions"** (line 475): render only when `dimension_scores.length > 0`. Otherwise show "Voice interview: overall score only", or nothing if the overall score is also missing.
- **Dimension list:** each `li` gets `title={dim.rationale}` when one is present.
- **Evidence list:** render `<strong>{ev.dimension_id}:</strong>` only when `ev.dimension_id` is non-empty, so voice highlights show as plain text.
- Use `ScoreBadge` only when `typeof evaluation.overall_score === "number"`.
- **No other changes.** In particular, scorecard logic is untouched beyond reading `rubricDimensions`.

**Optional cleanup:** if the orphaned `components/candidate/interview-session.tsx` still exists after the revamp (revamp PRD §9 deletes it), switch it to `normalizeEvaluation` too. Otherwise skip.

- [ ] **Step 1: Write the failing tests:**
  - **`Backend/tests/test_evaluation_normalize.py`:**
    - a voice-shape dict (`dimensions` + string evidence) → canonical `dimension_scores` with clamped scores and object evidence;
    - a canonical text-shape dict → unchanged in content, and normalising twice gives the same result (idempotent);
    - `None`, `"x"` and `[]` → `None`;
    - malformed entries (`dimensions: [None, {"label": "x"}]`, `evidence: [1, ""]`) are dropped without raising;
    - `map_report_to_evaluation(sample_report)` now contains `dimension_scores` and object evidence.
  - **API regression:** create an applied attempt, store a **voice-shape** evaluation directly with `store.update_applied_interview_voice(..., status="evaluated", evaluation={...voice shape...})`, then `GET /api/v1/applications/{id}` as the employer. The response has `applied_interview.evaluation.dimension_scores` as a list and evidence items as objects.
  - **`Frontend/tests/evaluation-normalize.test.ts`:** the same cases as the backend unit test.
  - **`Frontend/tests/application-drawer-voice-eval.test.tsx`:**
    - render `ApplicationDrawer` with `useApi` mocked (`vi.mock("@/lib/use-api")`) to return an application whose `applied_interview.evaluation` is the **legacy voice shape** (no `dimension_scores`, string evidence);
    - the drawer renders without throwing, the Job Interview tab shows the overall score, and the evidence text "Clear STAR answer" appears;
    - **render the same component on `main` first** to confirm this test fails there with the `.map` TypeError (red), then make it pass (green).
- [ ] **Step 2:** `cd Backend && uv run pytest tests/test_evaluation_normalize.py tests/test_voice_interview.py -q` and `cd Frontend && npx vitest run tests/evaluation-normalize.test.ts tests/application-drawer-voice-eval.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement the backend normaliser and wire it into every endpoint listed; update `map_report_to_evaluation`; add the frontend normaliser and the drawer changes.
- [ ] **Step 4:** Run the full backend and frontend checks (§0.3). Expected: PASS.
- [ ] **Step 5: Manual check.** As Ayesha, open the drawer for an application whose job interview was **voice**-evaluated: the seeded attempt from Task 7, or any real one (`SELECT id FROM applied_interview_attempts WHERE evaluation LIKE '%"dimensions"%'`). It opens, the Job Interview tab shows the score, dimensions and evidence text, and the Scorecards tab lists the voice dimension labels.
- [ ] **Step 6: Commit**: `fix(pipeline): normalise voice evaluations so the application drawer no longer crashes`

---

## Task 8: Frontend dependencies, assets, API client, types

**Files:**
- Modify: `Frontend/package.json`: dependencies `@mediapipe/tasks-vision@^1.1.1` and `@ricky0123/vad-web@^0.0.31` (this pulls in `onnxruntime-web`). Scripts `"postinstall": "node scripts/copy-proctoring-assets.mjs"` and `"proctoring:assets": "node scripts/copy-proctoring-assets.mjs"`.
- Create: `Frontend/scripts/copy-proctoring-assets.mjs`:
  - copy `node_modules/@mediapipe/tasks-vision/wasm/*` → `public/mediapipe/wasm/`;
  - download `face_landmarker.task` (URL in the research doc §1.1) → `public/mediapipe/face_landmarker.task` if missing. Verify the size is 3,758,596 bytes; on network failure, warn and exit 0 so CI without network still installs;
  - copy the vad-web assets: `node_modules/@ricky0123/vad-web/dist/{silero_vad_legacy.onnx,silero_vad_v5.onnx,vad.worklet.bundle.min.js}` and `node_modules/onnxruntime-web/dist/*.wasm` (plus the `.mjs` loaders it needs) → `public/vad/`. List the real file names after install with `ls`; they can differ between versions.
- Modify: `Frontend/.gitignore`: ignore `public/mediapipe/` and `public/vad/`. They are build artefacts reproduced by `postinstall`.
- Create: `Frontend/components/interviews/proctoring/proctoring-api.ts`
- Modify: `Frontend/utils/api.ts`: export `voiceBase` (currently module-private) for reuse. Add `proctoring?: {enabled: boolean; terminated: TerminatedInfo | null}` to `getInterview`'s returned `data`.
- Modify: `Frontend/lib/types.ts`, `Frontend/types/tracking.ts`

**Types** (`lib/types.ts`):
```ts
export type ProctoringOutcome = "clean" | "flagged" | "terminated";
export type ProctoringEvent = {
  id: string; family: "gaze" | "voice" | "session"; type: string; at: string;
  counted: boolean; strike: number | null; note: string | null; label: string;
  metrics: Record<string, unknown>; snapshot_url: string | null; snapshot_purged?: boolean;
};
export type EmployerProctoring = {
  enabled: boolean; outcome: ProctoringOutcome | null; strikes: number; max_warnings: number;
  warnings_used: number; terminated: TerminatedInfo | null;
  counts: { strikes: number; flags: Record<string, number> };
  consent: { accepted_at: string; signature_name: string } | null;
  events: ProctoringEvent[]; history_count: number;
};
export type TerminatedInfo = { reason_code: string; message: string; at: string;
  strikes: { type: string; at: string; message: string }[] };
```
Then:
- add `proctoring?: EmployerProctoring | null` to `ApplicationDetail["applied_interview"]`;
- add `applied_interview_proctoring?: ProctoringOutcome | null` and `profile_proctoring_status?: ProctoringOutcome | null` to the pipeline card type;
- add `proctoring_enabled: boolean` to the posting type;
- add `profile_proctoring_status` to the talent result type.

**`proctoring-api.ts`:**
```ts
export type ClientConfig = { sustainedS: number; glanceS: number; glanceCount: number; glanceWindowS: number;
  readingMinS: number; readingReversals: number; faceMissingS: number; multiFaceS: number; multiFaceConfidence: number;
  questionGraceS: number; aiSpeakingMultiplier: number; tabHiddenS: number; blurS: number; heartbeatIntervalS: number;
  envelopeMarginDeg: number; fallbackYawDeg: number; fallbackPitchDownDeg: number; fallbackPitchUpDeg: number;
  calibrationMinPresence: number; maxWarnings: number; policyVersion: string };
export type ProctoringState = { enabled: boolean; config: ClientConfig; consent_required: boolean; calibration_required: boolean;
  pending_warning: { strike: number; event_id: string; at: string } | null; warnings_used: number; max_warnings: number;
  terminated: TerminatedInfo | null };
export type EventDecision = { decision: "none" | "warn" | "terminate"; strike: number | null; counted: boolean; warnings_used: number; message: string };
export const proctoringApi = {
  get(attemptId: string): Promise<ProctoringState>,
  consent(attemptId: string, body: { accepted: true; signature_name: string; policy_version: string }): Promise<void>,
  calibration(attemptId: string, body: { envelope: Envelope; face_presence: number }): Promise<void>,
  enrolment(attemptId: string, wav: Blob): Promise<{ enrolled: boolean }>,   // multipart; uses fetch directly with Bearer
  event(attemptId: string, body: { type: string; client_ts: number; metrics?: Record<string, number | string | boolean>; snapshot?: string }): Promise<EventDecision>,
  acknowledge(attemptId: string, strike: number): Promise<void>,
  heartbeat(attemptId: string, body: { client_ts: number; fps: number; face_present: boolean }): Promise<Pick<ProctoringState, "pending_warning" | "terminated">>,
};
```
Implement these with the same `apiFetch` used in `utils/api.ts`; export `apiFetch` from there. Event posts **retry once** after 1 s on a network error (not on 4xx).

- [ ] **Step 1:** `cd Frontend && npm i @mediapipe/tasks-vision@^1.1.1 @ricky0123/vad-web@^0.0.31`. Write the script, then run `npm run proctoring:assets` and check that `public/mediapipe/wasm/vision_wasm_internal.wasm` and `public/mediapipe/face_landmarker.task` exist.
- [ ] **Step 2:** Add the types and the client. `npm run typecheck`. Expected: PASS.
- [ ] **Step 3: Commit**: `feat(proctoring): frontend deps, self-hosted model assets and API client`

---

## Task 9: Pure frontend cores (TDD)

**Files:**
- Create: `Frontend/components/interviews/proctoring/gaze-engine.ts`
- Create: `Frontend/components/interviews/proctoring/calibration.ts`
- Create: `Frontend/components/interviews/proctoring/wav-encoder.ts`
- Tests: `Frontend/tests/proctoring/gaze-engine.test.ts`, `calibration.test.ts`, `wav-encoder.test.ts`

**`gaze-engine.ts`:**

```ts
export type GazeSample = { t: number; facePresent: boolean; yaw: number; pitch: number; irisH: number; irisV: number };
export type Envelope = { yaw: [number, number]; pitch: [number, number]; irisH: [number, number]; irisV: [number, number] };
export type GazeConfig = Pick<ClientConfig, "sustainedS" | "glanceS" | "glanceCount" | "glanceWindowS" | "readingMinS"
  | "readingReversals" | "faceMissingS" | "questionGraceS" | "aiSpeakingMultiplier">;
export type GazeEventType = "gaze_off_screen_sustained" | "gaze_repeated_glances" | "gaze_reading_pattern" | "face_missing";
export type GazeEvent = { type: GazeEventType; metrics: Record<string, number | string> };
export type GazeContext = { agentSpeaking: boolean; msSinceAgentEnded: number };
type Side = "left" | "right" | "up" | "down";

const SMOOTH_MS = 300;
const REVERSAL_MIN_DELTA = 0.04; // iris-ratio travel between direction changes that counts as a sweep

export function createGazeEngine(config: GazeConfig, envelope: Envelope) {
  let smooth: GazeSample | null = null;
  let missingSince: number | null = null;
  let missingFired = false;
  let exc: { start: number; side: Side; fired: boolean; reversals: number; dir: 0 | 1 | -1; travel: number; lastH: number } | null = null;
  let glances: { t: number; side: Side }[] = [];

  const ms = (s: number, ctx: GazeContext) => s * 1000 * (ctx.agentSpeaking ? config.aiSpeakingMultiplier : 1);

  function sideOf(s: GazeSample): Side | null {
    const over = (v: number, [lo, hi]: [number, number]) => (v < lo ? (v - lo) / Math.max(1e-6, hi - lo) : v > hi ? (v - hi) / Math.max(1e-6, hi - lo) : 0);
    const h = over(s.yaw, envelope.yaw) + over(s.irisH, envelope.irisH);
    const v = over(s.pitch, envelope.pitch) + over(s.irisV, envelope.irisV);
    if (h === 0 && v === 0) return null;
    if (Math.abs(h) >= Math.abs(v)) return h < 0 ? "left" : "right";
    return v < 0 ? "down" : "up";
  }

  function endExcursion(t: number, ctx: GazeContext, out: GazeEvent[]) {
    if (!exc) return;
    const dur = t - exc.start;
    if (!exc.fired && dur >= ms(config.glanceS, ctx)) {
      glances.push({ t, side: exc.side });
      glances = glances.filter((g) => t - g.t <= config.glanceWindowS * 1000);
      const same = glances.filter((g) => g.side === exc!.side);
      if (same.length >= config.glanceCount) {
        out.push({ type: "gaze_repeated_glances", metrics: { side: exc.side, excursions: same.length, windowS: config.glanceWindowS } });
        glances = glances.filter((g) => g.side !== exc!.side);
      }
    }
    exc = null;
  }

  function push(raw: GazeSample, ctx: GazeContext): GazeEvent[] {
    const out: GazeEvent[] = [];
    // EMA smoothing (time-based)
    if (!smooth || !raw.facePresent || !smooth.facePresent) smooth = { ...raw };
    else {
      const a = 1 - Math.exp(-(raw.t - smooth.t) / SMOOTH_MS);
      smooth = { t: raw.t, facePresent: true,
        yaw: smooth.yaw + a * (raw.yaw - smooth.yaw), pitch: smooth.pitch + a * (raw.pitch - smooth.pitch),
        irisH: smooth.irisH + a * (raw.irisH - smooth.irisH), irisV: smooth.irisV + a * (raw.irisV - smooth.irisV) };
    }
    const s = smooth;
    const inGrace = ctx.msSinceAgentEnded < config.questionGraceS * 1000;

    // Face missing
    if (!s.facePresent) {
      endExcursion(s.t, ctx, out);
      if (inGrace) { missingSince = null; return out; }
      missingSince ??= s.t;
      if (!missingFired && s.t - missingSince >= ms(config.faceMissingS, ctx)) {
        missingFired = true;
        out.push({ type: "face_missing", metrics: { seconds: Math.round((s.t - missingSince) / 100) / 10 } });
      }
      return out;
    }
    missingSince = null;
    missingFired = false;

    const side = inGrace ? null : sideOf(s);
    if (!side) { endExcursion(s.t, ctx, out); return out; }
    if (!exc || exc.side !== side) {
      endExcursion(s.t, ctx, out);
      exc = { start: s.t, side, fired: false, reversals: 0, dir: 0, travel: 0, lastH: s.irisH };
    }
    // reading reversals on horizontal iris movement
    const dh = s.irisH - exc.lastH;
    exc.lastH = s.irisH;
    const d: 0 | 1 | -1 = dh > 0.005 ? 1 : dh < -0.005 ? -1 : 0;
    if (d !== 0) {
      if (exc.dir !== 0 && d !== exc.dir && exc.travel >= REVERSAL_MIN_DELTA) { exc.reversals += 1; exc.travel = 0; }
      if (d !== exc.dir) exc.travel = 0;
      exc.dir = d;
      exc.travel += Math.abs(dh);
    }
    const dur = s.t - exc.start;
    if (!exc.fired && dur >= ms(config.readingMinS, ctx) && exc.reversals >= config.readingReversals) {
      exc.fired = true;
      out.push({ type: "gaze_reading_pattern", metrics: { side, seconds: Math.round(dur / 100) / 10, reversals: exc.reversals } });
    } else if (!exc.fired && dur >= ms(config.sustainedS, ctx)) {
      exc.fired = true;
      out.push({ type: "gaze_off_screen_sustained", metrics: { side, seconds: Math.round(dur / 100) / 10 } });
    }
    return out;
  }

  function reset() { smooth = null; missingSince = null; missingFired = false; exc = null; glances = []; }
  return { push, reset };
}
```

**Test helper.** `run(engine, samples, ctx)` feeds 12 fps samples and collects events. Write tests for each of these:
- on-screen for 60 s → no events;
- off left for 9.9 s → none; for 10.2 s → exactly one `gaze_off_screen_sustained`, and still one at 30 s, because each excursion fires once;
- while `agentSpeaking`, 10.2 s → none; 15.2 s → one;
- 4 × (2 s left, 3 s on) within 30 s → one `gaze_repeated_glances`; 4 glances alternating left and right → none;
- 4 s off-screen with irisH oscillating ±0.06 at about 1 Hz → `gaze_reading_pattern` (and not sustained);
- no face for 4.9 s → none; 5.1 s → `face_missing` once; the face returns and goes missing again for 5.1 s → a second event;
- any off-screen sample within 3 s of `msSinceAgentEnded` (grace) → nothing accumulates;
- `reset()` clears a half-built excursion.

**`calibration.ts`:**
```ts
export type CalibrationSample = GazeSample & { target: "center" | "left" | "right" | "up" | "down" };
export function buildEnvelope(samples: CalibrationSample[], cfg: Pick<ClientConfig, "envelopeMarginDeg" | "fallbackYawDeg" | "fallbackPitchDownDeg" | "fallbackPitchUpDeg" | "calibrationMinPresence">):
  { ok: true; envelope: Envelope; facePresence: number } | { ok: false; reason: "no_face" | "low_presence"; facePresence: number }
```
- `facePresence` = the share of samples with a face. If it is below `calibrationMinPresence`, fail.
- For each axis, take the median per target and set `range = [min(medians) − margin, max(medians) + margin]`, in degrees for yaw and pitch. Iris ranges get a margin of `0.05`.
- **Sanity clamp:** if the resulting yaw range is narrower than ±8°, widen it to ±8° around the centre median (tiny screens).
- `fallbackEnvelope(cfg)` returns yaw `[-fallbackYawDeg, +fallbackYawDeg]`, pitch `[-fallbackPitchDownDeg, +fallbackPitchUpDeg]`, iris `[0.3, 0.7]`.

Tests: a normal 5-target set gives the expected ranges; 50% presence fails with `low_presence`; tiny spreads get clamped.

**`wav-encoder.ts`:**
`encodeWav16kMono(chunks: Float32Array[], inputRate: number): Blob`
- linear resampling to 16 kHz;
- clamp to [−1, 1] and convert to int16;
- a 44-byte RIFF header.

Test: 1 s of 48 kHz input gives `16000*2 + 44` bytes. The header reads `RIFF`/`WAVE`, sample rate 16000 and 1 channel (parse with `DataView`).

- [ ] **Step 1:** Write the three test files. `npx vitest run tests/proctoring`. Expected: FAIL.
- [ ] **Step 2:** Implement. Expected: PASS. `npm run typecheck`.
- [ ] **Step 3: Commit**: `feat(proctoring): pure gaze rule engine, calibration envelope and WAV encoder`

---

## Task 10: Face tracker and hooks

**Files** (all in `Frontend/components/interviews/proctoring/`):
- Create: `face-tracker.ts`
- Create: `use-gaze-proctor.ts`
- Create: `use-focus-proctor.ts`
- Create: `use-ai-turn-voice-guard.ts`
- Create: `use-proctoring-session.ts`
- Create: `test-hooks.ts`
- Tests: `Frontend/tests/proctoring/use-focus-proctor.test.tsx`, `use-proctoring-session.test.tsx`

**`face-tracker.ts`:**
```ts
export type FaceTracker = { detect(video: HTMLVideoElement, tsMs: number): GazeSample; countFaces(video: HTMLVideoElement, tsMs: number): { count: number; secondConfidence: number }; close(): void };
let loading: Promise<FaceTracker> | null = null;
export function preloadFaceTracker(): Promise<FaceTracker>   // singleton; dynamic import("@mediapipe/tasks-vision")
```
- `FilesetResolver.forVisionTasks("/mediapipe/wasm")`.
- Two landmarkers:
  - main: `numFaces: 1, runningMode: "VIDEO", outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true, delegate: "GPU"`. On failure, retry with `delegate: "CPU"`.
  - multi: `numFaces: 2, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false`, used about every 1.5 s.
- **Yaw/pitch** from `facialTransformationMatrixes[0].data` (column-major, research §1.1): `pitch = atan2(R21, R22)`, `yaw = asin(-R20)`, both in degrees. **Verify the signs during Task 16** by looking left, right, up and down with a debug overlay (`?proctorDebug=1` shows yaw/pitch/iris numbers in the chip tooltip). If the signs are inverted, negate them and note it.
- **Iris ratios:**
  - `irisH` = mean over both eyes of `(iris.x − inner.x)/(outer.x − inner.x)`, landmarks 468/33/133 and 473/362/263, oriented so that **left** (subject's view) is < 0.5;
  - `irisV` = the same with lids 159/145 and 386/374.
- No face → `{facePresent:false, yaw:0, pitch:0, irisH:0.5, irisV:0.5}`. Timestamps must increase strictly: keep `lastTs`, and if `ts <= lastTs`, use `lastTs + 1`.
- `close()` closes both landmarkers. A React StrictMode double-mount must not create two: the singleton is reference-counted with `acquire()`/`release()`.

**`use-gaze-proctor.ts`:**
```ts
useGazeProctor({ enabled, attemptId, kind, videoRef, config, envelope, paused, agentSpeaking, agentEndedAt, onDecision })
// → { fps: number, facePresent: boolean, lastSample: GazeSample | null }
```
- **Loop.** Use `video.requestVideoFrameCallback` (fall back to `requestAnimationFrame`), throttled to one detection every 80 ms (about 12 fps).
  - If the average detect time over the last 20 frames is > 80 ms, throttle to 160 ms (about 6 fps).
  - Skip while `paused`, `document.hidden`, or `video.readyState < 2`.
- Every 1500 ms, run `countFaces`. If `count >= 2` and `secondConfidence >= config.multiFaceConfidence` is sustained for `multiFaceS`, POST `multiple_faces` (a flag). Re-arm only after the second face has been absent for 5 s.
- Feed `engine.push(sample, {agentSpeaking, msSinceAgentEnded: now - agentEndedAt})`. For each event:
  - **Snapshot** (`kind === "applied"` only): draw `video` to a canvas downscaled to max 640 px wide, then `toDataURL("image/jpeg", 0.7)`. If it is longer than 520,000 characters, retry at 0.5.
  - `const d = await proctoringApi.event(attemptId, { type, client_ts: Date.now(), metrics, snapshot })`, then `onDecision(d, type)`.
- **Camera track ended** (`videoRef.current.srcObject` track `ended`, or `video.videoWidth === 0` for > 5 s): treat it as `facePresent:false` samples, so the face-missing rule fires.
- **Heartbeat** every `heartbeatIntervalS` (including while paused, so the server sees liveness): `proctoringApi.heartbeat(...)` → pass `{pending_warning, terminated}` to `onDecision` for resync, using a special `decision: "sync"` path.
- When `paused` flips to false, call `engine.reset()`.
- **Test hook:** when `NEXT_PUBLIC_PROCTORING_TEST_HOOKS === "1"`, register `window.__thosProctoring.emit = (type, metrics) => post(type, metrics)`. Put this in `test-hooks.ts`, imported **only** behind that check.

**`use-focus-proctor.ts`:**
- `visibilitychange` → hidden: start a timer for `tabHiddenS`; if still hidden when it fires, POST `tab_hidden`. One per hidden episode.
- `blur` → if still visible and still blurred after `blurS`, POST `window_blur`. A `tab_hidden` in the same episode suppresses the blur event.
- Disabled while `paused` or not `enabled`.

**`use-ai-turn-voice-guard.ts`:**
- While `enabled && agentSpeaking && !paused`, make sure a `MicVAD` exists:
  ```ts
  MicVAD.new({ baseAssetPath: "/vad/", onnxWASMBasePath: "/vad/", model: "v5",
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
    positiveSpeechThreshold: 0.5, minSpeechMs: 400, onSpeechStart, onSpeechEnd })
  ```
  The threshold is stricter than the 0.3 default to resist echo.
- If speech lasts ≥ 1.5 s while the agent is speaking, POST `speech_during_ai_turn` with `{seconds}`. Deduplication is server-side.
- Pause the VAD when the agent stops speaking. Destroy it and stop its tracks on unmount.
- If `MicVAD.new` fails, log a warning once and disable the guard. It is never fatal.

**`use-proctoring-session.ts`:**
```ts
useProctoringSession({ attemptId, initial: ProctoringState }) → {
  enabled, config, pendingWarning, warningsUsed, maxWarnings, terminated,
  paused: boolean,                       // = !!pendingWarning || !!terminated
  handleDecision(d: EventDecision | SyncDecision, type?: string): void,
  handleWsMessage(msg: { type: string; content: any }): boolean,   // true if consumed
  acknowledge(): Promise<void>,          // POST /acknowledge; on 409 → resync via GET
}
```
- `warn` → `pendingWarning = {strike, reasonMessage}`.
- `terminate` → `terminated` = (refetch `GET /proctoring` to get the strike list).
- WebSocket `proctoring_warning` / `proctoring_terminated` do the same, so the result is idempotent if both arrive. `proctoring_resumed` clears `pendingWarning`.

Tests:
- **focus:** fake timers. Hidden for 1.9 s → no POST; 2.1 s → one POST. Blur followed by hidden in the same episode → only `tab_hidden`.
- **session:** `warn`, then a duplicate WebSocket warning → one modal state. `acknowledge` → cleared. `terminate` → `terminated` set and `paused` true.

- [ ] **Step 1:** Write the tests (mock `proctoringApi` with `vi.mock`). Run them. Expected: FAIL.
- [ ] **Step 2:** Implement. Expected: PASS. Run `npm run typecheck` and `npm run lint`.
- [ ] **Step 3: Commit**: `feat(proctoring): MediaPipe face tracker and proctoring hooks`

---

## Task 11: Pre-interview UI: consent, calibration, voice sample

**Files:**
- Create: `Frontend/components/interviews/proctoring/ConsentStep.tsx`
- Create: `Frontend/components/interviews/proctoring/CalibrationPanel.tsx`
- Create: `Frontend/components/interviews/proctoring/VoiceSamplePanel.tsx`
- Create: `Frontend/styles/screens/proctoring.css`, imported next to `focus.css`. Find where the revamp imports `focus.css` (`grep -rn "focus.css" Frontend/app Frontend/styles`).
- Modify: `Frontend/components/interviews/voice/voice-portal.tsx`
- Modify: `Frontend/components/interviews/voice/DeviceCheck.tsx`
- Modify: `Frontend/components/interviews/voice/PermissionCheck.tsx` (only if the revamp changed its props; it already supports `cameraRequired`)
- Tests: `Frontend/tests/proctoring/consent-step.test.tsx`, `voice-portal-proctoring.test.tsx`

**voice-portal.tsx changes** (the step machine is only extended):
- `type Step = "consent" | "permissions" | "device-check" | "setup" | "interview"`.
- **On load,** after `getInterview`, if not completed, also `proctoringApi.get(attemptId)` → `proctoring` state. Then:
  - if `proctoring.terminated`, render `ProctoringTerminatedCard` (Task 12) **instead of** the "complete" card, both on load and after termination;
  - the initial step is `"consent"` if `proctoring.enabled && proctoring.consent_required`, otherwise `"permissions"`.
- **Steps for the indicator:** with proctoring on, `["Consent", "Permissions", "Device check", "Setup", "Interview"]`; otherwise the old 4.
- `<PermissionCheck cameraRequired={proctoring.enabled} …/>`.
- `<DeviceCheck onNext … proctoring={proctoring.enabled ? { attemptId, config, calibrationRequired } : null} />`.
- Pass `proctoring` (the state) down to `LiveKitRoomWrapper` → `InterviewInterface` as a new optional prop: `proctoring?: ProctoringState | null`.
- **Also,** `useEffect(() => { void preloadFaceTracker(); }, [])` when enabled, so the assets download during consent.

**ConsentStep:** PRD §5.2.1 copy, verbatim where quoted.
- Props: `{ kind, orgContactEmail?: string | null, accommodationEmail: string, policyVersion, onAccept(signature): Promise<void>, onDeclineBack(): void }`.
- The org contact email for applied attempts:
  - add `contact_email` to `GET …/voice` for applied attempts (`organizations.contact_email` via the posting's `tenant_id`; one line in `get_applied_voice_session`);
  - profile screening uses `config.accommodationEmail`, so add `accommodationEmail` to `client_view()`.
- **Markup:** an `.fx-card fx-card--wide` with:
  - `h2` "Before you start: proctoring";
  - a `ul` of the bullets;
  - an amber `.fx-alert` with **the rule** sentence;
  - a checkbox "I have read and agree";
  - a text input "Type your full name to sign" (`autocomplete="name"`);
  - buttons Decline (secondary) and "I agree and continue" (primary, disabled until checked and the name is ≥ 2 characters);
  - the link "Need an accommodation? Contact {email}" (`mailto:`).
- **Decline** shows the blocking card with Back.
- **Errors:** the API error is shown in `role="alert"`.

**DeviceCheck changes:**
- **Additive.** When the `proctoring` prop is set, Continue stays disabled until **both** the existing device confirmation **and** `CalibrationPanel` pass. `VoiceSamplePanel` never blocks.
- **The stream:** DeviceCheck owns a `getUserMedia({audio,video})` stream. Pass its `videoRef` and stream to both panels; don't open new streams.

**CalibrationPanel:**
- An overlay on the preview video's container with an absolutely positioned dot (centre, left, right, top, bottom of the **viewport-sized** overlay, not the small preview). Use a full-screen fixed overlay `.pr-calib` during the 8 s run, with a "Look at the dot" caption and a progress bar. Esc cancels.
- **Sequence:** centre 2 s, then left, right, up, down at 1.2 s each. Sample `tracker.detect` every 80 ms with the target label.
- **Then** `buildEnvelope`:
  - ok → `proctoringApi.calibration(...)` → show "Calibrated ✓" (`Pill` tone verified);
  - fail → show the reason ("We couldn't see your face clearly. Improve lighting and face the camera.") and Retry.
- **Without the tracker loaded yet,** show "Loading proctoring model…" with a spinner. If loading fails, show an error with Retry. That fails closed: Continue stays disabled.
- **Test hook:** `window.__thosProctoring.forceCalibration(envelope?)` submits `fallbackEnvelope` with `face_presence: 1`, behind the env flag.

**VoiceSamplePanel:**
- Shows the sentence: "I confirm that I am taking this interview myself, without help from anyone else, and that I will answer every question in my own words."
- A "Record sample" button runs a 10 s recording using `AudioContext` + `AudioWorklet`, or a `ScriptProcessor` fallback, collecting `Float32Array` chunks. Then `encodeWav16kMono` → `proctoringApi.enrolment`.
- Shows "Voice sample saved" or "Couldn't save your voice sample; we'll learn your voice from your first answers." Neither blocks Continue.
- Skippable: Continue is allowed without recording.

**Tests:**
- **ConsentStep:** the button is disabled until both are filled; Decline shows the blocking card; accept calls `onAccept` with the trimmed name.
- **voice-portal:**
  - with mocked `publicApi.getInterview` and `proctoringApi.get` returning `consent_required: true`, the Consent step renders first;
  - with `terminated` it renders the terminated card;
  - with `enabled: false` it starts at Permissions with the old 4 steps.

- [ ] **Step 1:** Write the tests. Expected: FAIL. **Step 2:** Implement. **Step 3:** `npm test`, `npm run typecheck`, `npm run lint`. Expected: PASS.
- [ ] **Step 4: Manual check.** Profile screening at `/candidate/interview` as Hira:
  - the consent card shows;
  - calibration works with a real webcam (dot sequence, Calibrated ✓);
  - the voice sample uploads (check the response in the network tab);
  - Continue gating works.
  - Run the revamp layout rules on the consent screen: add a route `cand-screening-consent` to `e2e/routes.ts` only if the step is reachable without side effects. Otherwise this is covered in Task 15.
- [ ] **Step 5: Commit**: `feat(proctoring): consent, calibration and voice sample steps`

---

## Task 12: In-interview integration

**Files:**
- Create: `Frontend/components/interviews/proctoring/ProctoringWarningModal.tsx`
- Create: `Frontend/components/interviews/proctoring/ProctoringTerminatedCard.tsx`
- Create: `Frontend/components/interviews/proctoring/ProctoredChip.tsx`
- Modify: `Frontend/components/interviews/voice/InterviewInterface.tsx`
- Modify: `Frontend/components/interviews/voice/LiveKitRoomWrapper.tsx` (pass the `proctoring` prop through)
- Modify: `Frontend/components/interviews/voice/voice-portal.tsx` (the terminated screen after finish)
- Tests: `Frontend/tests/proctoring/warning-modal.test.tsx`, `interview-interface-proctoring.test.tsx`

**InterviewInterface changes. These are the only logic edits.**
1. **New prop** `proctoring?: ProctoringState | null` and `const p = useProctoringSession({ attemptId: interview.access_token, initial: proctoring })` when enabled. Use a no-op version when disabled, so hook order stays stable.
2. **Camera required.** In the "Publish camera track" effect's `.catch`:
   - if `p.enabled`, set new state `cameraError` to "Your camera is required for this proctored interview." and render a blocking `.fx-card` with a Retry button that resets `hasInitializedCamRef.current = false` and bumps a `cameraRetry` counter (add it to the effect deps);
   - otherwise keep today's `console.warn`.
   - While `cameraError` is set, the mic stays off (see 3).
3. **Mic gating.** Add `&& !p.paused && !cameraError` to `shouldEnableMic` and add `p.paused` and `cameraError` to that effect's dependencies. In the `user_turn_granted` WebSocket case, skip `setMicrophoneEnabled(true)` when `p.paused`.
4. **Agent timing for grace.** Track `agentEndedAt` (a `useRef<number>(0)`) and set it to `performance.now()` in the `agent_speech_ended` case.
5. **WebSocket switch.** At the top of `ws.onmessage` parsing, `if (p.handleWsMessage(msg)) return;` handles `proctoring_*`. In the `interview_completed` case nothing changes: finalisation runs. The portal decides which end card to show (step 8).
6. **Hooks** (only when `p.enabled && uiMode === "interview" && hasStartedInterview`):
   ```ts
   useGazeProctor({ enabled: gazeOn, attemptId: interview.access_token, kind: interview.kind ?? "profile", videoRef: selfVideoRef,
     config: p.config, envelope: p.envelope ?? fallbackEnvelope(p.config), paused: p.paused || !!cameraError,
     agentSpeaking: isAgentSpeaking, agentEndedAt: agentEndedAt.current, onDecision: onProctorDecision });
   useFocusProctor({ enabled: gazeOn, attemptId, config: p.config, paused: p.paused, onDecision: onProctorDecision });
   useAiTurnVoiceGuard({ enabled: gazeOn, attemptId, agentSpeaking: isAgentSpeaking, paused: p.paused });
   ```
   - `onProctorDecision = (d, type) => { p.handleDecision(d, type); if (d.decision === "terminate") void endForProctoring(); }`.
   - `endForProctoring`: set `completionNotifiedRef.current = true`, `notifyCompletionWaiters()`, then `await finalizeInterviewSessionRef.current()`. Don't call `/complete`; the server already submitted.
   - The envelope comes from `GET /proctoring` → `envelope`. Task 2's `public_view(..., "candidate")` already maps it to camelCase. If it is `null` (resumed without calibration), use `fallbackEnvelope(p.config)`. `use-proctoring-session` exposes it as `p.envelope`.
7. **UI:**
   - `<ProctoredChip warningsUsed maxWarnings />` in the focus header's right slot, next to the timer.
   - `<ProctoringWarningModal open={!!p.pendingWarning} strike={…} max={p.maxWarnings} reason={p.pendingWarning.reasonMessage} onAcknowledge={p.acknowledge} />`.
8. **Portal completion.** `onInterviewFinished` gets an optional argument `{ terminated?: TerminatedInfo }`. When `p.terminated` is set (or after a refetch via `proctoringApi.get`), `voice-portal` renders `ProctoringTerminatedCard` instead of "complete". The sandbox CTA is **not** shown after a termination.

**ProctoringWarningModal:**
- The revamp `Modal` with `dismissible={false}`. If `Modal` has no such prop, add one in `components/ui/modal.tsx` that disables Esc and backdrop close (keep the default `true`), and add a unit test.
- `role="alertdialog"`, with `aria-labelledby` and `aria-describedby`.
- Title "Warning {strike} of {max}"; the body is the PRD §5.5 copy; the single button is "I understand, continue" (loading while acknowledging).
- Focus starts on the button.

**ProctoringTerminatedCard:** PRD §5.6.4 copy. It shows the strikes list (time as a local `toLocaleTimeString`, plus the message) and "Back to candidate home". `.fx-card` with a red accent (`--red` / `--red-soft`).

**ProctoredChip:** `Pill` neutral "Proctored". `title`/tooltip "Warnings used: n of 2". With `?proctorDebug=1` it also shows `fps` and yaw/pitch.

**Tests:**
- **The modal:** cannot be closed with Esc; the button calls `onAcknowledge`; it is announced as an alertdialog.
- **InterviewInterface proctoring:** a focused test that mocks `@livekit/components-react` hooks (`useRoomContext` returns a fake room with `state`, `on`/`off`, `disconnect`; `useLocalParticipant` returns a fake with `setMicrophoneEnabled` as a spy and `publishTrack`) and `livekit-client`'s `createLocalVideoTrack` (rejects → asserts the camera-required card when enabled, and no card when disabled).
  - When `p.paused`, `setMicrophoneEnabled` is last called with `false`.
  - If mocking the whole component is too heavy, extract `computeShouldEnableMic({...})` as a pure exported function **inside** `InterviewInterface.tsx`, use it in the effect, and unit-test it instead. Note the choice.

- [ ] **Step 1:** Write the tests. Expected: FAIL. **Step 2:** Implement. **Step 3:** `npm test`, `typecheck`, `lint`, `build`. Expected: PASS.
- [ ] **Step 4: Diff review.** `git diff main -- Frontend/components/interviews/voice/InterviewInterface.tsx`. Only the listed edits plus the new JSX should appear.
- [ ] **Step 5: Commit**: `feat(proctoring): enforce gaze proctoring in the live interview`

---

## Task 13: Employer UI: job switch, drawer panel, chips, retake

**Files:**
- Modify: the job create form (find with `grep -rln "sandbox_required" Frontend/components/jobs`) and the job-detail edit, if draft editing exists there.
- Create: `Frontend/components/pipeline/proctoring-panel.tsx`
- Create: `Frontend/components/ui/proctoring-chip.tsx`
- Modify: `Frontend/components/pipeline/application-drawer.tsx`
- Modify: `Frontend/components/pipeline/pipeline-page.tsx` (card meta lines, every view)
- Modify: the talent results card (`Frontend/components/talent/*`)
- Modify: `Frontend/styles/screens/proctoring.css` (drawer timeline styles)
- Tests: `Frontend/tests/proctoring/proctoring-panel.test.tsx`, `proctoring-chip.test.tsx`

**Job create/edit:**
- Next to the sandbox toggle, add a `Switch` labelled "Proctored interview (gaze + voice)", default **on**, with the help text "Candidates must consent; looking away 3 times ends the interview. Voice anomalies are flagged for review."
- It sends `proctoring_enabled` in the create body and in the PATCH for drafts.
- **Job detail aside:** show "Proctoring: On / Off".

**ProctoringPanel** (`{ applicationId, proctoring: EmployerProctoring, onChanged(): void }`):
- **Header row:** `h4` "Proctoring", then the outcome chip.
- **Disabled:** "Proctoring was off for this job."
- **Terminated:** a red `.pr-alert` with "Ended early: {terminated.message}" and the time. Then "Warnings used: {warnings_used} of {max_warnings}" and "Consent signed by {signature_name} at {time}".
- **Counts row:** "{n} strikes · {flags total} flags" plus per-flag-type `Pill`s ("2 voice mismatch").
- **Timeline** `ol.pr-timeline`. Each `li` shows:
  - `mm:ss` since `events[0].at` (or the record's `started_at`);
  - an icon: `LuEye` (gaze), `LuMic` (voice), `LuInfo` (session);
  - the label: `label` for gaze, and a human mapping for flags and session types (`voice_mismatch` → "Voice didn't match the enrolled voice", `second_voice` → "Possible second voice", `whisper_background` → "Whispering or background speech", `tts_cadence` → "Unusually steady speech cadence (low confidence)", `speech_during_ai_turn` → "Speech while the interviewer was talking", `multiple_faces` → "More than one face in view", `consent_given` → "Consent given", `warning_acknowledged` → "Warning acknowledged", `terminated` → "Interview ended by proctoring", `candidate_disconnected` → "Candidate disconnected", `enrolment_fallback` → "Voice learned from first answers", `voice_model_unavailable` → "Voice analysis unavailable");
  - a tag: "Strike {n}" (red), "Not counted · {note}" (neutral), or "Flag" (amber);
  - a snapshot thumbnail (`AuthedImage`, 96×72, `object-fit: cover`) that opens a `Modal` with the large image and the event label; "Snapshot expired" if purged.
- Session events are collapsed by default behind a "Show session events" toggle.
- **Allow retake button** (when terminated): a confirm `Modal` ("This resets the interview so the candidate can take it again. The proctoring history is kept."), then `api.post(...allow-retake)` → `toast.success` → `onChanged()`.
- **Placement in the drawer:** in the Job Interview tab, **directly under the status pill and above** `IdentityVerdictBlock` and the evaluation block. Task 7A has already fixed the evaluation-shape crash, so no error boundary is needed. Read the evaluation via `normalizeEvaluation` as Task 7A left it.

**Chips:**
- `ProctoringChip({ outcome, kind: "interview" | "screening" })` renders only for `flagged` (amber "Flagged") and `terminated` (red "Ended by proctoring"), with `aria-label` "Proctoring: …".
- Render it on pipeline cards next to the interview status (`applied_interview_proctoring`) and next to the Voice/Interview score badge (`profile_proctoring_status`, label prefix "Screening:"), in Funnel, Board and Table views.
- Render it on Talent cards (`profile_proctoring_status`).

**Tests:**
- **The panel:** renders the terminated message, the strike and flag tags and the thumbnails (mock `AuthedImage`); session events are hidden until toggled; Allow retake confirm → POST is called.
- **The chip:** renders nothing for `clean` and `null`.

- [ ] **Step 1:** Write the tests. Expected: FAIL. **Step 2:** Implement. **Step 3:** All checks pass.
- [ ] **Step 4: Manual check.** As Ayesha, after Task 7's seed: the pipeline card shows "Ended by proctoring"; the drawer → Job Interview tab shows the panel, the timeline and the snapshot; Allow retake works (then rerun the seed script to restore it).
- [ ] **Step 5: Commit**: `feat(proctoring): employer proctoring panel, chips, job toggle and retake`

---

## Task 14: Candidate applications page

**Files:**
- Modify: `Backend/app/api/v1/jobs.py`: the candidate applications payload (around lines 195–261) adds to `applied_interview`:
  `"proctoring_terminated": public_view(...,"candidate")["terminated"] if attempt and attempt.get("proctoring") else None`. **Nothing else from the record.**
- Modify: `Frontend/components/candidate/candidate-applications-page.tsx`: in the journey card's interview step, when `proctoring_terminated` is set, show a red line "Ended early: {message}" and hide "Complete interview". After a retake the attempt is `invited` again and the CTA comes back.
- Test: extend `Backend/tests/test_proctoring_employer.py` (the candidate payload contains the message and no events) and `Frontend/tests/proctoring/candidate-applications.test.tsx`.

- [ ] Steps: write the failing tests → implement → checks → commit `feat(proctoring): show proctoring termination on the candidate journey`

---

## Task 15: E2E specs

**Files:**
- Modify: `Frontend/playwright.config.ts`
  - when `PW_START_SERVERS` is set, add env to the backend `webServer`: `THOS_PROCTORING_STRIKE_COOLDOWN_SECONDS: "0"`, `THOS_SNAPSHOTS_DIR: "./data/e2e-proctoring"`;
  - add `NEXT_PUBLIC_PROCTORING_TEST_HOOKS: "1"` to the frontend server env.
- Create: `Frontend/e2e/proctoring/consent.spec.ts`
- Create: `Frontend/e2e/proctoring/strikes.spec.ts`
- Create: `Frontend/e2e/proctoring/employer.spec.ts`
- Modify: `Frontend/e2e/routes.ts`: add the employer drawer route for the seeded application if a stable id can be resolved (`resolveIds` already finds an application id).
- Modify: `Frontend/package.json`: `"e2e:proctoring": "playwright test e2e/proctoring"`

**Gating:**
- `strikes.spec.ts` mutates data and needs cooldown 0. Run it **only** when `process.env.E2E_PROCTORING === "1"` **and** `PW_START_SERVERS` is set (isolated `e2e.db`); otherwise `test.skip` it with a clear message.
- `consent.spec.ts` uses `readOnly(page)`, except that it allows `POST …/proctoring/consent` and `…/calibration`, so it also runs only in the isolated mode.
- The read-only part of `employer.spec.ts` (seeded data) runs everywhere **if** the seed exists; otherwise it skips.

**Specs:**
1. **consent:** the candidate opens `/candidate/interview`.
   - Consent step visible; the button is disabled until the checkbox and name are filled; Decline → blocking card → Back.
   - Accept → Permissions (fake devices auto-grant) → Device check → `window.__thosProctoring.forceCalibration()` → "Calibrated" → Continue enabled.
   - Run `detectLayoutIssues` on the consent step at `w1366` and `w390`, light and dark. Expected: no issues.
2. **strikes** (API-driven, because a real interview needs LiveKit; isolated mode only):
   - **Setup:** in `beforeAll`, run `uv run python scripts/seed_proctoring_demo.py --fresh-applied` against the e2e DB. Add a `--fresh-applied` flag to the Task 7 script: it resets the demo candidate's first applied attempt to `in_progress` with an **empty** proctoring record (enabled, consent and calibration filled in) and prints the attempt id as JSON on the last line. Read the id from stdout.
   - **API sequence** with the candidate token (`apiLogin("candidate")`):
     - `POST …/applied-interviews/{id}/voice/proctoring/events {type:"tab_hidden"}` → `decision: "warn", strike: 1`;
     - the same again before acknowledging → `counted: false`;
     - `acknowledge {strike:1}`;
     - event → `warn` (strike 2); `acknowledge {strike:2}`;
     - event → `terminate`.
   - `GET …/voice` → `proctoring.terminated` is set.
   - **UI:** `signIn(page,"candidate")`, open `/candidate/applied/{id}`. The Terminated card is visible with three "You left the interview tab." lines, and no "Continue to the sandbox" link.
   - **Refresh:** reload; the same card is still shown.
   - The **profile** Terminated card is covered by the Task 11 vitest test.
3. **employer:** as Ayesha, open `/pipeline?applicationId={seededApplicationId}` → Job Interview tab → the Proctoring panel is visible with "Ended early"; a snapshot thumbnail loads (`naturalWidth > 0`); the layout rules pass at `w1366` and `w390`.

- [ ] **Step 1:** Write the specs. **Step 2:** `PW_START_SERVERS=1 E2E_PROCTORING=1 npm run e2e:proctoring`. Expected: PASS. Then `npm run e2e`: the whole suite, including the revamp's layout and parity specs, stays green.
- [ ] **Step 3: Commit**: `test(e2e): proctoring consent, strike policy and employer panel`

---

## Task 16: Manual live verification and performance note

Requires `THOS_LIVEKIT_*` and `THOS_AI_API_KEY`. If they're unavailable, write that into the note and skip to Task 17.

- [ ] **Step 1:** As Hira, run profile screening end to end with a real webcam.
  1. Consent → calibration → voice sample → interview starts. The "Proctored" chip is visible.
  2. **Verify the yaw/pitch signs** with `?proctorDebug=1`: look left, right, up and down. Fix them in `face-tracker.ts` if inverted.
  3. Look clearly at a phone to your side for 12 s → warning 1 modal. The AI stops talking and the mic is muted. Click continue → the AI says "Thanks. Let's continue." and repeats the question.
  4. Switch tabs for 3 s → warning 2 (after the 20 s cooldown).
  5. Cover the camera for 6 s → the Terminated card with three reasons. The attempt is evaluated within about 1 min; the concern line appears in the report.
  6. Reload during step 3's open warning (repeat on a new attempt) → the modal reappears and the count is unchanged.
- [ ] **Step 2:** As the employer with a proctoring-on job, invite Hira, run the job interview, then trigger 1 strike and have a second person speak once. Check the drawer: strike, snapshot, and a `second_voice` or `voice_mismatch` flag. Flags are probabilistic; record what you observed.
- [ ] **Step 3:** Proctoring-off job: the interview runs exactly as before (no consent step, camera optional).
- [ ] **Step 4: Performance.** In Chrome DevTools Performance, record 30 s of the interview. Note the fps from the debug chip, the CPU %, and the main-thread time per detection. Write `.scratch/proctoring/assets/perf-note.md` with the device, browser, fps, CPU and observations. It must hold ≥ 10 fps and < 25% CPU on the test laptop; if not, lower the default throttle to 120 ms and note it.
- [ ] **Step 5: Commit** the note (and any sign or throttle fix): `chore(proctoring): live verification notes`

---

## Task 17: Docs and spec amendments

- [ ] **`THOS_Development_Spec.md`:** apply PRD §11 exactly. Show the old and new sentences in the commit body.
- [ ] **`architecture.md`:** new §8.3 "Interview proctoring", covering:
  - a sequence diagram in text form: browser detection → REST event → policy → decision → WebSocket / manager → session pause / terminate;
  - the voice monitor path;
  - the authority model;
  - the record schema (link to the PRD);
  - snapshot storage and retention;
  - the in-memory enrolment caveat;
  - the rule that every API returning an attempt evaluation must pass it through `normalize_evaluation` (Task 7A).
- [ ] **`rules.md`:** add the §5.x line from PRD §11.
- [ ] **`README.md` and `Backend/README.md`:** `uv sync --group proctoring-voice` (optional), the model cache dir, the new `THOS_PROCTORING_*` and `THOS_SNAPSHOTS_DIR` variables, the demo seed script, and a DPIA reminder.
- [ ] **`Backend/.env.example`:** list the proctoring vars with their defaults, commented.
- [ ] **`Frontend/README.md`:** the proctoring modules, `npm run proctoring:assets`, the test hooks env, and `npm run e2e:proctoring`.
- [ ] **`design.md`:** a proctoring components section: warning modal, terminated card, chip, drawer timeline. Include the states and copy.
- [ ] **Commit**: `docs(proctoring): architecture, rules, spec amendments and setup docs`

---

## Task 18: Final verification

- [ ] **Backend:** `cd Backend && uv run pytest -q && uv run ruff check app tests`. Expected: all pass. Also run the suite once with the `proctoring-voice` group installed, if Task 6 Step 5 worked.
- [ ] **Frontend:** `cd Frontend && npm run typecheck && npm run lint && npm test && npm run build && npm run e2e`. Expected: all pass.
- [ ] **Drawer bug fix (Task 7A):** the drawer opens for a voice-evaluated application, and `tests/application-drawer-voice-eval.test.tsx` and `tests/test_evaluation_normalize.py` pass.
- [ ] **Proctoring-off regression:** grep that every new code path checks `enabled`, and run the Task 4 disabled-job test plus the Task 11 disabled-portal test.
- [ ] **Privacy checks:**
  - `grep -rn "write_bytes\|open(.*wb" Backend/app/proctoring`: only `save_snapshot` writes;
  - `grep -rn "logger\.\(info\|warning\|error\)" Backend/app/proctoring`: no embeddings, images or transcripts in the messages;
  - every candidate-facing response is free of `events` and `counts`; Task 4's tests assert this.
- [ ] **Acceptance:** go through PRD §10 one item at a time and tick each in a copy at `.scratch/proctoring/acceptance-signoff.md`, with evidence (test name, screenshot path or note).
- [ ] **Summary for the user:** what was built, the test results, what Task 16 observed (or that it was skipped), known limitations (PRD §12), and that nothing was pushed.
- [ ] **Commit**: `chore(proctoring): acceptance sign-off`
