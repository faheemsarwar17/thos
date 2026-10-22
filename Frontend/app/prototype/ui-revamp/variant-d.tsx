"use client";
// PROTOTYPE — Variant D = C ("Workbench") + B's per-requisition stage bars + dashboard charts.
// Icon rail + requisitions panel (with mini stage bars), agenda home with KPI row + 4 charts, funnel pipeline.

import { useState } from "react";
import { LuLogOut, LuPlus, LuPanelLeft } from "react-icons/lu";
import type { PipelineCard } from "@/lib/types";
import {
  ActionsMenu, Avatar, BulkBar, CandidatePreview, NAV, NotificationsButton, PageHeader, Score, SearchTrigger,
  StatusLine, ThemeButton, allCards, displayName, phaseCards, protoAction, relTime, useSelection, type ProtoData,
} from "./shared";
import { ApplicationsTrend, FunnelChart, ScoreHistogram, StageMix } from "./charts";

export const nameD = "Chosen mix — C workbench + B stage bars + dashboard charts";

type Props = {
  data: ProtoData; theme: string; onTheme: () => void; screen: string; setScreen: (s: string) => void;
  openPalette: () => void; preview: PipelineCard | null; setPreview: (c: PipelineCard | null) => void;
};

export function VariantD(p: Props) {
  const { data } = p;
  const [panel, setPanel] = useState(true);
  const [posting, setPosting] = useState("");
  const cards = allCards(data.columns);
  const navLink = (n: (typeof NAV)[number], cls: string, withLabel: boolean) => {
    const isProto = n.label === "Home" || n.label === "Pipeline";
    const active = isProto && p.screen === n.label.toLowerCase();
    const Icon = n.icon;
    return (
      <a key={n.label} href={isProto ? "#" : n.href} className={`${cls} ${active ? "is-active" : ""}`} aria-label={n.label} aria-current={active ? "page" : undefined}
        onClick={(e) => { if (isProto) { e.preventDefault(); p.setScreen(n.label.toLowerCase()); } }}>
        <Icon size={withLabel ? 19 : 18} aria-hidden="true" />
        {withLabel ? <span>{n.label}</span> : <span className="vc-rail__tip">{n.label}</span>}
      </a>
    );
  };
  return (
    <div className={`vc ${panel ? "" : "is-panel-hidden"}`}>
      <nav className="vc-rail" aria-label="Primary">
        <span className="vc-rail__mark">T</span>
        {NAV.map((n) => navLink(n, "", false))}
        <div className="vc-rail__end">
          <ThemeButton theme={p.theme} onToggle={p.onTheme} />
          <button type="button" className="vc-rail__btn" aria-label="Sign out" onClick={() => protoAction("Sign out")}><LuLogOut size={17} /></button>
          <Avatar name={data.userName || "TH"} size={30} />
        </div>
      </nav>
      {panel && (
        <aside className="vc-panel" aria-label="Requisitions">
          <h2>{data.orgName}</h2>
          <a href="#" className={`vc-panel__item ${posting === "" ? "is-active" : ""}`} onClick={(e) => { e.preventDefault(); setPosting(""); }}>
            <b>All requisitions</b><span className="p-muted tnum">{cards.length}</span>
          </a>
          {data.postings.map((x) => {
            const n = cards.filter((c) => c.posting_id === x.id).length;
            return (
              <a key={x.id} href="#" className={`vc-panel__item ${posting === x.id ? "is-active" : ""}`} onClick={(e) => { e.preventDefault(); setPosting(x.id); p.setScreen("pipeline"); }}>
                <b className="p-truncate">{x.title}</b><span className="p-muted tnum">{n}</span>
                <small>{x.status === "draft" ? "Draft · finish setup" : x.location}</small>
                <span style={{ gridColumn: "1 / -1" }}><StageMix columns={data.columns} postings={[x]} compact /></span>
              </a>
            );
          })}
          <a href="/jobs?create=1" className="vc-panel__item"><span style={{ color: "var(--brand)", fontWeight: 500 }}><LuPlus size={13} /> New requisition</span></a>
        </aside>
      )}
      <div className="vc-main">
        <header className="vc-top">
          <button type="button" className="p-icon-btn" onClick={() => setPanel((v) => !v)} aria-label="Toggle requisitions panel"><LuPanelLeft size={16} /></button>
          <b className="p-grow p-truncate">{p.screen === "home" ? "Today" : posting ? data.postings.find((x) => x.id === posting)?.title : "Pipeline"}</b>
          <SearchTrigger onOpen={p.openPalette} compact />
          <NotificationsButton data={data} />
          {data.packName && <span className="p-tag p-tag--verified">{data.packName}</span>}
        </header>
        <main className="vc-content">{p.screen === "home" ? <HomeD {...p} /> : <PipelineD {...p} posting={posting} />}</main>
      </div>
      <nav className="vc-bottom" aria-label="Primary (mobile)">
        {NAV.slice(0, 5).map((n) => navLink(n, "", true))}
      </nav>
      {p.preview && (
        <>
          <div className="p-drawer-scrim" onClick={() => p.setPreview(null)} />
          <aside className="p-drawer" aria-label="Application"><CandidatePreview card={p.preview} blind={false} onClose={() => p.setPreview(null)} /></aside>
        </>
      )}
    </div>
  );
}

