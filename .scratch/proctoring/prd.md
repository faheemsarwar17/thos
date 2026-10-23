# PRD: THOS Interview Proctoring (gaze + voice)

Status: **Locked** for planning, 2026-10-23
Decision log: [decisions.md](decisions.md) · Research: [assets/research-detection.md](assets/research-detection.md) · Plan: [plan.md](plan.md)

---

## 0. Precondition: run this AFTER the UI revamp

> **This PRD and its plan must not be started until the UI revamp is done.**
>
> "Done" means all of the following:
> 1. Every task in `.scratch/ui-revamp/plan.md` is ticked (`- [x]`).
> 2. `feat/ui-revamp` is merged into `main`.
> 3. These files exist on `main`:
>    - `Frontend/components/layout/focus-layout.tsx`
>    - `Frontend/styles/screens/focus.css`
>    - `Frontend/e2e/fixtures.ts`
>
> **Why.** The revamp's Task 15 restyles every voice-interview file and freezes their logic: "zero diff in hooks/handlers". This feature changes exactly that logic. If both happen in parallel, they conflict line by line. Proctoring is therefore built **on top of** the revamped markup: `FocusLayout`, `.fx-*` classes, the Playwright harness, the `Modal` and `Drawer` primitives, and the `PageHeader` and `Switch` components.
>
> If the precondition is not met, stop and tell the user. Do not start, and do not do the revamp as part of this work.

## 1. Problem

The AI voice interviews (profile screening and the job interview) have no integrity controls beyond a one-shot identity photo check. A candidate can:
- read answers from a second screen, a phone or paper next to the camera;
- read from another tab on the same screen;
- have someone else in the room whisper or speak answers, or play back a TTS or recorded answer.

Employers see none of this. The camera is optional today (`PermissionCheck cameraRequired={false}`, and the camera-publish failure is only logged as a warning).

## 2. Goal

Add **proctoring** to both AI voice interviews:

1. **Gaze proctoring (enforced).** Gaze is analysed in the browser with MediaPipe FaceLandmarker.
   - Looking away or reading from somewhere, no face in view, a hidden tab, or a blurred window each count as a **violation**.
   - Violations 1 and 2 show a blocking **warning**.
   - **Violation 3 ends the interview.** The attempt is submitted immediately with the answers so far, marked `terminated`, and the **stop reason** is shown to the candidate and to reviewers.
2. **Voice proctoring (flag-only).** Voice is analysed on the server from the candidate's LiveKit audio.
   - Flags are raised for: a voice that doesn't match the enrolled voice, a second voice, whispering or background speech, speech while the AI is talking, and TTS-like cadence.
   - Flags **never** end the interview.
3. **Reviewer visibility.** Each attempt gets a proctoring outcome: **Clean / Flagged / Terminated**. Job interviews also get a timeline with gaze snapshots in the application drawer.
4. **Consent, calibration and privacy.** The candidate must give explicit consent before starting. Calibration and voice enrolment happen during the device check. The voice embedding is held in memory only, and snapshots expire after 180 days.

## 3. Non-goals, constraints and out of scope

- **Out of scope:**
  - the human LiveKit panel room (`/interviews/[roomName]`) and the coding sandbox (its existing proctoring stays as it is);
  - an anti-spoof or deepfake classifier;
  - S3 storage for snapshots;
  - admin UI for editing thresholds;
  - automatic rejection;
  - mobile-specific gaze tuning;
  - recording audio or video.
- **No hiring decision is automated** (rules.md 3.1). Termination is a *session* action. The attempt is still evaluated, and humans decide every stage move. The spec is amended accordingly (§11).
- **The server is authoritative.** Strike counts, cooldowns, warnings and termination are decided server-side and stored on the attempt. A refresh, reconnect or tampered client can never lower the count.
- **Business logic not listed here stays untouched:** turn engine, scoring, identity check, the sandbox, and the WebSocket message contract (new message types are only added).
- **Plain CSS on the revamp tokens.** No Tailwind, no component library, icons from `react-icons/lu`.
- **Allowed new dependencies (and nothing else):**
  - Frontend runtime: `@mediapipe/tasks-vision` `^1.1.1` and `@ricky0123/vad-web` `^0.0.31`.
  - Backend: an **optional** dependency group `proctoring-voice` containing `speechbrain>=1.0`, `torch` (CPU), `torchaudio` and `numpy`. The backend must run, and every test must pass, **without** this group installed (deterministic fallback, rules.md 3.10).

## 4. Domain language

Use these exact terms in code, UI copy and docs.

