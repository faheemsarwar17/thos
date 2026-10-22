"use client";
// PROTOTYPE — Variant A "Linear": light collapsible sidebar, inbox-style home, dense 4-lane board + overlay drawer.

import { useState } from "react";
import {
  LuChevronRight, LuClipboardCheck, LuInbox, LuLogOut, LuMenu, LuPanelLeftClose, LuPanelLeftOpen,
  LuPlus, LuTimer, LuUsers, LuColumns3, LuList,
} from "react-icons/lu";
import type { PipelineCard } from "@/lib/types";
import {
  ActionsMenu, Avatar, BulkBar, CandidatePreview, NAV, NotificationsButton, PHASES, PageHeader, Score, SearchTrigger,
  StageTag, StatusLine, ThemeButton, allCards, displayName, phaseCards, protoAction, relTime, useSelection,
  type ProtoData,
} from "./shared";

export const nameA = "Linear — sidebar, inbox home, dense board";

type Props = {
  data: ProtoData; theme: string; onTheme: () => void; screen: string; setScreen: (s: string) => void;
  openPalette: () => void; preview: PipelineCard | null; setPreview: (c: PipelineCard | null) => void;
};

export function VariantA(p: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data } = p;
  const received = phaseCards(data.columns, ["received"]).length;

  return (
    <div className={`va ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <aside className="va-side" aria-label="Primary navigation">
        <div className="va-org">
          <span className="va-org__mark">{data.orgName.slice(0, 1)}</span>
          <b className="va-hide p-truncate">{data.orgName}</b>
          <button type="button" className="p-icon-btn va-collapse va-hide" style={{ marginLeft: "auto" }} onClick={() => setCollapsed(true)} aria-label="Collapse sidebar"><LuPanelLeftClose size={15} /></button>
        </div>
        {collapsed
          ? <button type="button" className="p-icon-btn va-collapse" style={{ margin: "0 auto 6px" }} onClick={() => setCollapsed(false)} aria-label="Expand sidebar"><LuPanelLeftOpen size={15} /></button>
          : <SearchTrigger onOpen={p.openPalette} />}
        {(["work", "manage"] as const).map((g) => (
          <div className="va-group" key={g}>
            <p className="va-hide">{g === "work" ? "Workspace" : "Manage"}</p>
            {NAV.filter((n) => n.group === g).map((n) => {
              const isProto = n.label === "Home" || n.label === "Pipeline";
              const active = isProto && p.screen === n.label.toLowerCase();
              const Icon = n.icon;
              return (
                <a key={n.label} href={isProto ? "#" : n.href} title={n.label}
                  className={`va-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}
                  onClick={(e) => { if (isProto) { e.preventDefault(); p.setScreen(n.label.toLowerCase()); setMobileOpen(false); } }}>
                  <Icon size={16} aria-hidden="true" />
                  <span className="va-hide">{n.label}</span>
                  {n.label === "Pipeline" && received > 0 && <span className="va-count va-hide tnum">{received}</span>}
                </a>
              );
            })}
          </div>
        ))}
        <div className="va-foot">
          <Avatar name={data.userName || "TH"} size={26} />
          <span className="va-hide p-grow p-min0"><b className="p-truncate" style={{ display: "block", fontSize: 12.5 }}>{data.userName}</b><small className="p-muted" style={{ textTransform: "capitalize" }}>{data.userRole}</small></span>
          <button type="button" className="p-icon-btn va-hide" aria-label="Sign out" onClick={() => protoAction("Sign out")}><LuLogOut size={15} /></button>
        </div>
      </aside>
      {mobileOpen && <div className="p-drawer-scrim" onClick={() => setMobileOpen(false)} />}

      <div className="va-main">
        <header className="va-top">
          <button type="button" className="p-icon-btn va-burger" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><LuMenu size={17} /></button>
          <nav className="va-crumbs p-grow p-min0" aria-label="Breadcrumb">
            <span className="p-truncate">{data.orgName}</span><LuChevronRight size={13} aria-hidden="true" />
            <b>{p.screen === "home" ? "Home" : "Pipeline"}</b>
          </nav>
          {data.packName && <span className="p-tag p-tag--verified va-hide-sm" title="Active domain pack">{data.packName}</span>}
          <ThemeButton theme={p.theme} onToggle={p.onTheme} />
          <NotificationsButton data={data} />
          <a className="p-btn p-btn--primary" href="/jobs?create=1"><LuPlus size={14} aria-hidden="true" /><span>New job</span></a>
        </header>
        <main className="va-content">{p.screen === "home" ? <HomeA {...p} /> : <PipelineA {...p} />}</main>
      </div>
      {p.preview && (
        <>
          <div className="p-drawer-scrim" onClick={() => p.setPreview(null)} />
          <aside className="p-drawer" aria-label="Application"><CandidatePreview card={p.preview} blind={false} onClose={() => p.setPreview(null)} /></aside>
        </>
      )}
    </div>
  );
}

