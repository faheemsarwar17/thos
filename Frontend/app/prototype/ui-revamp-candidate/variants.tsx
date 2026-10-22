"use client";
// PROTOTYPE — candidate portal variants.
// A "Dashboard": next-step hero + stat tiles + panels; applications as cards with an always-visible stepper;
//   profile as a settings page with a section nav.
// B "Journey": one vertical journey feed per application (status, next action, timeline inline);
//   profile as a single stacked page with a completeness meter.

import { useState } from "react";
import { LuArrowRight, LuCamera, LuCheck, LuChevronDown, LuFileUp, LuShieldCheck, LuSparkles, LuX } from "react-icons/lu";
import type { CandidateApplication } from "@/lib/types";
import { PageHeader, Score, protoAction, relTime } from "../ui-revamp/shared";
import { Stepper, nextStep, type CandData } from "./data";

/* ======================= A — Dashboard ======================= */

export function OverviewA({ d, go }: { d: CandData; go: (s: string) => void }) {
  const best = d.attempts.reduce<number | null>((m, a) => (a.overall_score !== null && (m === null || a.overall_score > m) ? a.overall_score : m), null);
  const active = d.applications.filter((a) => a.status !== "Decision");
  const step = active.map((a) => ({ a, s: nextStep(a) })).find((x) => x.s);
  return (
    <>
      <PageHeader title={`Welcome back${d.name ? `, ${d.name.split(" ")[0]}` : ""}`} meta="Here's where your applications stand" />
      {step?.s ? (
        <a className={`c-hero c-hero--${step.s.tone}`} href={step.s.href}>
          <span className="c-hero__eyebrow">Your next step</span>
          <b>{step.s.label}</b>
          <span className="p-muted">{step.a.job_title} · {step.a.organization_name}</span>
          <span className="p-btn p-btn--primary" style={{ justifySelf: "start" }}>Start <LuArrowRight size={14} /></span>
        </a>
      ) : (
        <div className="c-hero"><span className="c-hero__eyebrow">You&apos;re all caught up</span><b>Nothing needs you right now</b><span className="p-muted">We&apos;ll notify you when an employer moves your application.</span></div>
      )}
      <div className="c-tiles">
        <div className="c-tile"><small>Profile screening</small><strong className="tnum">{best !== null ? Math.round(best) : "—"}</strong><button type="button" className="p-link" onClick={() => go("interview")}>{best !== null ? "Retake" : "Start screening"}</button></div>
        <div className="c-tile"><small>Active applications</small><strong className="tnum">{active.length}</strong><button type="button" className="p-link" onClick={() => go("applications")}>View all</button></div>
        <div className="c-tile"><small>Open jobs</small><strong className="tnum">{d.jobs.filter((j) => !j.already_applied).length}</strong><a className="p-link" href="/candidate/jobs">Browse</a></div>
        <div className="c-tile"><small>Discoverable</small><strong>{d.profile?.consents.discovery ? "On" : "Off"}</strong><button type="button" className="p-link" onClick={() => go("profile")}>Privacy</button></div>
      </div>
      <div className="c-two">
        <section className="c-panel">
          <header><h2>Applications</h2></header>
          {d.applications.map((a) => (
            <div key={a.id} className="c-row">
              <span className="p-min0 p-grow"><b className="p-truncate" style={{ display: "block" }}>{a.job_title}</b><span className="p-muted p-small">{a.organization_name}</span></span>
              <span className="p-tag p-tag--new">{a.status}</span>
            </div>
          ))}
        </section>
        <section className="c-panel">
          <header><h2>Suggested jobs</h2><a className="p-link" href="/candidate/jobs" style={{ marginLeft: "auto" }}>All jobs</a></header>
          {(d.matches.length ? d.matches.map((m) => ({ id: m.posting_id ?? m.title ?? "", title: m.title ?? "", sub: m.reasons?.[0] ?? "", score: m.score ?? null }))
            : d.jobs.filter((j) => !j.already_applied).slice(0, 3).map((j) => ({ id: j.id, title: j.title, sub: `${j.organization_name} · ${j.location}`, score: null as number | null })))
            .map((j) => (
              <a key={j.id} className="c-row" href="/candidate/jobs">
                <span className="p-min0 p-grow"><b className="p-truncate" style={{ display: "block" }}>{j.title}</b><span className="p-muted p-small">{j.sub}</span></span>
                {j.score !== null ? <Score value={j.score} label="Match" /> : <LuArrowRight size={14} />}
              </a>
            ))}
        </section>
      </div>
    </>
  );
}