| Term | Meaning |
|---|---|
| **Proctoring** | Integrity monitoring of one interview attempt. It is *enabled* per attempt, and the value is frozen at `/voice/start`. |
| **Proctoring record** | The JSON document stored on the attempt in a `proctoring` column (§6). |
| **Event** | One observation: `{id, family, type, at, ...}`. |
| **Family** | `gaze` (enforced), `voice` (flag-only) or `session` (lifecycle). |
| **Violation** | A gaze-family event that is eligible to count. |
| **Strike** | A violation the server **counted**. Counting is limited by the cooldown and by a pending warning. |
| **Warning** | Server response to strikes 1 and 2. The candidate must acknowledge it before the interview resumes. |
| **Termination** | Server response to strike 3. The interview ends with `terminated.reason = "gaze_violation"`. |
| **Flag** | A voice-family event, or `multiple_faces`. It is recorded for reviewers and never counted. |
| **Outcome** | `clean` (no strikes, no flags), `flagged` (≥ 1 strike or flag, not terminated) or `terminated`. |
| **Envelope** | The per-candidate "looking at the screen" range of head and eye angles, set by calibration. |
| **Enrolment** | The candidate's voice embedding from the device-check read-aloud. Held **in memory only**. |

## 5. Behaviour

### 5.1 When proctoring is on

- **Profile screening:** always.
- **Job interview:** when the posting's `proctoring_enabled` is true. This is a new column, default **true**, shown as a Switch in the job create/edit form.
- The value is resolved at `POST …/voice/start` and frozen into `proctoring.enabled`. Changing a posting later does not affect attempts that have already started.
- The frontend learns it from `GET …/voice` → `proctoring.enabled`. Before start, this is resolved from the posting, or `true` for profile screening.

### 5.2 Candidate flow (when proctoring is on)

The steps are **Consent → Permissions → Device check (+ Calibration + Voice sample) → Setup → Interview**. All of them sit inside the revamp's `FocusLayout`. The step indicator gains "Consent".

1. **Consent** (new step).
   - The card lists:
     - what is analysed: face position and eye direction (in the browser); voice characteristics (on the server, held in memory only, deleted at the end of the session);
     - **the rule:** "Looking away from the screen, leaving this tab, or not being visible counts as a violation. After 2 warnings, the 3rd violation ends the interview and submits your answers.";
     - voice anomalies are flagged for human review and never end the interview;
     - what is kept: an event log, plus one still image per gaze violation for job interviews only, deleted after 180 days. No audio or video recordings are kept;
     - who sees it: the hiring team for this role (job interview), or nobody outside THOS staff beyond the status badge (profile screening);
     - an **accommodation** link (`mailto:`): the organization's `contact_email` for job interviews, `settings.proctoring_accommodation_email` for profile screening.
   - The candidate must tick a checkbox *and* type their full name as an e-signature to enable "I agree and continue".
   - "Decline" shows a blocking card: "You can't start this interview without agreeing to proctoring. Contact … for an accommodation." It has a Back button.
   - Consent is saved with `POST …/voice/proctoring/consent`. For an in-progress attempt that already has consent, the step is skipped.
2. **Permissions:** `PermissionCheck cameraRequired={proctoring.enabled}`.
3. **Device check:** the existing behaviour is kept, followed by two new panels before Continue is enabled.
   - **Calibration** (about 8 s):
     - A centre dot for 2 s, then four edge dots for about 1 s each. FaceLandmarker samples head yaw/pitch and the iris ratios, and their medians define the envelope.
     - The result is saved with `POST …/proctoring/calibration`.
     - It **fails**, with a Retry button, when the face is present in < 70% of frames or the light is too poor. Continue stays disabled until calibration passes.
     - The MediaPipe wasm and model start preloading as soon as the step mounts.
   - **Voice sample:** "Read this sentence aloud" (about 10 s, one sentence of about 25 words, shown on screen).
     - A 16 kHz mono WAV is recorded in the browser and uploaded once with `POST …/proctoring/enrolment` (multipart).
     - The server computes the embedding **in memory** and never writes the audio to disk.
     - If upload or processing fails, the step still passes. The server then enrols from the first 45 s of interview speech and records a `session/enrolment_fallback` event.
4. **Interview:** gaze detection runs on the live self-tile `<video>` (`selfVideoRef`) at 10–15 fps.
   - If the camera fails to publish, a blocking error card appears ("Your camera is required for this proctored interview") with Retry. The interview cannot proceed without the camera.
   - If the camera drops mid-interview, the "no face" rule handles it.
   - A small **"Proctored" chip** sits in the focus header's right slot. Its tooltip reads "Warnings used: n of 2".

### 5.3 Gaze rules

The browser detects violations and the server decides what they mean. Every number is backend config, delivered to the browser through `GET …/voice/proctoring` → `config`.

| Event type | Rule | Family / kind |
|---|---|---|
| `gaze_off_screen_sustained` | Gaze stays outside the envelope continuously for **≥ 10 s** | gaze · violation |
| `gaze_repeated_glances` | **≥ 4** excursions of **≥ 1.5 s** to the **same side** (left/right/up/down) within **30 s** | gaze · violation |
| `gaze_reading_pattern` | An excursion of **≥ 3 s** with **≥ 3** horizontal reversals (return sweeps) | gaze · violation |
| `face_missing` | Face presence < 0.5 for **≥ 5 s**, including when the camera track has ended | gaze · violation |
| `tab_hidden` | `document.visibilityState === "hidden"` for **≥ 2 s** | gaze · violation |
| `window_blur` | The window has lost focus for **≥ 3 s** while still visible (not already counted as `tab_hidden` in the same episode) | gaze · violation |
| `detector_heartbeat_lost` | **Server-side.** The candidate is connected to the LiveKit room, but no heartbeat has arrived for **≥ 15 s** | gaze · violation |
| `multiple_faces` | A second face with confidence ≥ 0.7 for **≥ 2 s**, checked every 1.5 s with `numFaces: 2` | gaze · **flag** |

