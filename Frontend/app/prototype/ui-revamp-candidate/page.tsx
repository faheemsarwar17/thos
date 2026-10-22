"use client";
// PROTOTYPE — throwaway. Candidate portal variants (?variant=A|B, ?screen=overview|applications|profile|interview)
// and the focus layout for media routes (?screen=voice&state=… or ?screen=sandbox&state=…). Read-only.

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import "../ui-revamp/proto.css";
import "./cand.css";
import { PrototypeSwitcher, ToastHost, useProtoTheme } from "../ui-revamp/shared";
import { CandShell, useCandData } from "./data";
import { ApplicationsA, ApplicationsB, OverviewA, OverviewB, ProfileA, ProfileB, ScreeningLauncher } from "./variants";
import { INTERVIEW_STATES, InterviewFocus, SANDBOX_STATES, SandboxFocus } from "./media";

const VARIANTS = [
  { key: "A", name: "Dashboard — next-step hero, tiles, stepper cards, settings profile" },
  { key: "B", name: "Journey — vertical journey per application, stacked profile + completeness" },
];

function Proto() {
  const params = useSearchParams();
  const router = useRouter();
  const variant = (params.get("variant") ?? "A").toUpperCase();
  const screen = params.get("screen") ?? "overview";
  const state = params.get("state") ?? "";
  const d = useCandData();
  const { theme, toggle } = useProtoTheme();
  const set = (k: string, v: string) => { const p = new URLSearchParams(params.toString()); p.set(k, v); if (k === "screen") p.delete("state"); router.replace(`?${p.toString()}`); };

  if (screen === "voice" || screen === "sandbox") {
    const states = screen === "voice" ? INTERVIEW_STATES : SANDBOX_STATES;
    const st = (states as readonly string[]).includes(state) ? state : states[0];
    return (
      <div className="proto" data-theme={theme}>
        {screen === "voice" ? <InterviewFocus state={st as (typeof INTERVIEW_STATES)[number]} kind="applied" /> : <SandboxFocus state={st as (typeof SANDBOX_STATES)[number]} />}
        <div className="f-statebar" role="group" aria-label="Prototype state">
          <button type="button" onClick={() => set("screen", "overview")}>← Portal</button>
          {states.map((s) => <button key={s} type="button" aria-pressed={s === st} onClick={() => set("state", s)}>{s}</button>)}
          <button type="button" onClick={toggle}>{theme === "light" ? "Dark" : "Light"}</button>
        </div>
        <ToastHost />
      </div>
    );
  }

  const titles: Record<string, string> = { overview: "Home", applications: "Applications", profile: "Profile & privacy", interview: "Skill screening" };
  const body = d.loading ? <p className="p-muted">Loading…</p> : d.error ? <p>{d.error}</p>
    : screen === "applications" ? (variant === "B" ? <ApplicationsB d={d} /> : <ApplicationsA d={d} />)
      : screen === "profile" ? (variant === "B" ? <ProfileB d={d} /> : <ProfileA d={d} />)
        : screen === "interview" ? <ScreeningLauncher d={d} onStart={() => set("screen", "voice")} />
          : variant === "B" ? <OverviewB d={d} go={(s) => set("screen", s)} /> : <OverviewA d={d} go={(s) => set("screen", s)} />;
  return (
    <div className="proto" data-theme={theme}>
      <CandShell screen={screen} setScreen={(s) => set("screen", s)} theme={theme} onTheme={toggle} name={d.name} title={titles[screen] ?? "Home"}>
        {body}
        <p className="p-muted p-small" style={{ marginTop: 28 }}>Focus screens: <a className="p-link" href="?screen=voice&state=device">voice interview</a> · <a className="p-link" href="?screen=sandbox&state=lobby">sandbox</a></p>
      </CandShell>
      <ToastHost />
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}

export default function Page() {
  return <RequireAuth><Suspense fallback={null}><Proto /></Suspense></RequireAuth>;
}
