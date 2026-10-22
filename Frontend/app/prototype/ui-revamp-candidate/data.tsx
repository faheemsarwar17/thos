"use client";
// PROTOTYPE — candidate data hook + D-style candidate shell (rail + bottom tabs, no requisitions panel).

import { useEffect, useState, type ReactNode } from "react";
import { LuBriefcase, LuFileText, LuHouse, LuLogOut, LuMail, LuMic, LuUser, LuBell, LuSearch } from "react-icons/lu";
import { api } from "@/lib/api";
import { currentSession } from "@/lib/auth";
import type { AttemptSummary, CandidateApplication, CandidateProfile, Job } from "@/lib/types";
import { Avatar, ThemeButton, protoAction } from "../ui-revamp/shared";

export type CandData = {
  loading: boolean; error: string | null; name: string;
  profile: CandidateProfile | null; attempts: AttemptSummary[]; applications: CandidateApplication[]; jobs: Job[];
  matches: { posting_id?: string; title?: string; score?: number; reasons?: string[] }[];
};

export function useCandData(): CandData {
  const [d, setD] = useState<CandData>({ loading: true, error: null, name: "", profile: null, attempts: [], applications: [], jobs: [], matches: [] });
  useEffect(() => {
    Promise.all([
      api.get<{ candidate: CandidateProfile }>("/api/v1/candidates/me/profile"),
      api.get<{ attempts: AttemptSummary[] }>("/api/v1/candidates/me/profile-interview-attempts"),
      api.get<{ applications: CandidateApplication[] }>("/api/v1/candidates/me/applications"),
      api.get<{ jobs: Job[] }>("/api/v1/jobs"),
      api.get<{ matches: CandData["matches"] }>("/api/v1/candidates/me/matches").catch(() => ({ matches: [] })),
    ])
      .then(([p, a, apps, jobs, m]) => setD({
        loading: false, error: null, name: currentSession()?.user.display_name ?? "", profile: p.candidate,
        attempts: a.attempts, applications: apps.applications, jobs: jobs.jobs, matches: m.matches,
      }))
      .catch((e: unknown) => setD((x) => ({ ...x, loading: false, error: e instanceof Error ? `${e.message} — sign in as a candidate (e.g. hira.ahmed@gmail.com)` : "Failed" })));
  }, []);
  return d;
}

export const CAND_NAV = [
  { key: "overview", label: "Home", icon: LuHouse },
  { key: "jobs", label: "Jobs", icon: LuBriefcase, href: "/candidate/jobs" },
  { key: "applications", label: "Applications", icon: LuFileText },
  { key: "messages", label: "Messages", icon: LuMail, href: "/candidate/messages" },
  { key: "interview", label: "Screening", icon: LuMic },
  { key: "profile", label: "Profile", icon: LuUser },
] as const;

export function CandShell({ screen, setScreen, theme, onTheme, name, title, children }: {
  screen: string; setScreen: (s: string) => void; theme: string; onTheme: () => void; name: string; title: string; children: ReactNode;
}) {
  const link = (n: (typeof CAND_NAV)[number], withLabel: boolean) => {
    const active = screen === n.key;
    const Icon = n.icon;
    return (
      <a key={n.key} href={"href" in n ? n.href : "#"} className={active ? "is-active" : undefined} aria-label={n.label} aria-current={active ? "page" : undefined}
        onClick={(e) => { if (!("href" in n)) { e.preventDefault(); setScreen(n.key); } }}>
        <Icon size={withLabel ? 19 : 18} aria-hidden="true" />
        {withLabel ? <span>{n.label}</span> : <span className="vc-rail__tip">{n.label}</span>}
      </a>
    );
  };
  return (
    <div className="vc is-panel-hidden cand">
      <nav className="vc-rail" aria-label="Primary">
        <span className="vc-rail__mark">T</span>
        {CAND_NAV.map((n) => link(n, false))}
        <div className="vc-rail__end">
          <ThemeButton theme={theme} onToggle={onTheme} />
          <button type="button" className="vc-rail__btn" aria-label="Sign out" onClick={() => protoAction("Sign out")}><LuLogOut size={17} /></button>
          <Avatar name={name || "C"} size={30} />
        </div>
      </nav>
      <div className="vc-main">
        <header className="vc-top">
          <b className="p-grow p-truncate">{title}</b>
          <button type="button" className="p-icon-btn" aria-label="Search" onClick={() => protoAction("Search")}><LuSearch size={16} /></button>
          <button type="button" className="p-icon-btn" aria-label="Notifications" onClick={() => protoAction("Notifications panel")}><LuBell size={16} /></button>
          <a className="p-btn p-btn--primary" href="/candidate/jobs">Browse jobs</a>
        </header>
        <main className="vc-content cand-content">{children}</main>
      </div>
      <nav className="vc-bottom" aria-label="Primary (mobile)">
        {CAND_NAV.filter((n) => n.key !== "messages").map((n) => link(n, true))}
      </nav>
    </div>
  );
}

export function nextStep(app: CandidateApplication): { label: string; href: string; tone: string } | null {
  const ai = app.applied_interview;
  if (!ai) return null;
  if (ai.status === "invited" || ai.status === "in_progress") return { label: "Take your job interview", href: `/candidate/applied/${ai.attempt_id}`, tone: "brand" };
  const sb = ai.sandbox;
  if (sb?.required && !["submitted", "evaluated", "expired"].includes(sb.status ?? "") && ["submitted", "evaluated"].includes(ai.status))
    return { label: "Complete the proctored sandbox", href: `/candidate/sandbox/${ai.attempt_id}`, tone: "violet" };
  return null;
}

export function Stepper({ steps, current }: { steps: string[]; current: string }) {
  const idx = Math.max(0, steps.indexOf(current));
  return (
    <ol className="c-stepper" aria-label="Application progress">
      {steps.map((s, i) => (
        <li key={s} className={i < idx ? "is-done" : i === idx ? "is-current" : undefined} aria-current={i === idx ? "step" : undefined}>
          <span className="c-stepper__dot" aria-hidden="true" /><span className="c-stepper__label">{s}</span>
        </li>
      ))}
    </ol>
  );
}