**Smoothing and grace:**
- Signals are smoothed with an EMA of about 300 ms.
- Nothing counts for **3 s** after `agent_speech_ended` (thinking time).
- While the AI is speaking, every time threshold is multiplied by **1.5**.
- While a warning modal is open, no detection runs.

**Envelope:**
- The calibrated range plus a 5° margin.
- If calibration was skipped on resume, the stored envelope is reused.
- With no envelope at all, the absolute fallback is yaw ±25° and pitch −20° to +15°.

### 5.4 Server strike policy

Implemented as a pure function, `apply_event`, in `app/proctoring/policy.py`. For a gaze-family **violation**:

1. If `terminated` is already set, record the event with `counted=false, note="after_termination"` and do nothing else.
2. If `pending_warning` is set (the modal is still open), record it with `counted=false, note="warning_pending"`.
3. If the previous counted strike was less than **20 s** ago, record it with `counted=false, note="cooldown"`.
4. Otherwise `strikes += 1` and the event gets `counted=true, strike=strikes`.
   - **strikes ≤ 2** (`max_warnings`): set `pending_warning = {strike, event_id, at}`. The decision is `warn`.
   - **strikes == 3:** set `terminated = {reason: "gaze_violation", at, event_id, strike: 3}`. The decision is `terminate`.

**Flags** (voice family and `multiple_faces`) are recorded with `counted=false` and never change the strike count or the warnings.

**Session events** (`consent_given`, `calibration_completed`, `enrolment_completed`, `enrolment_fallback`, `warning_acknowledged`, `candidate_disconnected`, `terminated`, `voice_model_unavailable`) are recorded for the timeline only.

**Outcome:** `terminated` if `terminated` is set; otherwise `flagged` if there is any counted strike or any flag; otherwise `clean`.

### 5.5 Warning (strikes 1 and 2)

- **Server.** It persists the record and sends the WebSocket message `proctoring_warning {strike, max_warnings: 2, reason_code, message}`. The REST response returns the same `decision`, so the client never depends on the WebSocket alone. If a live session exists, it calls `session.pause_for_proctoring()`:
  - interrupt the agent's speech if it is speaking;
  - pause the duration timer and remember the time left;
  - set `paused=True` so no user turn is processed.
- **Client.** It opens a **blocking modal**, built on the revamp `Modal` with no Esc and no backdrop close.
  - Title: "Warning 1 of 2" (or "2 of 2").
  - Body: the reason in plain words (§5.7), plus "One more violation will end the interview and submit your answers." (or "Next violation ends…" after warning 2).
  - Button: "I understand, continue".
  - The mic is forced off while the modal is open, and gaze detection is suspended.
- **Acknowledge.** `POST …/proctoring/acknowledge {strike}`:
  - the server clears `pending_warning` and records `warning_acknowledged`;
  - `session.resume_after_proctoring()` resumes the timer with the remaining time;
  - the agent then says: "Thanks. Let's continue. " followed by the **last agent utterance** (so the candidate hears the question again);
  - the modal closes when the server's 200 response arrives.
- **On refresh with a pending warning:** `GET …/voice/proctoring` returns `pending_warning`, and the modal reopens as soon as the interview mounts.

### 5.6 Termination (strike 3)

1. The server sets `terminated`, records the `terminated` session event, and persists.
2. If a live session exists, it calls `session.terminate_for_proctoring()`:
   - interrupt speech;
   - **no closing line**;
   - flush assessments;
   - send `proctoring_terminated {reason_code, message}` and then the usual `interview_completed {reason: "proctoring_terminated"}`;
   - set COMPLETED (`submitted`) and schedule the analysis.
3. If there is no live session (for example, a strike arrives while the room is gone), the endpoint itself sets `status="submitted"` and awaits `synthesis_service.analyze_interview` in the same way `/complete` does.
4. **Client.** On `decision: "terminate"` (REST) or `proctoring_terminated` (WebSocket), it calls `finalizeInterviewSession()` and shows the **Terminated** card instead of "complete":
   - title "Interview ended";
   - body "Your interview was ended because: **{reason message}**. Your answers up to this point were submitted for review.";
   - the strike list with times;
   - "Back to candidate home".
5. **Evaluation.** The attempt is evaluated as usual. `_apply_proctoring_summary(report, record)` adds a concern line, e.g. "Interview ended early by proctoring after 3 gaze violations (reason: gaze violation)." or "Proctoring flags: 2 voice mismatch, 1 second voice.". The score is **not** changed.
6. **Retake.**
   - Job interview: `/voice/start` returns 409 `proctoring_terminated` when `terminated` is set. An employer can use **Allow retake** in the drawer (§5.9), which resets the attempt.
   - Profile screening: the normal attempt cap and cooldown apply. The terminated attempt stays in history.