function AppCard({ a }: { a: CandidateApplication }) {
  const [open, setOpen] = useState(false);
  const s = nextStep(a);
  return (
    <article className="c-app">
      <header>
        <span className="p-min0 p-grow"><small className="p-muted">{a.organization_name}</small><h3 className="p-truncate">{a.job_title}</h3></span>
        <span className="c-app__scores">
          <Score value={a.job_match_score} label="Match" />
          <Score value={a.applied_interview?.interview_score} label="Interview" />
          <Score value={a.applied_interview?.sandbox?.score} label="Sandbox" />
        </span>
      </header>
      <Stepper steps={a.status_order} current={a.status} />
      <footer>
        {s ? <a className="p-btn p-btn--primary" href={s.href}>{s.label}</a> : <span className="p-muted p-small">Applied {relTime(a.applied_at)} ago · updated {relTime(a.updated_at)} ago</span>}
        <span className="p-grow" />
        <button type="button" className="p-btn p-btn--ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Details <LuChevronDown size={14} /></button>
        {a.status !== "Decision" && <button type="button" className="p-btn p-btn--ghost" style={{ color: "var(--red)" }} onClick={() => protoAction("Withdraw (opens shared Modal with Esc + focus trap)")}>Withdraw</button>}
      </footer>
      {open && (
        <div className="c-app__more">
          <section><h4>Timeline</h4><p className="p-muted p-small">Dated steps + “Expected next step” load here (GET …/timeline).</p></section>
          <section><h4><LuSparkles size={13} /> Growth roadmap</h4><p className="p-small">{a.ai_improvement_feedback || "Your AI career advisor feedback appears here once the employer finishes reviewing."}</p></section>
        </div>
      )}
    </article>
  );
}

export function ApplicationsA({ d }: { d: CandData }) {
  return (
    <>
      <PageHeader title="My applications" meta={`${d.applications.length} total`} />
      <div style={{ display: "grid", gap: 12 }}>{d.applications.map((a) => <AppCard key={a.id} a={a} />)}</div>
    </>
  );
}

export function ProfileA({ d }: { d: CandData }) {
  const [sec, setSec] = useState("Profile");
  const p = d.profile;
  return (
    <>
      <PageHeader title="Profile & privacy" />
      <div className="c-settings">
        <nav className="c-settings__nav" aria-label="Profile sections">
          {["Profile", "Photo", "Resume", "Privacy"].map((s) => <button key={s} type="button" aria-current={sec === s ? "true" : undefined} onClick={() => setSec(s)}>{s}</button>)}
        </nav>
        <div className="c-panel c-pad">
          {sec === "Profile" && p && (
            <form className="c-form" onSubmit={(e) => { e.preventDefault(); protoAction("Save profile"); }}>
              <label>Headline<input className="c-input" defaultValue={p.profile.headline} maxLength={200} /></label>
              <label>Summary<textarea className="c-input" rows={4} defaultValue={p.profile.summary} /></label>
              <label>Skills<input className="c-input" defaultValue={p.profile.skills.join(", ")} /><small className="p-muted">Comma separated</small></label>
              <label>Credentials<input className="c-input" defaultValue={p.profile.credentials.join(", ")} /></label>
              <div><button className="p-btn p-btn--primary" type="submit">Save changes</button></div>
            </form>
          )}
          {sec === "Photo" && <PhotoBlock />}
          {sec === "Resume" && <ResumeBlock d={d} />}
          {sec === "Privacy" && p && <PrivacyBlock d={d} />}
        </div>
      </div>
    </>
  );
}

