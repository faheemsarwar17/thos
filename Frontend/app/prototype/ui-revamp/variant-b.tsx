"use client";
// PROTOTYPE — Variant B "Ashby": no sidebar, top navigation tabs, KPI + requisition-card home,
// master-detail pipeline (stage strip → list → persistent detail pane instead of a drawer).

import { useState } from "react";
import { LuChevronDown, LuLogOut, LuPlus } from "react-icons/lu";
import type { PipelineCard } from "@/lib/types";
import {
  ActionsMenu, Avatar, BulkBar, CandidatePreview, NAV, NotificationsButton, PageHeader, Score, SearchTrigger,
  StageTag, ThemeButton, allCards, displayName, protoAction, relTime, useDismiss, useSelection, type ProtoData,
} from "./shared";

export const nameB = "Ashby — top nav, KPI home, list + detail pane";

type Props = {
  data: ProtoData; theme: string; onTheme: () => void; screen: string; setScreen: (s: string) => void;
  openPalette: () => void; preview: PipelineCard | null; setPreview: (c: PipelineCard | null) => void;
};

const STAGE_COLORS: Record<string, string> = {
  received: "var(--brand)", screened: "var(--amber)", shortlisted: "var(--teal)", applied_interview: "var(--violet)",
  offer: "var(--green)", hired: "var(--green)", rejected: "var(--red)", withdrawn: "var(--ink-3)",
};

export function VariantB(p: Props) {
  const { data } = p;
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useDismiss<HTMLDivElement>(moreOpen, () => setMoreOpen(false));
  return (
    <div className="vb">
      <header className="vb-top">
        <div className="vb-top__row">
          <span className="vb-brand"><span className="vb-brand__mark">T</span>THOS</span>
          <span className="vb-org p-truncate" title={data.orgName}>{data.orgName}</span>
          <SearchTrigger onOpen={p.openPalette} />
          <ThemeButton theme={p.theme} onToggle={p.onTheme} />
          <NotificationsButton data={data} />
          <a className="p-btn p-btn--primary" href="/jobs?create=1"><LuPlus size={14} aria-hidden="true" />New job</a>
          <Avatar name={data.userName || "TH"} size={28} />
        </div>
        <nav className="vb-nav" aria-label="Primary">
          {NAV.filter((n) => n.group === "work").map((n) => {
            const isProto = n.label === "Home" || n.label === "Pipeline";
            const active = isProto && p.screen === n.label.toLowerCase();
            const Icon = n.icon;
            return (
              <a key={n.label} href={isProto ? "#" : n.href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}
                onClick={(e) => { if (isProto) { e.preventDefault(); p.setScreen(n.label.toLowerCase()); } }}>
                <Icon size={15} aria-hidden="true" />{n.label}
              </a>
            );
          })}
          <span className="vb-sep" aria-hidden="true" />
          <div className="p-pop-anchor" ref={moreRef}>
            <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>Manage <LuChevronDown size={13} /></button>
            {moreOpen && (
              <div className="p-popover p-popover--left p-menu" role="menu">
                {NAV.filter((n) => n.group === "manage").map((n) => <a key={n.label} role="menuitem" href={n.href} style={{ display: "block", padding: "8px 10px" }}>{n.label}</a>)}
                <button type="button" role="menuitem" onClick={() => protoAction("Sign out")}><b><LuLogOut size={13} /> Sign out</b></button>
              </div>
            )}
          </div>
        </nav>
      </header>
      <main className="vb-content">{p.screen === "home" ? <HomeB {...p} /> : <PipelineB {...p} />}</main>
      {p.preview && (
        <>
          <div className="p-drawer-scrim" onClick={() => p.setPreview(null)} />
          <aside className="p-drawer" aria-label="Application"><CandidatePreview card={p.preview} blind={false} onClose={() => p.setPreview(null)} /></aside>
        </>
      )}
    </div>
  );
}