function HomeD({ data, setScreen }: Props) {
  const cards = allCards(data.columns);
  const received = phaseCards(data.columns, ["received"]);
  const evaluated = cards.filter((c) => c.applied_interview_status === "evaluated");
  const drafts = data.postings.filter((x) => x.status === "draft");
  const a = data.analytics;
  const Task = ({ tone, title, sub, people, cta, go }: { tone: string; title: string; sub: string; people: PipelineCard[]; cta: string; go: () => void }) => (
    <article className={`vc-task ${tone}`}>
      <h3>{title}</h3><p className="p-muted p-small">{sub}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="vc-task__people">{people.slice(0, 4).map((c) => <Avatar key={c.id} name={c.candidate_name} size={24} />)}</span>
        <span className="p-grow" />
        <button type="button" className="p-btn" onClick={go}>{cta}</button>
      </div>
    </article>
  );
  return (
    <>
      <PageHeader title="Today" meta={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} />
      <div className="vc-pulse">
        <div><b className="tnum">{a?.in_flight ?? "—"}</b><small>in flight</small></div>
        <div><b className="tnum">{received.length}</b><small>new</small></div>
        <div><b className="tnum">{evaluated.length}</b><small>to score</small></div>
        <div><b className="tnum">{a?.hired ?? "—"}</b><small>hired</small></div>
        <div><b className="tnum">{a?.published_postings ?? "—"}</b><small>live jobs</small></div>
      </div>
      <div className="viz-grid-4">
        <FunnelChart columns={data.columns} />
        <StageMix columns={data.columns} postings={data.postings} />
        <ApplicationsTrend cards={cards} />
        <ScoreHistogram cards={cards} />
      </div>
      <div className="vc-agenda">
        <section className="vc-col">
          <h2>Now</h2>
          {received.length > 0 && <Task tone="is-amber" title={`${received.length} new applications`} sub="Screen and decide who moves on" people={received} cta="Review" go={() => setScreen("pipeline")} />}
          {evaluated.length > 0 && <Task tone="is-violet" title={`${evaluated.length} interviews to score`} sub="AI evaluation is ready — add your scorecard" people={evaluated} cta="Score" go={() => setScreen("pipeline")} />}
        </section>
        <section className="vc-col">
          <h2>Today</h2>
          {drafts.map((d) => <Task key={d.id} tone="is-brand" title={`Finish “${d.title}”`} sub="Generate and lock the question pool, then publish" people={[]} cta="Set up" go={() => { window.location.href = `/jobs/${d.id}`; }} />)}
          <Task tone="" title="Live interview room" sub="Join the panel video room" people={[]} cta="Join" go={() => { window.location.href = "/interviews/faculty-panel"; }} />
        </section>
        <section className="vc-col">
          <h2>Recent</h2>
          {data.notifications.map((n) => (
            <article key={n.id} className="vc-task"><b>{n.title}</b><p className="p-muted p-small">{n.body}</p><span className="p-muted p-small">{relTime(n.created_at)}</span></article>
          ))}
        </section>
      </div>
    </>
  );
}

function PipelineD({ data, setPreview, posting }: Props & { posting: string }) {
  const [stage, setStage] = useState("received");
  const [blind, setBlind] = useState(false);
  const { sel, toggle, clear } = useSelection();
  const cols = data.columns.map((c) => ({ ...c, cards: posting ? c.cards.filter((x) => x.posting_id === posting) : c.cards }));
  const cards = cols.find((c) => c.stage_id === stage)?.cards ?? [];
  const n = (id: string) => cols.find((c) => c.stage_id === id)?.cards.length ?? 0;
  return (
    <>
      <PageHeader title="Pipeline" meta="Click a step in the funnel to work that stage" actions={
        <>
          <label className="p-toggle"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Blind review</label>
          <ActionsMenu counts={{ received: n("received"), screened: n("screened"), shortlisted: n("shortlisted") }} />
        </>
      } />
      <div className="vc-funnel" role="group" aria-label="Stages">
        {cols.map((c) => (
          <button key={c.stage_id} type="button" aria-pressed={stage === c.stage_id} onClick={() => setStage(c.stage_id)}>
            <b className="tnum">{c.cards.length}</b><small>{c.label}</small>
          </button>
        ))}
      </div>
      {cards.length === 0 && <p className="p-muted">No candidates in this stage.</p>}
      <div className="vc-grid">
        {cards.map((c) => (
          <article key={c.id} className={`vc-card ${sel.has(c.id) ? "is-selected" : ""}`}>
            <div className="vc-card__head">
              <input type="checkbox" className="p-check" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label="Select" />
              <Avatar name={c.candidate_name} size={32} hidden={blind} />
              <span className="p-grow p-min0">
                <button type="button" onClick={() => setPreview(c)}>{displayName(c, blind)}</button>
                <span className="p-muted p-small p-truncate" style={{ display: "block" }}>{c.job_title}</span>
              </span>
            </div>
            <p className="reason">{c.job_match_reasons || "Not screened yet — run screening to get an AI match explanation."}</p>
            <div className="vc-card__foot">
              <Score value={c.job_match_score} label="Match" />
              <Score value={c.profile_interview_score} label="Screen" />
              <span className="p-grow" />
              <select className="p-select" defaultValue="" aria-label="Move stage" onChange={(e) => e.target.value && protoAction(`Move to ${e.target.value}`)} style={{ width: 120 }}>
                <option value="">Move…</option>
                {c.valid_destinations.map((d) => <option key={d.id} value={d.label}>{d.label}</option>)}
              </select>
            </div>
            <StatusLine card={c} />
          </article>
        ))}
      </div>
      <BulkBar count={sel.size} onClear={clear} />
    </>
  );
}