function PhotoBlock() {
  return (
    <div className="c-photo">
      <span className="c-photo__ph"><LuCamera size={22} /></span>
      <div className="p-grow"><b>Profile photo</b><p className="p-muted p-small">Matched against a webcam frame during interviews to verify it&apos;s you. JPEG, PNG or WebP, max 5 MB.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}><label className="p-btn p-btn--primary"><input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={() => protoAction("Upload photo")} />Upload photo</label><button type="button" className="p-btn" onClick={() => protoAction("Remove photo")}>Remove</button></div></div>
    </div>
  );
}

function ResumeBlock({ d }: { d: CandData }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label className="c-drop"><input type="file" hidden accept=".pdf,.docx,.txt,.md,.csv" onChange={() => protoAction("Parse resume")} /><LuFileUp size={20} /><b>Drop your resume or browse</b><small className="p-muted">PDF, DOCX, TXT, MD or CSV — or paste text below</small></label>
      <textarea className="c-input" rows={4} placeholder="Or paste resume text (40+ characters)…" />
      <div><button type="button" className="p-btn p-btn--primary" onClick={() => protoAction("Parse & embed")}>Parse & update profile</button></div>
      {d.profile?.parsed_cv && (
        <section className="c-panel c-pad"><b>Parsed preview</b>{d.profile.parsed_cv.sections.map((s) => <div key={s.title} className="p-small" style={{ marginTop: 6 }}><b>{s.title}</b><p className="p-muted">{s.content.join(" · ")}</p></div>)}</section>
      )}
    </div>
  );
}

function PrivacyBlock({ d }: { d: CandData }) {
  const items = [
    { k: "discovery", t: "Let employers discover me", s: "Verified employers can find your profile and skill scores in talent search." },
    { k: "application_processing", t: "Process my applications", s: "Required to apply. Shared only with organisations you apply to." },
  ];
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {items.map((i) => (
        <label key={i.k} className="c-switch-row">
          <span className="p-grow"><b>{i.t}</b><small className="p-muted" style={{ display: "block" }}>{i.s}</small></span>
          <input type="checkbox" role="switch" className="c-switch" defaultChecked={d.profile?.consents[i.k]} onChange={() => protoAction(`Consent ${i.k}`)} />
        </label>
      ))}
      <p className="p-muted p-small" style={{ marginTop: 8 }}><LuShieldCheck size={12} /> Matching index: {d.profile?.has_embedding ? `active (${d.profile.embedding_model})` : "not built yet"}</p>
    </div>
  );
}

/* ======================= B — Journey ======================= */

export function OverviewB({ d, go }: { d: CandData; go: (s: string) => void }) {
  const best = d.attempts.find((a) => a.overall_score !== null)?.overall_score ?? null;
  return (
    <>
      <PageHeader title="Your journey" meta={`${d.applications.length} application${d.applications.length === 1 ? "" : "s"} · profile screening ${best !== null ? Math.round(best) : "not taken"}`} />
      <div className="c-journey">
        <div className="c-journey__main">
          {d.applications.map((a) => <JourneyCard key={a.id} a={a} />)}
          <button type="button" className="c-journey__add" onClick={() => { window.location.href = "/candidate/jobs"; }}>+ Apply to another job</button>
        </div>
        <aside className="c-journey__side">
          <section className="c-panel c-pad"><b>Profile strength</b><Completeness d={d} /><button type="button" className="p-link" onClick={() => go("profile")}>Improve profile →</button></section>
          <section className="c-panel c-pad"><b>Skill screening</b><p className="p-muted p-small">A short voice interview that makes your applications stronger.</p><div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}><Score value={best} label="Best" /><button type="button" className="p-btn" onClick={() => go("interview")}>{best !== null ? "Retake" : "Start"}</button></div></section>
        </aside>
      </div>
    </>
  );
}

