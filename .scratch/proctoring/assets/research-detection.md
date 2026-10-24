# Proctoring detection research: gaze and voice

Researched 2026-10-23. Every claim cites its source. Anything labelled **[inference]** is my own reasoning or a proposed default, not a sourced fact. Numbers labelled "proposed" are starting points to tune on pilot data. They are not published constants.

Repo context (checked in code):
- Frontend: `next ^15.4.1`, `react ^19.1.0`, `livekit-client ^2.15.5`, `@livekit/components-react ^2.9.14` (`Frontend/package.json`). The camera and mic code lives in `Frontend/components/interviews/voice/` (`DeviceCheck.tsx`, `DevicePermissionGate.tsx`, `InterviewInterface.tsx`, `LiveKitRoomWrapper.tsx`).
- Backend: `livekit-agents>=1.6` (1.8.6 installed), `livekit>=1.0` (rtc 1.1.20 installed), `livekit-plugins-silero` (`Backend/pyproject.toml`). The agent pipeline is "Silero VAD -> OpenAI STT -> GraphLLM" in `Backend/app/ai/runtime/session.py:3,177-179`. **This means Silero VAD and the candidate's raw audio frames already pass through the backend agent process.**

---

## 1. In-browser gaze and head pose

### 1.1 MediaPipe Tasks Vision: FaceLandmarker (`@mediapipe/tasks-vision`)

| Fact | Value | Source |
|---|---|---|
| Latest stable version | **1.1.1**, published 2026-10-14. Nightly is `1.2.0-rc.20261023`. Previous stable was 0.10.35 (2026-04-27). | npm registry `registry.npmjs.org/@mediapipe/tasks-vision` |
| License | **Apache-2.0** | npm registry |
| Bundle | `vision_bundle.mjs` is about 156 KB. The wasm comes in three variants: SIMD `vision_wasm_internal.wasm` (13.5 MB), module variant (13.5 MB) and no-SIMD (12.6 MB). Unpacked package is about 42 MB. | `unpkg.com/@mediapipe/tasks-vision@1.1.1/?meta` |
| Model file | `face_landmarker.task` (float16, v1), **3,758,596 bytes (3.6 MB)**, last modified 2023-05-03, at `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task` | HTTP HEAD on that URL; package README |
| Models in the bundle | BlazeFace short-range detector (192x192 input), FaceMesh-V2 (256x256), and a blendshape model (1x146x2). All float16. | developers.google.com/edge/mediapipe/solutions/vision/face_landmarker |
| Outputs | **478** 3D landmarks per face, 52 blendshape scores, and an optional facial transformation matrix | same page; web_js guide |
| Options and defaults | `min_face_detection_confidence` 0.5, `min_face_presence_confidence` 0.5, `min_tracking_confidence` 0.5, `output_facial_transformation_matrixes` false, `num_faces` 1. **Smoothing applies only when num_faces = 1.** | face_landmarker overview page |
| Web API | `FilesetResolver.forVisionTasks(<wasm base>)`, then `FaceLandmarker.createFromOptions/createFromModelPath`. Set `runningMode: "VIDEO"` and call `detectForVideo(video, timestampMs)`. Options include `outputFaceBlendshapes`, `outputFacialTransformationMatrixes`, `numFaces` and `delegate: "GPU"/"CPU"`. | web_js guide; `mediapipe/tasks/web/vision/face_landmarker/face_landmarker.ts` (L300, L340) |
| Gaze blendshapes | `eyeLookDownLeft/Right`, `eyeLookInLeft/Right`, `eyeLookOutLeft/Right`, `eyeLookUpLeft/Right` (blendshape indices 11-18) | `mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc` L75-82 |
| Left/right convention | "Left and Right blendshapes correspond to the subject's face, not the viewer." | web_js guide |

**Deriving head pose ([inference], standard math).** `facialTransformationMatrixes[0].data` is a 4x4 matrix stored as 16 floats. It maps a canonical face model into camera space. Take the 3x3 rotation block R. If the data is column-major, `R[r][c] = d[c*4 + r]`. Then:
- pitch = atan2(R[2][1], R[2][2])
- yaw = asin(-R[2][0])
- roll = atan2(R[1][0], R[0][0])

