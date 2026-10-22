"use client";
// PROTOTYPE — focus layout for the voice interview and proctored sandbox. No app shell: minimal header with
// exit, step indicator and status. Static state mocks (real media/LiveKit/proctoring logic is untouched).

import { useState } from "react";
import { LuCheck, LuMic, LuMicOff, LuMonitor, LuVideo, LuCircleAlert, LuClock, LuX } from "react-icons/lu";
import { protoAction } from "../ui-revamp/shared";

export const INTERVIEW_STATES = ["permissions", "device", "setup", "live", "done"] as const;
export const SANDBOX_STATES = ["lobby", "active", "written", "done"] as const;

function FocusHeader({ title, steps, current, right }: { title: string; steps?: string[]; current?: number; right?: React.ReactNode }) {
  return (
    <header className="f-head">
      <span className="vc-rail__mark" style={{ width: 28, height: 28, margin: 0 }}>T</span>
      <b className="p-truncate">{title}</b>
      {steps && (
        <ol className="f-steps" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s} className={i < (current ?? 0) ? "is-done" : i === current ? "is-current" : undefined}>
              <span>{i < (current ?? 0) ? <LuCheck size={11} /> : i + 1}</span><em>{s}</em>
            </li>
          ))}
        </ol>
      )}
      <span className="p-grow" />
      {right}
    </header>
  );
}