### 5.7 Reason messages (candidate-facing, plain language)

| reason_code | Message |
|---|---|
| `gaze_off_screen_sustained` | "You looked away from the screen for too long." |
| `gaze_repeated_glances` | "You repeatedly looked at the same place away from the screen." |
| `gaze_reading_pattern` | "It looked like you were reading from somewhere off the screen." |
| `face_missing` | "Your face was not visible to the camera." |
| `tab_hidden` | "You left the interview tab." |
| `window_blur` | "You switched to another window." |
| `detector_heartbeat_lost` | "Proctoring stopped responding in your browser." |
| `gaze_violation` (termination) | "3 proctoring violations: {list of the three reason messages, in order}." |

### 5.8 Voice proctoring (server, flag-only)

`app/proctoring/voice.py` defines `VoiceMonitor`. It is started by `InterviewSession` after the room connects when `proctoring.enabled`.

- **Audio tap:**
  - wait for the remote participant whose identity starts with `candidate-`;
  - `rtc.AudioStream.from_participant(participant=p, track_source=rtc.TrackSource.SOURCE_MICROPHONE, sample_rate=16000, num_channels=1)`;
  - frames go to its own `silero.VAD` stream for segmentation;
  - heavy work runs on a `ThreadPoolExecutor(max_workers=2)`, never on the event loop.
- **Embedder:** `EcapaEmbedder` (`speechbrain/spkrec-ecapa-voxceleb`, cached at `settings.proctoring_model_dir`).
  - If `speechbrain` or `torch` cannot be imported, or the model fails to load, use `NullEmbedder`. Record one `session/voice_model_unavailable` event and keep only the heuristics that need no embedding.
- **Enrolment:**
  - Use the device-check sample if one is registered (`EnrolmentRegistry`, in memory, keyed by attempt id, 2 h TTL).
  - Otherwise use the mean embedding of the first ≥ 45 s of candidate speech.
  - Discard it when the session ends.
- **Flags:**

| type | Rule | Notes |
|---|---|---|
| `voice_mismatch` | Cosine to the enrolment < **0.25** on **2 consecutive** speech segments of ≥ 1.5 s | Needs the embedder |
| `second_voice` | Within one segment of ≥ 3 s, 1 s sub-windows have pairwise cosine < **0.30**, and at least one sub-window has > 0.40 to the enrolment | Needs the embedder |
| `whisper_background` | VAD probability between 0.2 and 0.5 for ≥ 1.5 s, **and** spectral flatness > baseline + 0.15 | Baseline is taken from the first 20 s of non-speech. Works without the embedder |
| `tts_cadence` | A segment of ≥ 20 s with a pause ratio < 3% **and** an RMS-envelope coefficient of variation < 0.15 | Marked `confidence: "low"` in the detail. Works without the embedder |
| `speech_during_ai_turn` | **Browser-side.** Detected with vad-web on a separate echo-cancelled mic stream while `isAgentSpeaking`, for ≥ 1.5 s, with no barge-in. POSTed as an event | The LiveKit mic is muted during AI turns, so the server cannot hear it |

- Each flag type is **deduplicated for 30 s**.
- Each flag carries `metrics` (cosines, durations) and **no audio**.

### 5.9 Employer visibility

- **Application drawer → Job Interview tab:** a new **Proctoring** section, shown when `applied_interview.proctoring` is present.
  - Outcome badge: Clean (green), Flagged (amber), Terminated (red), using the revamp `Pill` tones.
  - "Proctoring was off for this job" when it is disabled.
  - Stop reason when terminated, plus strikes used ("2 of 2 warnings used").
  - Counts: n strikes and n flags by type.
  - **Timeline:** time since start, family icon, plain-language label, a "counted strike #n" or "flag" tag, and a snapshot thumbnail when one exists.
    - Thumbnails load through the authenticated `AuthedImage` from `GET /api/v1/applications/{id}/proctoring/snapshots/{event_id}`. Clicking one opens it larger in a `Modal`.
  - **Allow retake** button, only when terminated. It opens a confirm modal, then `POST /api/v1/applications/{id}/applied-interview/allow-retake`. That resets status to `invited` and clears transcripts, responses, evaluation, plan, assessments, identity and room. The old proctoring record moves to `proctoring.history[]`, and its snapshots are kept until retention expires. The action is written to the audit log.
- **Pipeline cards** (every view) show a small proctoring chip **only when** the outcome is `flagged` or `terminated`. The source is `applied_interview_proctoring` (outcome) and `profile_proctoring_status` (the outcome of the best-scoring evaluated profile attempt).
- **Talent results:** a `profile_proctoring_status` chip with the same rule. **No snapshots and no timeline for profile screening, anywhere.**
- **Job create/edit:** a "Proctored interview (gaze + voice)" `Switch`, default on, with a help text line.

### 5.10 Candidate visibility

