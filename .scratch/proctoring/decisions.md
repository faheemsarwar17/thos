# Interview Proctoring: decision log

Status: **Locked**, 2026-10-23 (planning session with the user, wayfinder + grilling).
Outputs: [prd.md](prd.md) (the spec) and [plan.md](plan.md) (the one-pass implementation plan).
Research: [assets/research-detection.md](assets/research-detection.md).

> **Precondition: this work starts only after the UI revamp (`.scratch/ui-revamp/`) is fully implemented and merged into `main`.** See PRD §0.

Every decision below was made by the user. The agent only proposed options.

| # | Question | Decision |
|---|---|---|
| Q1 | What does "done" mean? | A PRD plus a one-pass implementation plan, stored in `.scratch/proctoring/`. No tracker issues. |
| Q2 | What counts as a "voice anomaly"? | (b) a second person speaking or whispering, (c) audio played back from another device (TTS or recording), (d) a voice that does not match the candidate's earlier voice. |
| Q3 | Gaze policy | The **3rd** gaze violation ends the interview. Violations 1 and 2 each produce a warning. Voice anomalies are **flags only** and never end the interview. |
| Q4 | What happens on the 3rd violation? | The attempt is submitted immediately with whatever answers exist and marked `terminated` with a reason. **The candidate sees the reason.** |
| Q5 | What the reviewer sees | An event timeline, plus one webcam snapshot per gaze event, on the existing results view. No raw audio or video is stored. |
| Q6 | Consent | A consent screen is shown before starting. Declining blocks the interview. |
| Q7 | Tracker | Local markdown only. The plan is stored and is not an issue. |
| Q8 | Which interviews? | AI **profile screening** and the AI **job interview** only. The human LiveKit panel room and the sandbox are out of scope. |
| Q9 | What counts as a gaze strike? | Off-screen looks, a reading pattern, or no face → strike. Multiple faces → flag only. Thresholds were refined in Q21. |
| Q10 | Warning UX | A blocking modal ("Warning n of 2"). The AI and the mic pause until the candidate clicks "I understand". |
| Q11 | Persistence | Strikes are stored **server-side** on the attempt. A refresh or reconnect never resets them. |
| Q12 | Retakes | Job interview: termination is final unless an employer allows a retake. Profile screening: the normal attempt cap and cooldown apply, and the terminated attempt stays in history. |
| Q13 | Employer control | Per job posting toggle, **on by default**. Profile screening is always on. Thresholds are fixed backend config with no UI. |
| Q14 | Effect on scoring | None. Scoring stays independent and a human decides. A proctoring badge (Clean / Flagged / Terminated) appears next to the score. A terminated attempt is still evaluated on the answers it has. |
| Q15 | Calibration | Yes. A gaze calibration step plus a voice enrolment sample, both during device check. |
| Q16 | Conflict with the spec's "never auto-fail" rule | **Amend the spec.** Ending the interview is a session action, not a hiring decision. The attempt is still evaluated and a human makes every reject call. Update THOS_Development_Spec.md §192/§263. |
| Q17 | Camera | Required whenever proctoring is on. If the camera fails, the interview cannot start. If the camera drops mid-interview, it counts as "no face". |
| Q18 | Who has authority | The browser detects gaze and POSTs events to a new **authenticated** REST API. The **server** counts strikes and decides. Voice is analysed **server-side** in the LiveKit agent process. |
| Q19 | Snapshots | Small JPEGs under a new `snapshots_dir`, served only through an authenticated employer endpoint, deleted with the attempt. S3 is out of scope. |
| Q20 | Where results show | Job interview: a Proctoring section in the application drawer's Job Interview tab (badge, stop reason, timeline, snapshots). Profile screening: a status badge only (pipeline card/drawer and Talent). **Profile-screening snapshots are never captured.** |
| Q21 | Thresholds | Research defaults, except that **sustained off-screen gaze needs ≥ 10 s** (not 5 s). All are backend config. |
| Q22 | Replay/TTS detection | v1 uses **proxy flags only**: speech while the AI is talking, and unnaturally steady cadence. No anti-spoof classifier. |
| Q23 | Same-screen cheating | Tab hidden and window blur are **gaze-family strikes** on the same counter. A lost detector heartbeat for ≥ 15 s while connected is also a strike. |
| Q24 | Privacy | The voice embedding lives **in memory for the session only** and is never stored. Snapshots expire after **180 days**. The consent screen covers what is analysed, the 2-warnings rule, voice flags, retention, and an accommodation contact. |
| Q25 | Pre-existing drawer bug: `application-drawer.tsx:284` crashes the whole drawer for voice-evaluated interviews because voice evaluations have `dimensions` and string `evidence`, not `dimension_scores` | **Fix it in this plan** (user, 2026-10-23). Normalise on the backend at every API boundary, write canonical keys in new voice evaluations, and add a frontend normaliser. See PRD §5.11 and plan Task 7A. |