**The signs and the axis order have to be checked empirically.** Look left/right/up/down during development and log the values. A cheaper alternative needs no matrix: use the horizontal offset of the nose tip (landmark 1) relative to the midpoint of the eye corners (33, 263), normalised by the inter-ocular distance.

**Deriving eye gaze ([inference]; iris indices are the well-known 468-477 range that brings the count from 468 to 478).**
- Iris centres are landmarks 468 and 473. Eye corners are 33/133 and 362/263. Lids are 159/145 and 386/374.
- Horizontal ratio = (iris.x - inner.x) / (outer.x - inner.x). It is about 0.5 when looking straight ahead.
- Vertical ratio is the same calculation using the lids.
- Cross-check with blendshapes: horizontal gaze ≈ eyeLookOut_L - eyeLookIn_L (and the mirror for R), vertical ≈ eyeLookUp - eyeLookDown.
- Combined screen-relative direction ≈ head yaw/pitch + eye-in-head offset. Use the calibration step to subtract a per-person baseline.

**FPS.** Google does not publish web latency figures for FaceLandmarker on the pages checked, so **measure on target hardware**. We need about 10-15 fps for the heuristics below, not 30. Running `detectForVideo` on every second or third `requestVideoFrameCallback` keeps the CPU low. [inference]

**Hosting.** The official examples load the wasm from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@<ver>/wasm` and the model from `storage.googleapis.com`. Recommendation: **self-host both** under `Frontend/public/mediapipe/` and pin the version.
- Reason 1: candidates behind corporate firewalls or CSPs.
- Reason 2: no third-party fetch during an interview.
- Reason 3: the `@latest` CDN path can silently drift. 1.x has only just replaced 0.10.x.

The total download is about 13.5 MB of wasm plus 3.6 MB of model, so load it during the device-check step, not when the interview starts. [inference]

**Next.js 15 / React 19 gotchas** ([inference] from how the API works):
- It is browser-only (wasm + WebGL). Put it in a `"use client"` component and import it dynamically inside `useEffect` (or use `next/dynamic` with `ssr:false`) so the server build never evaluates it.
- Create one `FaceLandmarker` per page. React StrictMode double-mounts effects in dev, so guard against that and call `.close()` on unmount.
- `detectForVideo` needs monotonically increasing timestamps. Use `performance.now()`.
- If you add a CSP, it needs `'wasm-unsafe-eval'` in `script-src`. No CSP is set in `next.config.ts` today.
- Reuse the same `MediaStream` that LiveKit publishes/shows for the self tile. Do not open a second `getUserMedia` call, because some browsers then prompt again or pick a different camera.

### 1.2 WebGazer.js
- License: **GPLv3**. "Companies have the option to license WebGazer.js under LGPLv3 while their valuation is under $1,000,000." (github.com/brownhci/WebGazer README)
- **End-of-life as of 2026-02-24**: "updates are no longer guaranteed" (same README).
- It predicts screen x/y coordinates. It self-calibrates from clicks and cursor movement, and has an optional structured calibration. It **requires calibration** and drifts as the head moves. A voice interview gives few clicks to recalibrate from.
- **Verdict: reject.** The licence is copyleft for a closed SaaS above $1M valuation, the project is EOL, and calibration does not fit a voice interview.

### 1.3 Human (`@vladmandic/human`)
- npm **3.3.6** (published 2025-08-26), **MIT**. The GitHub repo is not archived, last pushed 2025-12-13 (GitHub API).
- Built on TensorFlow.js. Backends: WebGL, WebGPU, WASM, CPU. It bundles BlazeFace, FaceMesh and Iris, and also provides gaze, head rotation, face description/recognition and more (repo README).
- Pros: one library also gives face matching (candidate swap) and an "antispoof"/liveness model.
- Cons: heavier (TF.js), a single maintainer, and updates have slowed (no npm release in 14 months). The underlying face models are the same MediaPipe lineage.

### 1.4 Recommendation for gaze
**Use MediaPipe FaceLandmarker 1.1.x, self-hosted.** It is Apache-2.0, first-party, actively released, and gives iris, blendshapes and a head-pose matrix in one call, which is all we need. Keep Human as a fallback if we later want in-browser face re-identification.

---

## 2. Telling "reading" apart from normal thinking glances

### 2.1 What the evidence says
- **Gaze aversion is normal during thinking.** People avert their gaze more as questions get harder, and this happens both face to face and over a video link. The function is to manage cognitive load (Doherty-Sneddon & Phelps 2005, *Memory & Cognition*; Glenberg, Schroeder & Robertson 1998). **So brief off-screen glances while formulating an answer must not count. This is the main false-positive risk.**
- **Reading has a recognisable eye-movement signature.** It is a sequence of small horizontal saccades in one direction, then a large opposite-direction "return sweep" to the start of the next line. Return sweeps affect about 20% of reading fixations (PMC6863793). Bulling et al. (IEEE TPAMI 33(4), 2011) recognised "reading a printed paper" from eye-movement features (saccades, fixations, blinks, repetitive patterns) at 76.1% precision / 70.5% recall person-independent. That was with EOG, which is much cleaner than a webcam.
- **Webcam limits.** A MediaPipe-FaceLandmarker webcam tracker validated against research-grade trackers systematically over-estimated saccade amplitude (syskonf crater2025 submission). Treat fine saccade detection as noisy. Use it as **supporting evidence**, never as the only trigger. [inference]
- **Academic proctoring systems.** Atoum et al., "Automated Online Exam Proctoring" (IEEE TMM 19(7), 2017) combine gaze estimation, voice detection, phone detection, text detection and user verification. They classify over a **temporal sliding window**, not per frame.

### 2.2 How vendors describe their rules (public docs)
- **Proctorio**: "does not track eye movements, but may use facial detection to ensure test takers are not looking away from their exam for an extended period of time" (USI misconceptions FAQ). Proctorio's patent (US 11961302) defines abnormal head pose as yaw, pitch or roll above a threshold, and face disappearance as head position unavailable for N frames. **It flags; humans review.**
- **Honorlock**: AI flags "looking away", multiple faces, phone, speech. "The AI won't stop the exam; it will flag it" for a live proctor to review. When notes or scratch paper are allowed, the face sensor is "automatically desensitized to prevent flags for looking down" (U. Missouri / UMN Honorlock KB pages).
- **Mercer Mettl**: flags include Candidate Not Present, Additional Person Present, Away from test window, Mobile phone detected, Face partially visible. They feed a weighted "Credibility Index" (High/Medium/Low) (support.mettl.com).
- **HireVue**: dropped visual/facial analysis from assessments in March 2020 (announced Jan 2021), after an EPIC FTC complaint, because it "no longer significantly added value" (SHRM; EPIC).
- None of these vendors publish second-level thresholds. **Note that every vendor above flags for human review. Our "third violation auto-ends" policy is stricter than the industry norm**, which raises the bar on false positives (see Risks).

### 2.3 Proposed defaults [inference; tune on pilot data]
Run at 10-15 fps and smooth with an EMA (about 300 ms) or a 5-frame median.

**Calibration (5-8 s, during device check, right after the camera preview):**
1. "Look at the centre dot" for 2 s. Record the baseline yaw, pitch and iris ratios (median).
2. Briefly show dots at the four screen edges (about 1 s each). This gives the per-candidate "still on screen" envelope, which absorbs camera placement (laptop vs external webcam above or beside the monitor).
3. The on-screen envelope is the calibrated range plus a 5° margin. If calibration fails (no face, or poor light where face presence < 0.7), fall back to absolute limits of yaw ±25° and pitch -20°/+15°.

**States:**
| Signal | Rule (proposed) | Outcome |
|---|---|---|
| Off-screen excursion | Head + eye direction outside the envelope | Start timer |
| **Gaze violation** | One continuous excursion **≥ 5 s**, OR **≥ 4 excursions of ≥ 1.5 s to the same side within 30 s** (repeated returns to one spot suggests a second screen or paper), OR an excursion ≥ 3 s **plus** a reading signature (≥ 3 return-sweep-like horizontal reversals) | Count 1 violation, take a snapshot |
| No face | Face presence < 0.5 for **≥ 5 s** | Count as a gaze violation (cannot verify). Snapshot. |
| Multiple faces | `numFaces: 2` and a second face with confidence ≥ 0.7 for **≥ 2 s** | Flag only (portraits and posters cause false positives, as Honorlock notes) |
| Grace windows | Ignore the first **3 s** after the AI finishes a question (thinking time). Use relaxed thresholds (×1.5) while the AI is speaking. | Lowers false positives |
| Cooldown | After a violation, no new violation can be counted for **20 s** | Stops one long look-away from burning all 3 strikes |
| Policy | Violations 1 and 2 show a modal warning that must be dismissed. Violation 3 auto-ends and submits. | As specified |

Also capture `visibilitychange`/`blur` (tab switch). Reading from a window **on the same screen** is invisible to gaze tracking. [inference]

Setting `numFaces: 2` disables MediaPipe's landmark smoothing (overview page). Either run a cheap second pass every 1-2 s with numFaces 2 alongside the main numFaces 1 loop, or do the smoothing ourselves. [inference]

---

## 3. Voice anomaly detection

### 3a/3b. Speaker embeddings (second speaker; mismatch against enrolment)

| Option | License | Facts | Source |
|---|---|---|---|
| **SpeechBrain ECAPA-TDNN** `speechbrain/spkrec-ecapa-voxceleb` | Apache-2.0 (model and `speechbrain` 1.1.2) | 16 kHz mono. EER **0.80%** on VoxCeleb1-test (clean). 192-dim embedding (`lin_neurons: 192`). Checkpoint about **83 MB**. `SpeakerRecognition.verify_batch` default `threshold=0.25` on cosine. | HF model card; `hyperparams.yaml`; `speechbrain/inference/speaker.py` L62 |
| **Resemblyzer** (GE2E) | Apache-2.0 | 256-dim. Runs on CPU. "Works best on English". Last PyPI release 0.1.4 on 2023-10-12, so effectively unmaintained. | github.com/resemble-ai/Resemblyzer; PyPI |
| **pyannote.audio** 4.0.7 (py≥3.10) + `speaker-diarization-community-1` | Pipeline weights **CC-BY-4.0, gated: requires an HF account and access token and accepting conditions** | Offline diarization (DER on AliMeeting 20.3%). Built for whole files, not live streaming. The `pyannote/wespeaker-voxceleb1-resnet34-LM` embedding model is also gated (returned 401 to an anonymous fetch). | HF model card; PyPI |
| **WeSpeaker** | Apache-2.0 | ResNet, ECAPA, CAM++ and others. 0.723% EER on Vox1-O-clean. **ONNX export and runtime support.** CLI `wespeaker --task embedding`. | github.com/wenet-e2e/wespeaker |

**CPU feasibility [inference].** ECAPA (about 20M params) embeds a 2-3 s window in tens of ms on one modern CPU core. A sliding window every 1-2 s per interview is cheap. pyannote's full diarization pipeline is heavier and batch-oriented. We only need *"is this the same voice as enrolment, and is there more than one cluster?"*, so plain embeddings plus cosine are enough.

**Proposed approach [inference]:**
- **Enrolment.** During device check, ask the candidate to read a sentence aloud for 8-10 s. Store the mean ECAPA embedding **in memory or in the attempt row only, never the audio**. Also add the first 30-60 s of interview answers, which are acoustically closer to the interview conditions.
- **Monitoring.** On each VAD speech segment ≥ 1.5 s from the candidate track, compute the embedding and its cosine similarity to the enrolment embedding.
  - **Mismatch flag** (proposed): cosine **< 0.25** for **2 consecutive segments**. 0.25 is SpeechBrain's own default decision threshold. The mic changes between enrolment and interview are small because it is the same device, but emotion, whisper and headset changes lower the score. Calibrate on pilot data, for example as the 1st percentile of genuine scores.
  - **Second speaker** (proposed): within a segment, embed 1 s sub-windows. If two sub-windows have cosine < 0.3 to each other and one of them matches enrolment (> 0.4), flag "possible second voice". Whispering is low-energy and spectrally different, so ECAPA is unreliable on it. Use the energy heuristic in 3e instead.
- All of these are **flags only**, as the policy requires.

### 3c. Replay / TTS / synthetic speech detection
- **AASIST** (clovaai/aasist): **MIT**. AASIST-L has 85,306 params. On ASVspoof 2019 LA: AASIST EER 0.83% (min t-DCF 0.0275), AASIST-L EER 0.99%. **Trained only on ASVspoof2019 LA.** (repo README)
- **Generalisation is the core problem.** Müller et al., "Does Audio Deepfake Detection Generalize?" (arXiv 2203.16263): on real-world "In-the-Wild" audio, detectors showed "performance degradation of up to one thousand percent" compared with ASVspoof.
- ASVspoof 5 (arXiv 2601.03944; about 2,000 speakers, 32 attack algorithms): good submissions exist, but performance "degrades under adversarial attacks and neural encoding/compression". **WebRTC Opus is exactly that kind of codec channel.** The ASVspoof5 baseline is wav2vec2-XLSR(300M) + AASIST, which is heavy for CPU.
- **Replay through a speaker into the candidate's mic** is a "physical access" scenario. LA-trained models such as AASIST are not trained for it. I found no maintained, production-grade pip package for this.
- **Verdict [inference]:** do **not** ship a spoofing classifier in v1, because false positives through Opus and consumer mics would be high. Cheap proxy signals instead:
  1. Candidate speech while the AI is speaking, with no barge-in pattern.
  2. Speech segments with near-zero pauses and unnaturally steady energy and pitch (TTS cadence).
  3. Voice mismatch (3b).
  4. If we want to experiment, run AASIST-L **offline and shadow-only** on flagged segments, log the score and never show it.

### 3d. Where to run
- **Server-side (recommended).** The repo's LiveKit agent already subscribes to the candidate's mic for STT (`session.py`). Two ways to tap PCM:
  1. `rtc.AudioStream.from_participant(participant=..., track_source=TrackSource.SOURCE_MICROPHONE, sample_rate=16000, num_channels=1)`. This is an async iterator of `AudioFrameEvent` objects; `frame.data` is int16 PCM. The signature is checked in the installed `livekit/rtc/audio_stream.py` L147 (defaults: 48000 Hz, 1 channel, optional `frame_size_ms`, `noise_cancellation`). Docs: docs.livekit.io raw-tracks.
  2. Override `Agent.stt_node(self, audio: AsyncIterable[rtc.AudioFrame], ...)` (`livekit/agents/voice/agent.py` L374), tee the frames into the proctoring analyser, then delegate to the default `Agent.default.stt_node`.
  - Option 1 is cleaner, because it is independent of turn handling and still sees speech while the agent is talking. [inference]
  - Requesting 16 kHz mono from AudioStream gives frames that ECAPA and Silero can use without extra resampling code.
- **In-browser** (`onnxruntime-web` + ECAPA ONNX) is possible but heavy: an 80 MB model download, plus a tamper surface (a candidate can block the reporting). Keep the browser for VAD/energy UI hints only.
- **Do not run heavy speaker models inside the agent's event loop.** Use a thread or process pool so voice latency for the interview is not affected. [inference]

### 3e. Lightweight VAD
- **@ricky0123/vad-web** 0.0.31 (2026-09-12), **ISC**, depends on `onnxruntime-web ^1.17`. `MicVAD` options and defaults: `model "legacy"` (or `"v5"`/`"v6"`), `positiveSpeechThreshold 0.3`, `negativeSpeechThreshold 0.25`, `redemptionMs 1400`, `minSpeechMs 400`, `preSpeechPadMs 800`, `baseAssetPath "/"`, `onnxWASMBasePath "/"`, `getStream`. Callbacks: `onSpeechStart`, `onSpeechEnd(Float32Array)`, `onFrameProcessed`, `onVADMisfire` (docs.vad.ricky0123.com). For Next.js, copy the model and ORT wasm files into `public/` and point `baseAssetPath`/`onnxWASMBasePath` at them. Pass `getStream` so it reuses the LiveKit mic stream.
- **Silero VAD** (snakers4/silero-vad, **MIT**, v6.2.3): about 2 MB, "< 1 ms per 30+ ms chunk on a single CPU thread", 8/16 kHz. **It already runs in the backend agent** via `livekit-plugins-silero`, so server-side VAD is free.
- **Whisper/second-person heuristic [inference].** Whispered speech is unvoiced: it has low RMS, a high spectral flatness and zero-crossing rate, and no pitch. Rules:
  - Flag "possible whisper/background voice" when the VAD probability is between 0.2 and 0.5 (sub-threshold) for ≥ 1.5 s while the candidate is *not* in an answer turn, or while the AI is speaking, **and** spectral flatness is above the baseline from device check.
  - Separately flag "speech during AI turn" when the VAD says speech while the agent's TTS is playing and no barge-in follows. Echo cancellation should remove the AI's own voice, but verify that headphones are not required.

---

## 4. Privacy and legal notes (practical, not legal advice)
- **GDPR Art. 9(1)** prohibits processing "biometric data for the purpose of uniquely identifying a natural person". **Art. 9(2)(a)** lifts the prohibition with "explicit consent … for one or more specified purposes" (gdpr-info.eu).
  - Voice-match embeddings used to verify identity are biometric data for this purpose.
  - Gaze or head-pose without identification is arguably not Art. 9 data, but it is still personal data.
  - Consent in employment or hiring contexts is often questioned as not "freely given". Run a DPIA and offer an alternative path (for example a human-proctored interview).
- **EU AI Act Annex III**: point 4(a), AI "to evaluate candidates" in recruitment, and point 3(d), "monitoring and detecting prohibited behaviour … during tests", are **high-risk**. Auto-terminating an interview on an AI signal is exactly the kind of decision the high-risk obligations target: human oversight, logging, and transparency (artificialintelligenceact.eu/annex/3).
- **Illinois BIPA** (740 ILCS 14):
  - "Biometric identifier" includes a **voiceprint** and a **scan of face geometry**.
  - Requires a public **retention and destruction policy** (destroy when the purpose is satisfied or within 3 years of the last interaction, whichever comes first).
  - Requires **written notice of purpose and duration plus a written release** before collection.
  - Liquidated damages are $1,000 (negligent) or $5,000 (intentional/reckless).
  - Public Act 103-0769 (signed 2024-08-02) makes repeated collection from the same person **one violation** and confirms that an **electronic signature** counts as a written release (Faegre Drinker; Greenberg Traurig summaries of SB 2979).
  - Facial landmarks computed in the browser and discarded are lower risk, but a **voice embedding stored server-side is squarely a voiceprint**.
- **Practical checklist [inference]:**
  - Show a separate consent screen before device check, with an explicit checkbox and e-signature (name + timestamp) stored with the attempt.
  - Consent wording should name what is analysed (face position and eye direction in your browser; voice characteristics on our servers), why (interview integrity), what is kept (event log, one still image per gaze event, no audio/video recordings, voice signature deleted at session end), how long (for example 90 days, then deleted), who sees it (the hiring team for this role), and how to object or request an alternative.
  - **Discard the voice embedding when the session ends.** Keep only the anomaly events.
  - Treat snapshots as personal data: access-controlled, with signed URLs and auto-expiry.
  - Show warnings to the candidate in plain language, and keep a human-review path for any auto-ended interview.

---

## Recommendation

**Gaze: MediaPipe `@mediapipe/tasks-vision` 1.1.x FaceLandmarker, in the browser.**
- Self-host the wasm and `face_landmarker.task` under `public/`, preloaded during device check.
- `runningMode: VIDEO`, `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: true`, `numFaces: 1`, `delegate: "GPU"` with CPU fallback. Run at about 10-15 fps on the existing self-tile stream.
- A 5-8 s calibration step defines the per-candidate on-screen envelope.
- Defaults (proposed):
  - Violation = continuous off-screen ≥ 5 s, OR ≥ 4 same-side excursions ≥ 1.5 s within 30 s, OR off-screen ≥ 3 s with a reading signature, OR no face ≥ 5 s.
  - 3 s grace after each AI question, 20 s cooldown between violations.
  - Multiple faces ≥ 2 s = flag only.
- The browser sends `{type, ts, metrics}` plus a single JPEG snapshot (canvas `toBlob`, about 640 px) to the backend. **The backend is the authority on the strike count** and the auto-submit, so a page refresh does not reset strikes.

**Voice: server-side in the LiveKit agent process (in a worker pool).**
- Tap the candidate track with `rtc.AudioStream.from_participant(..., sample_rate=16000, num_channels=1)`.
- Reuse Silero VAD for segmentation.
- Use **SpeechBrain ECAPA (`spkrec-ecapa-voxceleb`, Apache-2.0)** for enrolment and per-segment cosine. Enrol from a device-check read-aloud plus the first answers.
- Flags (proposed): mismatch when cosine < 0.25 on 2 consecutive segments. Second voice from intra-segment embedding divergence. Whisper or background speech from sub-threshold VAD plus a spectral-flatness heuristic. Speech during the AI turn.
- **No replay/TTS classifier in v1.** Optionally shadow-log AASIST-L scores.
- **Flags only, never termination.**
- Alternative if HF downloads are a problem: WeSpeaker ONNX (Apache-2.0). Avoid pyannote, because it is gated, needs an HF token, and is batch-oriented.

**Known risks**
1. **False positives on auto-termination.** Natural gaze aversion while thinking is well documented. Webcam placement, glasses, low light, strabismus and some disabilities skew iris and pose estimates. Every vendor surveyed flags for human review instead of terminating. Mitigations: calibration, grace windows, cooldown, a visible warning UX, and human review of auto-ended attempts. Consider making strike 3 "end + mark for review", not a hard reject.
2. **Accessibility and bias.** Offer an accommodation path that disables gaze termination.
3. **Evasion.** Notes taped beside the camera, or a second screen directly behind the webcam, can stay inside the envelope. Same-screen windows need `visibilitychange`/`blur` detection. Tampering with client JS can suppress events, so treat a heartbeat gap from the gaze worker as its own flag.
4. **Voice model limits.** Codec, emotion and whisper lower ECAPA cosine scores. Spoof detectors do not generalise (degradation of up to 1000% in the wild). Keep everything flag-only and tune thresholds on pilot data.
5. **Performance.** About 17 MB of first-load assets and constant per-frame inference on low-end laptops. Watch CPU and fall back to a lower fps.
6. **Legal.** Voice embeddings are biometric under GDPR Art. 9 and BIPA. Auto-decisions in hiring are high-risk under the EU AI Act. Explicit consent, a retention schedule and a human-oversight path are prerequisites, not nice-to-haves.

## Sources
- npm: https://registry.npmjs.org/@mediapipe/tasks-vision · https://unpkg.com/@mediapipe/tasks-vision@1.1.1/ · https://registry.npmjs.org/@vladmandic/human · https://registry.npmjs.org/@ricky0123/vad-web
- MediaPipe: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker · https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js · https://github.com/google-ai-edge/mediapipe (face_blendshapes_graph.cc, face_landmarker.ts)
- https://github.com/brownhci/WebGazer · https://github.com/vladmandic/human
- Gaze aversion: https://researchportal.northumbria.ac.uk/en/publications/gaze-aversion-a-response-to-cognitive-or-social-difficulty/ · Reading/return sweeps: https://pmc.ncbi.nlm.nih.gov/articles/PMC6863793 · Bulling 2011: https://perceptualui.org/publications/bulling11_pami/ · Webcam MediaPipe saccade validation: https://admin.syskonf.pl/conf-data/crater2025/submissions/s96084004605_t4_v1_en.pdf · Atoum 2017: https://ieeexplore.ieee.org/document/7828141
- Vendors: https://www.usi.edu/media/oozd23zq/misconceptions-faq.pdf · https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/11961302 · https://teaching.missouri.edu/blog/navigating-online-proctoring-introducing-honorlock · https://it.umn.edu/node/158391 · https://support.mettl.com/portal/en/kb/articles/candidate-credibility-index-in-proctoring-reports-18-4-2023 · https://www.shrm.org/mena/topics-tools/news/talent-acquisition/hirevue-discontinues-facial-analysis-screening · https://epic.org/hirevue-facing-ftc-complaint-from-epic-halts-use-of-facial-recognition/
- Speaker: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb · https://github.com/speechbrain/speechbrain/blob/develop/speechbrain/inference/speaker.py · https://github.com/resemble-ai/Resemblyzer · https://huggingface.co/pyannote/speaker-diarization-community-1 · https://github.com/wenet-e2e/wespeaker
- Spoofing: https://github.com/clovaai/aasist · https://arxiv.org/abs/2203.16263 · https://arxiv.org/abs/2601.03944
- LiveKit: https://docs.livekit.io/home/client/tracks/raw-tracks/ · installed `livekit/rtc/audio_stream.py`, `livekit/agents/voice/agent.py`
- VAD: https://github.com/ricky0123/vad · https://docs.vad.ricky0123.com/user-guide/api/ · https://github.com/snakers4/silero-vad
- Legal: https://gdpr-info.eu/art-9-gdpr/ · https://artificialintelligenceact.eu/annex/3/ · https://www.faegredrinker.com/zh/insights/publications/2024/8/illinois-governor-signs-law-that-limits-damages-recoverable-under-the-biometric-information-privacy-act · https://www.gtlaw.com/es/insights/2024/8/bipa-update-illinois-limits-liability-and-clarifies-electronic-consent-for-biometric-data-collection