- The Terminated card (§5.6) appears right after termination and on any revisit of the interview URL.
- **Applications page** journey card: when terminated, the interview step shows "Ended early: {reason message}" in red. Flags are **not** shown to candidates. Strikes that did not terminate are not shown after the interview either.
- Candidate-facing payloads expose only `{enabled, outcome: "terminated" | null, terminated_reason_message, warnings_used}` and never the event list or flags. This is `public_view(record, audience="candidate")`.

### 5.11 Bug fix (in scope): the drawer crashes on voice-evaluated interviews

**The bug.**
- `ApplicationDrawer` expects the text-answer evaluation shape (`dimension_scores: [{dimension_id, label, score}]`, `evidence: [{dimension_id, text}]`) from `domain/evaluation.py`.
- Voice interviews are evaluated by `synthesis_service.map_report_to_evaluation`, which writes `dimensions: [{id, label, score, rationale}]` and `evidence: string[]`.
- `application-drawer.tsx:284` (`evaluation?.dimension_scores.map(...)`) runs at the component's top level, so **the whole drawer throws** for every voice-evaluated job interview. Lines 475 and 480 would throw too, and string evidence renders as blank rows.

**The fix:**
1. **Backend `normalize_evaluation(evaluation)`** (in `domain/evaluation.py`): pure, idempotent, never raises.
   - It converts the voice shape to the canonical shape, keeping unknown keys.
   - It is applied at **every API boundary** that returns an attempt evaluation: `GET /applications/{id}`, `GET …/voice`, and the candidate attempt endpoints in `candidates.py`.
   - Stored legacy rows are fixed on read; no data migration is needed.
2. **`map_report_to_evaluation`** also writes `dimension_scores` and object-shaped `evidence` for new evaluations, keeping `dimensions` for compatibility.
3. **Frontend `normalizeEvaluation()`** (`lib/evaluation.ts`) is used by the drawer, as defence in depth.
   - The drawer renders "Graded on N rubric dimensions" only when N > 0, and evidence without a dimension label as plain text.
   - The Scorecards tab's rubric falls back to the defaults when there are no dimensions.

## 6. Data model

**New columns** are added through `_AUTH_COLUMN_MIGRATIONS` in `Backend/app/db/database.py`. They work on both SQLite and Postgres.
- `("profile_interview_attempts", "proctoring", "TEXT")`
- `("applied_interview_attempts", "proctoring", "TEXT")`
- `("postings", "proctoring_enabled", "INTEGER NOT NULL DEFAULT 1")`

`"proctoring"` is added to the JSON key lists in `_attempt_row_to_dict` and `_applied_row_to_dict`. `proctoring_enabled` is coerced to bool like `sandbox_required` (store.py:1653/1669/1727).

**The proctoring record** (version 1):

```json
{
  "version": 1,
  "enabled": true,
  "kind": "applied",
  "started_at": "2026-…Z",
  "consent": {"accepted_at": "…", "signature_name": "Hira Ahmed", "policy_version": "proctoring-v1", "user_agent": "…"},
  "calibration": {"completed_at": "…", "envelope": {"yaw": [-18.2, 17.9], "pitch": [-12.0, 10.5], "iris_h": [0.38, 0.62], "iris_v": [0.40, 0.60]}, "face_presence": 0.94},
  "strikes": 1,
  "last_strike_at": "…",
  "pending_warning": {"strike": 1, "event_id": "pev_…", "at": "…"},
  "terminated": null,
  "heartbeat_at": "…",
  "voice": {"enrolled": true, "source": "device_check", "model": "ecapa" },
  "events": [
    {"id": "pev_…", "family": "gaze", "type": "gaze_repeated_glances", "at": "…", "counted": true, "strike": 1,
     "note": null, "metrics": {"side": "left", "excursions": 4, "window_s": 30}, "snapshot": "pev_….jpg"}
  ],
  "history": []
}
```

**Limits:**
- `events` keeps at most **500** entries. Once over the cap, the oldest `session` events are dropped first; counted strikes are never dropped.
- `metrics` values are numbers or short strings, ≤ 2 KB per event.
- Server-assigned `at` is authoritative. A client `client_ts` is kept inside `metrics`.

**Concurrency.** Events arrive from the browser (REST) and from the voice monitor (in process). All writes go through `proctoring.service.mutate(conn, kind, attempt_id, fn)`:
- it reads the row with `SELECT … FOR UPDATE` on Postgres, or inside `BEGIN IMMEDIATE` on SQLite;
- applies `fn` (the pure policy);
- writes it back and commits.

**Snapshots:**
- stored at `{settings.snapshots_dir}/{attempt_id}/{event_id}.jpg`;
- JPEG only, max 400 KB, max 640 px (the client downscales);
- **only for applied attempts**; profile-attempt events with a snapshot are rejected with 422;
- `purge_expired_snapshots(settings, now)` deletes files older than `proctoring_snapshot_retention_days` (180) and sets `snapshot: null` plus `snapshot_purged: true` on the events. It runs at app startup and then every 24 h from the FastAPI lifespan;
- deleting an attempt or application deletes its snapshot folder.

## 7. API