export function InterviewFocus({ state, kind }: { state: (typeof INTERVIEW_STATES)[number]; kind: string }) {
  const steps = ["Permissions", "Device check", "Setup", "Interview"];
  const cur = { permissions: 0, device: 1, setup: 2, live: 3, done: 4 }[state];
  const [confirm, setConfirm] = useState(false);
  const [ok, setOk] = useState(false);
  const title = kind === "profile" ? "Skill screening" : "Job interview";
  return (
    <div className="f-shell">
      <FocusHeader title={title} steps={state === "done" ? undefined : steps} current={cur}
        right={state === "live" ? <><span className="f-timer tnum"><LuClock size={13} /> 04:12 / 10:00</span><button type="button" className="p-btn p-btn--danger" onClick={() => setConfirm(true)}>End</button></>
          : <a className="p-btn p-btn--ghost" href="/candidate">Exit</a>} />
      <main className="f-main">
        {state === "permissions" && (
          <section className="f-card">
            <span className="f-icon"><LuMic size={22} /></span>
            <h1>Allow microphone access</h1>
            <p className="p-muted">Your browser will ask for permission. The camera is optional for screening.</p>
            <div className="f-alert"><LuCircleAlert size={15} /> <span><b>Microphone blocked.</b> Click the lock icon in the address bar, allow the microphone, then retry.</span></div>
            <button type="button" className="p-btn p-btn--primary" onClick={() => protoAction("Retry permissions")}>Retry</button>
          </section>
        )}
        {state === "device" && (
          <section className="f-card f-card--wide">
            <h1>Check your camera and microphone</h1>
            <div className="f-device">
              <div className="f-video"><LuVideo size={28} /><span>Camera preview</span></div>
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <div><small className="p-muted">Microphone level</small><div className="f-meter"><span style={{ width: "62%" }} /></div></div>
                <button type="button" className="p-btn" onClick={() => protoAction("Record 10s test")}>Record a 10-second test</button>
                <label className="p-toggle"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> My camera and microphone work</label>
                <button type="button" className="p-btn p-btn--primary" disabled={!ok}>Continue</button>
              </div>
            </div>
          </section>
        )}
        {state === "setup" && (
          <section className="f-card">
            <h1>Preparing your interviewer</h1>
            <p className="p-muted">About a minute. Keep this tab open.</p>
            <ol className="f-progress">
              <li className="is-done"><LuCheck size={13} /> Setting up</li>
              <li className="is-current"><span className="p-spin" /> Creating your AI interviewer</li>
              <li>Finalizing</li>
            </ol>
            <div className="f-bar"><span style={{ width: "58%" }} /></div>
          </section>
        )}
        {state === "live" && (
          <div className="f-live">
            <div className="f-stage">
              <div className="f-tile f-tile--ai"><div className="f-wave" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div><b>Sara · AI interviewer</b><span className="p-tag p-tag--new">Speaking</span></div>
              <div className="f-tile f-tile--me"><LuVideo size={22} /><b>You</b><span className="p-tag p-tag--hired"><LuMic size={11} /> Live</span></div>
              <div className="f-micbar"><LuMicOff size={14} /><div className="f-meter"><span style={{ width: "0%" }} /></div><span className="p-small p-muted">Mic opens when it&apos;s your turn</span></div>
            </div>
            <aside className="f-transcript" aria-label="Transcript">
              <header><b>Transcript</b><span className="p-tag">Listening</span></header>
              <div className="f-msgs">
                <p className="f-msg"><b>Sara</b><span>Could you walk me through how you design an assessment for a first-year course?</span><time>04:01</time></p>
                <p className="f-msg f-msg--me"><b>You</b><span>I start from the learning outcomes and map each one to a rubric dimension…</span><time>04:08</time></p>
              </div>
            </aside>
          </div>
        )}
        {state === "done" && (
          <section className="f-card">
            <span className="f-icon f-icon--ok"><LuCheck size={22} /></span>
            <h1>{title} complete</h1>
            <p className="p-muted">Thank you. One final step remains: a short proctored sandbox.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}><button type="button" className="p-btn p-btn--primary">Continue to the sandbox</button><a className="p-btn" href="/candidate">Back to home</a></div>
          </section>
        )}
      </main>
      {confirm && (
        <div className="p-scrim" onMouseDown={() => setConfirm(false)}>
          <div className="f-card" role="dialog" aria-label="End interview?" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h1>End the interview?</h1><p className="p-muted">Your answers so far will be submitted for evaluation.</p>
            <div style={{ display: "flex", gap: 10 }}><button type="button" className="p-btn" autoFocus onClick={() => setConfirm(false)}>Continue interview</button><button type="button" className="p-btn p-btn--danger" onClick={() => protoAction("End interview")}>End interview</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SandboxFocus({ state }: { state: (typeof SANDBOX_STATES)[number] }) {
  return (
    <div className="f-shell">
      <FocusHeader title="Proctored sandbox · Medium"
        right={state === "active" || state === "written" ? <><span className="f-rec">REC</span><span className="f-timer tnum"><LuClock size={13} /> 27:41</span><button type="button" className="p-btn p-btn--primary" onClick={() => protoAction("Submit")}>Submit</button></>
          : <a className="p-btn p-btn--ghost" href="/candidate/applications">Exit</a>} />
      <main className={state === "active" ? "f-main f-main--full" : "f-main"}>
        {state === "lobby" && (
          <section className="f-card f-card--wide">
            <h1>Before you begin</h1>
            <p className="p-muted">Coding problem · medium · 30 minutes</p>
            <ul className="c-list" style={{ textAlign: "left" }}>
              <li>Runs in fullscreen — leaving fullscreen submits immediately</li>
              <li>Copy, paste and browser shortcuts are disabled</li>
              <li>Switching tabs is logged; the third switch auto-submits</li>
              <li>Screen, camera and microphone are recorded for the hiring team</li>
              <li>The server timer is final — work is submitted when it ends</li>
            </ul>
            <div className="f-checks">
              <button type="button" className="f-check is-done"><LuMonitor size={16} /> Screen shared <LuCheck size={14} /></button>
              <button type="button" className="f-check"><LuVideo size={16} /> Enable camera &amp; microphone</button>
            </div>
            <button type="button" className="p-btn p-btn--primary" disabled>Start in fullscreen</button>
          </section>
        )}
        {state === "active" && (
          <div className="f-ide">
            <section className="f-problem"><h2>Merge overlapping intervals</h2><p className="p-muted">Given a list of intervals, merge all overlapping ones and return the result sorted by start.</p><h3>Example</h3><pre>[[1,3],[2,6],[8,10]] → [[1,6],[8,10]]</pre><h3>Constraints</h3><p className="p-small p-muted">1 ≤ n ≤ 10⁴</p></section>
            <section className="f-editor"><header><select className="p-select" defaultValue="python"><option>python</option><option>javascript</option></select><span className="p-muted p-small">Autosaved 4s ago</span></header><pre className="f-code">{"1  def merge(intervals):\n2      intervals.sort()\n3      out = []\n4      for s, e in intervals:\n5          …"}</pre></section>
          </div>
        )}
        {state === "written" && (
          <section className="f-card f-card--wide" style={{ textAlign: "left" }}>
            <small className="p-muted">Question 1 of 2</small>
            <h1 style={{ textAlign: "left" }}>Describe how you would redesign a failing course module.</h1>
            <textarea className="c-input" rows={10} defaultValue="I would begin by…" />
            <small className="p-muted tnum">4 / 150 words minimum</small>
          </section>
        )}
        {state === "done" && (
          <section className="f-card">
            <span className="f-icon f-icon--ok"><LuCheck size={22} /></span>
            <h1>Assessment submitted</h1>
            <div className="f-score tnum">78<small>/100</small></div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}><a className="p-btn p-btn--primary" href="/candidate/applications">See feedback &amp; roadmap</a><a className="p-btn" href="/candidate">Back to home</a></div>
          </section>
        )}
      </main>
      {(state === "active" || state === "written") && <button type="button" className="f-violation" onClick={() => protoAction("Violation banner")}><LuX size={12} /> Tab switch recorded (1 of 3)</button>}
    </div>
  );
}