function HomeA({ data, setScreen }: Props) {
  const cards = allCards(data.columns);
  const newApps = phaseCards(data.columns, ["received"]).length;
  const toScore = cards.filter((c) => c.applied_interview_status === "evaluated").length;
  const drafts = data.postings.filter((x) => x.status === "draft").length;
  const inbox = [
    { icon: <LuInbox size={16} />, tone: "is-amber", title: "Review new applications", sub: "Waiting in Received — oldest first", n: newApps, go: () => setScreen("pipeline") },
    { icon: <LuClipboardCheck size={16} />, tone: "is-violet", title: "Score evaluated interviews", sub: "Job Interviews ready for a scorecard", n: toScore, go: () => setScreen("pipeline") },
    { icon: <LuTimer size={16} />, tone: "is-brand", title: "Finish requisition setup", sub: "Drafts need a locked question pool to publish", n: drafts, go: () => { window.location.href = "/jobs"; } },
  ].filter((i) => i.n > 0);
  const a = data.analytics;
  return (
    <>
      <PageHeader title={`Good day${data.userName ? `, ${data.userName.split(" ")[0]}` : ""}`} meta={`${inbox.reduce((s, i) => s + i.n, 0)} things need you today`} />
      <div className="va-kpis">
        <div className="va-kpi"><small>In flight</small><div className="va-big tnum">{a?.in_flight ?? "—"}</div></div>
        <div className="va-kpi"><small>Open requisitions</small><div className="va-big tnum">{a?.published_postings ?? "—"}</div></div>
        <div className="va-kpi"><small>Hired</small><div className="va-big tnum">{a?.hired ?? "—"}</div></div>
        <div className="va-kpi"><small>Rejected</small><div className="va-big tnum">{a?.rejected ?? "—"}</div></div>
      </div>
      <div className="va-home">
        <section className="va-panel">
          <header><h2>Your inbox</h2><span className="p-muted p-small">{inbox.length} queues</span></header>
          {inbox.length === 0 && <p className="p-pad p-muted">Inbox zero. Nothing waiting on you.</p>}
          {inbox.map((i) => (
            <a key={i.title} href="#" className="va-inbox-row" onClick={(e) => { e.preventDefault(); i.go(); }}>
              <span className={`va-inbox-icon ${i.tone}`} aria-hidden="true">{i.icon}</span>
              <span className="p-min0"><b>{i.title}</b><span className="p-muted p-small">{i.sub}</span></span>
              <span className="va-big tnum">{i.n}</span>
            </a>
          ))}
        </section>
        <div className="va-stack">
          <section className="va-panel">
            <header><h2>Requisitions</h2><a className="p-link" href="/jobs" style={{ marginLeft: "auto" }}>All jobs</a></header>
            {data.postings.map((x) => (
              <a key={x.id} href={`/jobs/${x.id}`} className="va-req">
                <span className="p-min0"><b className="p-truncate" style={{ display: "block", fontWeight: 550 }}>{x.title}</b><span className="p-muted p-small">{x.location}</span></span>
                <span className="p-muted p-small tnum"><LuUsers size={12} aria-hidden="true" /> {x.application_count ?? 0}</span>
                <span className={`p-tag p-tag--${x.status}`}>{x.status === "draft" ? "Draft" : x.status === "published" ? "Live" : "Closed"}</span>
              </a>
            ))}
          </section>
          <section className="va-panel">
            <header><h2>Activity</h2></header>
            {data.notifications.slice(0, 6).map((n) => (
              <a key={n.id} href={n.link || "#"} className="va-req" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span className="p-min0"><b style={{ display: "block", fontWeight: 550 }}>{n.title}</b><span className="p-muted p-small">{n.body}</span></span>
                <span className="p-muted p-small">{relTime(n.created_at)}</span>
              </a>
            ))}
          </section>
        </div>
      </div>
    </>
  );
}