All candidate routes exist for both bases:
- `/api/v1/candidates/me/profile-interview-attempts/{id}/voice/proctoring…`
- `/api/v1/candidates/me/applied-interviews/{id}/voice/proctoring…`

They are authenticated with `CandidateContextDependency`, and ownership is checked through `voice.load_*_attempt`.

| Method + path | Body | Response |
|---|---|---|
| `GET …/voice/proctoring` | — | `{enabled, config, consent_required, calibration_required, envelope: {yaw, pitch, irisH, irisV} \| null, pending_warning, warnings_used, max_warnings, terminated: {reason_code, message, strikes:[{type,message,at}]} \| null}`. Candidate view, no flags. |
| `POST …/voice/proctoring/consent` | `{accepted: true, signature_name (2–120 chars), policy_version}` | `{ok: true}`. 422 if `accepted` is not true or the policy version is stale. |
| `POST …/voice/proctoring/calibration` | `{envelope, face_presence (0–1)}` | `{ok: true}`. 422 if `face_presence < 0.7`. |
| `POST …/voice/proctoring/enrolment` | multipart `file` (WAV, 16 kHz mono, ≤ 2 MB, 5–20 s) | `{enrolled: bool}`. Never 5xx on a model failure: it returns `enrolled: false`. |
| `POST …/voice/proctoring/events` | `{type, client_ts, metrics?, snapshot? (data URL JPEG)}`. `type` must be one of the browser types in §5.3/§5.8 | `{decision: "none" \| "warn" \| "terminate", strike, warnings_used, message, counted}`. 409 `proctoring_disabled` or `attempt_not_active`. |
| `POST …/voice/proctoring/acknowledge` | `{strike}` | `{ok: true}`. 409 if `strike` doesn't match `pending_warning`. |
| `POST …/voice/proctoring/heartbeat` | `{client_ts, fps, face_present}` | `{ok: true, pending_warning, terminated}`. The client also uses this to resync. |

**Employer routes** (tenant-scoped; `require_role(context, EMPLOYER_ROLES)`, or `PIPELINE_ROLES` for the retake):

| Method + path | Response |
|---|---|
| `GET /api/v1/applications/{id}` | **Extended:** `applied_interview.proctoring` = `public_view(record, "employer")`, i.e. the full record minus `history[].events[].metrics` noise, with snapshot URLs. |
| `GET /api/v1/applications/{id}/proctoring/snapshots/{event_id}` | `image/jpeg`. 404 if the event is missing or purged. |
| `POST /api/v1/applications/{id}/applied-interview/allow-retake` | `{ok: true}`, plus an audit record `applied_interview.retake_allowed`. 409 unless terminated. |
| Pipeline card (`_application_card`) | Adds `applied_interview_proctoring` (outcome or null) and `profile_proctoring_status`. |
| `GET /api/v1/talent` | Each result adds `profile_proctoring_status`. |
| Postings | `proctoring_enabled` added to `_posting_body`, `CreatePostingRequest` (default `True`) and `UpdatePostingRequest`. |

**Changes to existing endpoints:**
- `…/voice/start`: freezes `proctoring.enabled`.
  - If enabled and consent or calibration is missing: 409 `proctoring_setup_incomplete`.
  - If terminated: 409 `proctoring_terminated`.
  - Passes `proctoring_enabled` into the session config.
- `GET …/voice` (`_session_payload`) adds `proctoring: {enabled, outcome_for_candidate}`.

**WebSocket (server → client), new types:** `proctoring_warning`, `proctoring_terminated`, `proctoring_resumed`. Existing types are unchanged.

## 8. Frontend architecture

Everything new lives in `Frontend/components/interviews/proctoring/` and is styled with `Frontend/styles/screens/proctoring.css`, using revamp tokens only.