function JourneyCard({ a }: { a: CandidateApplication }) {
  const s = nextStep(a);
  const idx = a.status_order.indexOf(a.status);
  return (
    <article className="c-jcard">
      <header><span className="p-min0 p-grow"><h3 className="p-truncate">{a.job_title}</h3><span className="p-muted p-small">{a.organization_name} · applied {relTime(a.applied_at)} ago</span></span><span className="p-tag p-tag--new">{a.status}</span></header>
      <ol className="c-vtl">
        {a.status_order.map((st, i) => (
          <li key={st} className={i < idx ? "is-done" : i === idx ? "is-current" : undefined}>
            <span className="c-vtl__dot" aria-hidden="true">{i < idx ? <LuCheck size={11} /> : null}</span>
            <span className="p-grow"><b>{st}</b>
              {i === idx && s && <><span className="p-muted p-small" style={{ display: "block" }}>Action needed</span><a className="p-btn p-btn--primary" href={s.href} style={{ marginTop: 6 }}>{s.label}</a></>}
              {i === idx && !s && <span className="p-muted p-small" style={{ display: "block" }}>Waiting on the employer</span>}
            </span>
          </li>
        ))}
      </ol>
      <footer>
        <Score value={a.applied_interview?.interview_score} label="Interview" />
        <Score value={a.applied_interview?.sandbox?.score} label="Sandbox" />
        <span className="p-grow" />
        {a.status !== "Decision" && <button type="button" className="p-btn p-btn--ghost" onClick={() => protoAction("Withdraw")}><LuX size={13} /> Withdraw</button>}
      </footer>
    </article>
  );
}

function Completeness({ d }: { d: CandData }) {
  const p = d.profile;
  const checks = [!!p?.profile.headline, !!p?.profile.summary, (p?.profile.skills.length ?? 0) > 0, !!p?.parsed_cv, d.attempts.some((a) => a.overall_score !== null)];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="c-meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness"><span style={{ width: `${pct}%` }} /></div>
      <small className="p-muted tnum">{pct}% complete{pct < 100 ? " — add a photo for identity checks" : ""}</small>
    </div>
  );
}

export function ProfileB({ d }: { d: CandData }) {
  const p = d.profile;
  return (
    <>
      <PageHeader title="Profile & privacy" meta={<Completeness d={d} />} />
      <div className="c-stack">
        <section className="c-panel c-pad"><h2 className="c-h2">About you</h2>{p && <form className="c-form" onSubmit={(e) => { e.preventDefault(); protoAction("Save"); }}><label>Headline<input className="c-input" defaultValue={p.profile.headline} /></label><label>Summary<textarea className="c-input" rows={3} defaultValue={p.profile.summary} /></label><label>Skills<input className="c-input" defaultValue={p.profile.skills.join(", ")} /></label><label>Credentials<input className="c-input" defaultValue={p.profile.credentials.join(", ")} /></label><div><button className="p-btn p-btn--primary">Save</button></div></form>}</section>
        <section className="c-panel c-pad"><h2 className="c-h2">Photo</h2><PhotoBlock /></section>
        <section className="c-panel c-pad"><h2 className="c-h2">Resume</h2><ResumeBlock d={d} /></section>
        <section className="c-panel c-pad"><h2 className="c-h2">Privacy</h2><PrivacyBlock d={d} /></section>
      </div>
    </>
  );
}

export function ApplicationsB({ d }: { d: CandData }) {
  return (
    <>
      <PageHeader title="My applications" meta="Every step, and what happens next" />
      <div className="c-journey__main" style={{ maxWidth: 760 }}>{d.applications.map((a) => <JourneyCard key={a.id} a={a} />)}</div>
    </>
  );
}

export function ScreeningLauncher({ d, onStart }: { d: CandData; onStart: () => void }) {
  return (
    <>
      <PageHeader title="Skill screening" meta="A 10-minute voice interview with an AI interviewer" />
      <div className="c-panel c-pad" style={{ display: "grid", gap: 12, maxWidth: 640 }}>
        <p>Answer a few questions out loud about your field. Your score is attached to every application you send.</p>
        <ul className="c-list"><li>Find a quiet room; you&apos;ll need a microphone (camera optional)</li><li>Each answer is capped at 2 minutes</li><li>You can retake later — your best score counts</li></ul>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}><button type="button" className="p-btn p-btn--primary" onClick={onStart}>Start screening</button><span className="p-muted p-small">{d.attempts.length} previous attempt{d.attempts.length === 1 ? "" : "s"}</span></div>
      </div>
    </>
  );
}