function HomeB({ data, setScreen }: Props) {
  const cards = allCards(data.columns);
  const a = data.analytics;
  const toScore = cards.filter((c) => c.applied_interview_status === "evaluated").length;
  const newApps = data.columns.find((c) => c.stage_id === "received")?.cards.length ?? 0;
  return (
    <>
      <PageHeader title="Overview" meta={data.orgName} />
      <div className="vb-kpis">
        <div className="vb-kpi"><small>New applications</small><strong className="tnum">{newApps}</strong><a href="#" onClick={(e) => { e.preventDefault(); setScreen("pipeline"); }}>Review queue →</a></div>
        <div className="vb-kpi"><small>Interviews to score</small><strong className="tnum">{toScore}</strong><a href="#" onClick={(e) => { e.preventDefault(); setScreen("pipeline"); }}>Open scorecards →</a></div>
        <div className="vb-kpi"><small>Candidates in flight</small><strong className="tnum">{a?.in_flight ?? "—"}</strong><span className="p-muted p-small">{a ? `${a.hired} hired · ${a.rejected} rejected` : "Analytics unavailable"}</span></div>
        <div className="vb-kpi"><small>Open requisitions</small><strong className="tnum">{a?.published_postings ?? "—"}</strong><a href="/jobs">Manage jobs →</a></div>
      </div>
      <div className="vb-section-title"><h2>Requisitions</h2><a className="p-link" href="/jobs">View all</a></div>
      <div className="vb-reqs">
        {data.postings.map((x) => {
          const mine = cards.filter((c) => c.posting_id === x.id);
          const byStage = Object.entries(mine.reduce<Record<string, number>>((m, c) => ({ ...m, [c.stage_id]: (m[c.stage_id] ?? 0) + 1 }), {}));
          return (
            <a key={x.id} href={`/jobs/${x.id}`} className="vb-req">
              <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
                <div className="p-grow p-min0"><h3 className="p-truncate">{x.title}</h3><span className="p-muted p-small">{x.location}</span></div>
                <span className={`p-tag p-tag--${x.status}`}>{x.status === "draft" ? "Draft" : x.status === "published" ? "Live" : "Closed"}</span>
              </div>
              <div className="vb-dist" aria-label="Stage distribution">
                {byStage.map(([s, n]) => <span key={s} style={{ width: `${(n / Math.max(mine.length, 1)) * 100}%`, background: STAGE_COLORS[s] ?? "var(--ink-3)" }} />)}
              </div>
              <div className="vb-legend">
                {mine.length === 0 ? <span>{x.status === "draft" ? "Finish setup to publish" : "No applicants yet"}</span>
                  : byStage.map(([s, n]) => <span key={s}><i style={{ background: STAGE_COLORS[s] }} />{s.replace(/_/g, " ")} {n}</span>)}
              </div>
            </a>
          );
        })}
      </div>
      <div className="vb-home-lower">
        <section>
          <div className="vb-section-title"><h2>Recent activity</h2></div>
          <div className="vb-feed">
            {data.notifications.map((n) => (
              <article key={n.id}><b>{n.title}</b><p className="p-muted p-small">{n.body} · {relTime(n.created_at)}</p></article>
            ))}
          </div>
        </section>
        <section>
          <div className="vb-section-title"><h2>Shortcuts</h2></div>
          <div style={{ display: "grid", gap: 8 }}>
            <a className="p-btn" href="/jobs?create=1">Create a requisition</a>
            <a className="p-btn" href="/interviews/faculty-panel">Open live interview room</a>
            <a className="p-btn" href="/talent">Search talent</a>
          </div>
        </section>
      </div>
    </>
  );
}

function PipelineB({ data, setPreview }: Props) {
  const [stage, setStage] = useState(data.columns[0]?.stage_id ?? "received");
  const [blind, setBlind] = useState(false);
  const [posting, setPosting] = useState("");
  const { sel, toggle, clear } = useSelection();
  const cols = data.columns.map((c) => ({ ...c, cards: posting ? c.cards.filter((x) => x.posting_id === posting) : c.cards }));
  const rows = cols.find((c) => c.stage_id === stage)?.cards ?? [];
  const [current, setCurrent] = useState<PipelineCard | null>(null);
  const shown = current && rows.some((r) => r.id === current.id) ? current : rows[0] ?? null;
  const n = (id: string) => cols.find((c) => c.stage_id === id)?.cards.length ?? 0;

  return (
    <>
      <PageHeader title="Pipeline" meta="Pick a stage, work the list, decide in the side pane" />
      <div className="vb-toolbar">
        <select className="p-select" value={posting} onChange={(e) => setPosting(e.target.value)} aria-label="Requisition">
          <option value="">All requisitions</option>
          {data.postings.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <label className="p-toggle"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Blind review</label>
        <span className="p-grow" />
        <button type="button" className="p-btn" onClick={() => protoAction("Switch to board view")}>Board view</button>
        <ActionsMenu counts={{ received: n("received"), screened: n("screened"), shortlisted: n("shortlisted") }} />
      </div>
      <div className="vb-pipe">
        <div className="vb-pipe__list">
          <div className="vb-stagebar" role="group" aria-label="Stage">
            {cols.map((c) => (
              <button key={c.stage_id} type="button" aria-pressed={stage === c.stage_id} onClick={() => setStage(c.stage_id)}>
                <b className="tnum">{c.cards.length}</b><small>{c.label}</small>
              </button>
            ))}
          </div>
          {rows.length === 0 && <p className="p-pad p-muted">No candidates in this stage.</p>}
          {rows.map((c) => (
            <div key={c.id} className={`vb-row ${shown?.id === c.id ? "is-current" : ""}`} onClick={() => { setCurrent(c); if (window.innerWidth <= 1100) setPreview(c); }}>
              <input type="checkbox" className="p-check" checked={sel.has(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(c.id)} aria-label="Select" />
              <Avatar name={c.candidate_name} size={28} hidden={blind} />
              <span className="p-min0"><b className="p-truncate" style={{ display: "block", fontWeight: 550 }}>{displayName(c, blind)}</b><span className="p-muted p-small">Applied {relTime(c.applied_at)} ago</span></span>
              <span className="p-muted p-truncate vb-row__job">{c.job_title}</span>
              <span className="vb-row__scores">
                <Score value={c.job_match_score} label="Match" />
                <Score value={c.profile_interview_score} label="Screen" />
              </span>
            </div>
          ))}
        </div>
        <aside className="vb-pipe__detail" aria-label="Candidate detail">
          {shown ? <CandidatePreview card={shown} blind={blind} /> : <p className="p-pad p-muted">Select a candidate</p>}
        </aside>
      </div>
      <BulkBar count={sel.size} onClear={clear} />
      {rows.length > 0 && <p className="p-muted p-small" style={{ marginTop: 10 }}><StageTag card={rows[0]} /> On small screens the detail pane becomes a full-screen sheet.</p>}
    </>
  );
}