| Module | Responsibility |
|---|---|
| `proctoring-api.ts` | Typed calls for §7 (built on `utils/api.ts`'s `voiceBase`). |
| `gaze-engine.ts` | **Pure.** `createGazeEngine(config, envelope)` → `push(sample: GazeSample, ctx: {now, agentSpeaking, sinceAgentEndedMs}): GazeEvent[]`. Implements every rule in §5.3 except tab/blur and heartbeat. Fully unit-tested with synthetic samples. |
| `face-tracker.ts` | Lazily loads MediaPipe from `/mediapipe/` (self-hosted). `createFaceTracker()` → `{detect(video, ts): GazeSample, detectFaces(video, ts): number, close()}`. Computes yaw/pitch from the transformation matrix and the iris ratios. |
| `calibration.ts` | **Pure.** Turns calibration samples into an envelope: medians, ranges, margin, fallback. |
| `use-gaze-proctor.ts` | Hook. Runs a `requestVideoFrameCallback` loop on `selfVideoRef` at about 12 fps, feeds the engine, takes snapshots, POSTs events, and sends a heartbeat every 5 s. It is suspended while paused or when disabled. |
| `use-focus-proctor.ts` | Hook. Uses visibilitychange/blur timers to emit `tab_hidden` / `window_blur`. |
| `use-ai-turn-voice-guard.ts` | Hook. Runs vad-web on its own `getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})` stream while `agentSpeaking`, and emits `speech_during_ai_turn`. |
| `use-proctoring-session.ts` | Owns the proctoring state: `pendingWarning`, `terminated`, `warningsUsed`. Handles REST decisions and the WebSocket messages (wired from `InterviewInterface`), plus acknowledge and resync. |
| `ConsentStep.tsx`, `CalibrationPanel.tsx`, `VoiceSamplePanel.tsx`, `ProctoringWarningModal.tsx`, `ProctoringTerminatedCard.tsx`, `ProctoredChip.tsx` | UI |
| `wav-encoder.ts` | **Pure.** Turns Float32 PCM into a 16 kHz mono WAV Blob for enrolment. |
| `Frontend/components/pipeline/proctoring-panel.tsx` | The employer drawer section. |
| `Frontend/components/ui/proctoring-chip.tsx` | Outcome chip for cards and Talent. |

**Static assets:**
- `Frontend/public/mediapipe/` holds `vision_wasm_internal.{js,wasm}` and `face_landmarker.task`, pinned to the installed package version.
- `Frontend/public/vad/` holds the vad-web model and onnxruntime-web wasm.
- `scripts/copy-proctoring-assets.mjs` copies both, runs on `postinstall`, and is committed. The model file is downloaded once by that script from the Google Storage URL in the research doc.

**Test hook:** when `process.env.NEXT_PUBLIC_PROCTORING_TEST_HOOKS === "1"`, `window.__thosProctoring = { emit(type, metrics?), forceCalibration(envelope) }` is exposed so Playwright can inject violations. It is never enabled in production builds; the build fails if it is set while `NODE_ENV=production` and not in CI.

## 9. Backend architecture

| Module | Responsibility |
|---|---|
| `app/proctoring/__init__.py` | — |
| `app/proctoring/config.py` | `ProctoringConfig.from_settings(settings)`, a frozen dataclass of every threshold. `client_view()` returns the JSON sent to the browser. |
| `app/proctoring/policy.py` | **Pure.** `new_record`, `apply_event`, `acknowledge`, `heartbeat`, `outcome`, `public_view`, `reason_message`, the event type registry and `Decision`. No I/O. |
| `app/proctoring/service.py` | Load and mutate the record on the right table (kind-aware), handle snapshots (save, read, purge), and orchestrate decisions: notify the live session through `interview_manager`, or run the fallback submit. |
| `app/proctoring/enrolment.py` | `EnrolmentRegistry` (in-memory, TTL) and WAV decoding (stdlib `wave` + numpy, or pure Python if numpy is missing). |
| `app/proctoring/voice.py` | `VoiceMonitor`, `SpeakerEmbedder` protocol, `EcapaEmbedder`, `NullEmbedder`, heuristics (`spectral_flatness`, `pause_ratio`, `rms_cv`), all pure functions over numpy arrays. |
| `app/api/v1/proctoring.py` | The candidate and employer routes in §7, registered in `router.py`. |
| `app/ai/runtime/session.py` | Changes: `pause_for_proctoring`, `resume_after_proctoring`, `terminate_for_proctoring`, `_last_agent_text`, a pausable timer, a heartbeat watchdog (5 s tick), VoiceMonitor start/stop, and participant connect/disconnect tracking. |
| `app/ai/runtime/manager.py` | Changes: add `pause_for_proctoring(id)`, `resume_after_proctoring(id)`, `terminate_for_proctoring(id, reason)`, each delegating to the live session or returning `False` when there is none. |
| `app/services/synthesis_service.py` | Changes: `_apply_proctoring_summary(report, record)`, next to `_apply_identity_verdict`. |

**New settings** (`app/core/config.py`, env prefix `THOS_`):
- `proctoring_enabled_default=True`
- `proctoring_max_warnings=2`
- `proctoring_gaze_sustained_seconds=10.0`
- `proctoring_glance_seconds=1.5`, `proctoring_glance_count=4`, `proctoring_glance_window_seconds=30.0`
- `proctoring_reading_min_seconds=3.0`, `proctoring_reading_reversals=3`
- `proctoring_face_missing_seconds=5.0`
- `proctoring_multi_face_seconds=2.0`, `proctoring_multi_face_confidence=0.7`
- `proctoring_question_grace_seconds=3.0`, `proctoring_ai_speaking_multiplier=1.5`
- `proctoring_strike_cooldown_seconds=20.0`
- `proctoring_tab_hidden_seconds=2.0`, `proctoring_blur_seconds=3.0`
- `proctoring_heartbeat_interval_seconds=5.0`, `proctoring_heartbeat_timeout_seconds=15.0`
- `proctoring_envelope_margin_degrees=5.0`
- `proctoring_fallback_yaw_degrees=25.0`, `proctoring_fallback_pitch_down_degrees=20.0`, `proctoring_fallback_pitch_up_degrees=15.0`
- `proctoring_calibration_min_presence=0.7`
- `proctoring_snapshot_retention_days=180`, `proctoring_snapshot_max_bytes=400_000`
- `snapshots_dir="./data/proctoring"`
- `proctoring_voice_model="speechbrain/spkrec-ecapa-voxceleb"`, `proctoring_model_dir="./data/models"`
- `proctoring_voice_mismatch_threshold=0.25`, `proctoring_voice_mismatch_consecutive=2`
- `proctoring_second_voice_threshold=0.30`, `proctoring_second_voice_match=0.40`
- `proctoring_voice_min_segment_seconds=1.5`, `proctoring_enrolment_fallback_seconds=45.0`
- `proctoring_flag_dedup_seconds=30.0`
- `proctoring_accommodation_email="accessibility@thos.local"`
- `proctoring_policy_version="proctoring-v1"`

## 10. Acceptance criteria

1. **Strike policy is correct:**
   - violations 1 and 2 produce warnings;
   - violation 3 terminates;
   - violations during cooldown, during a pending warning or after termination are recorded as uncounted;
   - flags never count.
   - This is covered by pure unit tests and by endpoint tests.
2. **A refresh never resets anything.** The strike count, pending warning and termination survive a page reload. The modal or the Terminated card reappears (e2e).
3. **A terminated job interview:**
   - is `submitted` and then `evaluated`;
   - has an evaluation with a proctoring concern;
   - rejects `/voice/start` with 409;
   - can be reset by an employer with Allow retake.
4. **Consent is enforced:** `/voice/start` returns 409 without consent and calibration when proctoring is on, and the UI blocks on Decline.
5. **The camera is required when proctoring is on:** a camera failure shows a blocking card and the interview does not start.
6. **Proctoring off works as before:** a job interview whose posting has `proctoring_enabled=false` runs exactly as it does today, with no consent step, camera optional, no detection and no record events.
7. **Voice:**
   - flags appear on the employer timeline with metrics and never warn or terminate;
   - the backend starts and all tests pass without the `proctoring-voice` dependency group (`NullEmbedder` path);
   - no audio bytes are written anywhere.
8. **Snapshots:**
   - exist only for applied attempts;
   - are served only to the owning tenant's employers (another tenant gets 404, a candidate gets 401/403);
   - are purged after the retention period (unit test with an injected `now`).
9. **Candidates never see flags or the event list.** Every candidate response is checked by test.
10. **Checks pass:**
    - Frontend: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run e2e`, including the new proctoring specs and the revamp's layout rules on the new screens at 5 viewports × 2 themes.
    - Backend: `uv run pytest` and `uv run ruff check`.
11. **Drawer bug fixed (§5.11):** the application drawer opens and shows the score, dimensions and evidence for a voice-evaluated job interview, including legacy stored rows. A regression test proves the old code threw and the new code doesn't.
12. **Performance:** on a mid-range laptop, gaze detection holds ≥ 10 fps and adds < 25% CPU. A measured note is recorded in `.scratch/proctoring/assets/perf-note.md`. Detection drops to 6 fps automatically if the frame time is > 80 ms.

## 11. Documentation and spec amendments

- **THOS_Development_Spec.md:**
  - §192: reword to "integrity signals flag for human review and never auto-reject. A proctored voice interview may be **ended** after repeated disclosed gaze violations; the attempt is still evaluated and a human decides".
  - §263: the same clarification.
  - §401: add "proctoring consent".
- **architecture.md:** new §8.3 "Interview proctoring", covering the data flow, the authority model, the record schema and retention.
- **rules.md:** under 5.x, add "Proctoring snapshots and voice embeddings are personal data. Embeddings are never persisted; snapshots expire after 180 days and are tenant-scoped."
- **README.md and Backend/README.md:** the optional `uv sync --group proctoring-voice`, the model cache dir, and the new env vars.
- **Frontend/README.md:** the proctoring modules, asset copying and the e2e hooks.
- **design.md (v3.x):** proctoring components (warning modal, terminated card, chip, drawer panel).

## 12. Risks and known issues

- **False-positive terminations.** This is stricter than every vendor surveyed (research §2.2). Mitigations: calibration, grace periods, the 1.5× multiplier while the AI speaks, the 20 s cooldown, 10 s sustained, two warnings, a human reviewing every termination, Allow retake, and the accommodation contact. Thresholds are config so they can be tuned on pilot data.
- **Evasion.** Notes taped inside the envelope, or a second screen right behind the webcam, cannot be detected. This is documented as a limitation.
- **Legal.** Voice embeddings are biometric data (GDPR Art. 9, BIPA). Mitigations: explicit consent, an e-signature, embeddings held in memory only, retention, and the accommodation path. A DPIA is recommended before production; the plan adds a reminder line to the docs.
- **Performance on low-end machines.** About 17 MB of assets, preloaded during the device check, plus a frame-rate fallback.
- **In-process agent.** Sessions and enrolments are in memory and die on a server restart. The strike record survives because it is in the database. After a restart the voice monitor re-enrols with the fallback.
- **Evaluation shapes.** Two evaluators write different shapes (text-answer vs voice). §5.11 makes the API always return the canonical shape. Any new endpoint that returns an attempt evaluation must go through `normalize_evaluation`, and `architecture.md` §8.3 must say so.