function PipelineA({ data, setPreview }: Props) {
  const [blind, setBlind] = useState(false);
  const [view, setView] = useState<"board" | "table">("board");
  const [posting, setPosting] = useState("");
  const [subs, setSubs] = useState<Record<string, string>>({});
  const { sel, toggle, clear } = useSelection();
  const cols = data.columns.map((c) => ({ ...c, cards: posting ? c.cards.filter((x) => x.posting_id === posting) : c.cards }));
  const count = (ids: string[]) => phaseCards(cols, ids).length;

  return (
    <>
      <PageHeader title="Pipeline" meta={`${allCards(cols).length} candidates across ${posting ? 1 : data.postings.length} requisitions`} />
      <div className="va-toolbar">
        <select className="p-select" value={posting} onChange={(e) => setPosting(e.target.value)} aria-label="Requisition">
          <option value="">All requisitions</option>
          {data.postings.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <div className="p-seg" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}><LuColumns3 size={13} /> Board</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><LuList size={13} /> Table</button>
        </div>
        <label className="p-toggle"><input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} /> Blind review</label>
        <span className="p-grow" />
        <ActionsMenu counts={{ received: count(["received"]), screened: count(["screened"]), shortlisted: count(["shortlisted"]) }} />
      </div>

      {view === "board" ? (
        <div className="va-board">
          {PHASES.map((ph) => {
            const sub = subs[ph.id] ?? "";
            const cards = phaseCards(cols, sub ? [sub] : ph.stages);
            const subStages = cols.filter((c) => (ph.stages as readonly string[]).includes(c.stage_id));
            return (
              <section key={ph.id} className="va-lane" aria-label={ph.label}>
                <header><h2>{ph.label}</h2><span className="va-lane__count tnum">{phaseCards(cols, ph.stages).length}</span></header>
                {subStages.length > 1 && (
                  <div className="va-lane__subs">
                    <button type="button" aria-pressed={!sub} onClick={() => setSubs({ ...subs, [ph.id]: "" })}>All</button>
                    {subStages.map((s) => <button key={s.stage_id} type="button" aria-pressed={sub === s.stage_id} onClick={() => setSubs({ ...subs, [ph.id]: s.stage_id })}>{s.label} {s.cards.length}</button>)}
                  </div>
                )}
                {cards.length === 0 && <div className="va-empty">No candidates</div>}
                {cards.map((c) => (
                  <article key={c.id} className={`va-card ${sel.has(c.id) ? "is-selected" : ""}`} onClick={() => setPreview(c)}>
                    <div className="va-card__top">
                      <input type="checkbox" className="p-check" checked={sel.has(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(c.id)} aria-label={`Select ${displayName(c, blind)}`} />
                      <Avatar name={c.candidate_name} size={22} hidden={blind} />
                      <button type="button" className="va-card__name">{displayName(c, blind)}</button>
                      <span className="p-muted p-small">{relTime(c.applied_at)}</span>
                    </div>
                    <div className="va-card__job">{c.job_title}</div>
                    <div className="va-card__foot">
                      <StageTag card={c} />
                      {c.job_match_score != null ? <Score value={c.job_match_score} label="Match" /> : <Score value={c.profile_interview_score} label="Screen" />}
                    </div>
                    <StatusLine card={c} />
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="va-panel" style={{ overflowX: "auto" }}>
          {allCards(cols).map((c) => (
            <div key={c.id} className="va-req" style={{ gridTemplateColumns: "20px minmax(0,1.3fr) minmax(0,1fr) auto auto", cursor: "pointer" }} onClick={() => setPreview(c)}>
              <input type="checkbox" className="p-check" checked={sel.has(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(c.id)} aria-label="Select" />
              <b className="p-truncate" style={{ fontWeight: 550 }}>{displayName(c, blind)}</b>
              <span className="p-muted p-truncate">{c.job_title}</span>
              <StageTag card={c} />
              <Score value={c.job_match_score ?? c.profile_interview_score} label={c.job_match_score != null ? "Match" : "Screen"} />
            </div>
          ))}
        </div>
      )}
      <BulkBar count={sel.size} onClear={clear} />
    </>
  );
}
