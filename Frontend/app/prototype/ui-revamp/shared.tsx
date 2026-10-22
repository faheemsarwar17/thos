"use client";
// PROTOTYPE — throwaway. Shared bits for the UI-revamp variants (/prototype/ui-revamp?variant=A|B|C).
// Read-only: only GET requests; every action button just shows a "prototype" toast.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LuBell, LuBriefcase, LuChevronLeft, LuChevronRight, LuGitFork, LuHouse, LuMail, LuMoon,
  LuSearch, LuSettings, LuSparkles, LuSun, LuTrendingUp, LuUsers, LuX, LuCornerDownLeft,
  LuShieldCheck, LuVideo,
} from "react-icons/lu";
import { api } from "@/lib/api";
import { currentSession } from "@/lib/auth";
import type { Analytics, Notification, PipelineCard, PipelineColumn, Posting } from "@/lib/types";

/* ---------- data ---------- */

export type ProtoData = {
  loading: boolean;
  error: string | null;
  orgName: string;
  packName: string;
  userName: string;
  userRole: string;
  postings: Posting[];
  columns: PipelineColumn[];
  analytics: Analytics | null;
  notifications: Notification[];
  unread: number;
};

export function useProtoData(): ProtoData {
  const [d, setD] = useState<ProtoData>({
    loading: true, error: null, orgName: "…", packName: "", userName: "", userRole: "",
    postings: [], columns: [], analytics: null, notifications: [], unread: 0,
  });
  useEffect(() => {
    const s = currentSession();
    Promise.all([
      api.get<{ organization: { name: string } }>("/api/v1/organizations/current").catch(() => null),
      api.get<{ activation: { display_name: string } | null }>("/api/v1/organizations/current/domain-packs/active").catch(() => null),
      api.get<{ postings: Posting[] }>("/api/v1/postings"),
      api.get<{ columns: PipelineColumn[] }>("/api/v1/pipeline"),
      api.get<{ analytics: Analytics }>("/api/v1/analytics/pipeline").catch(() => null),
      api.get<{ notifications: Notification[]; unread_count: number }>("/api/v1/notifications").catch(() => null),
    ])
      .then(([org, pack, postings, pipeline, analytics, notes]) =>
        setD({
          loading: false, error: null,
          orgName: org?.organization.name ?? "Hiring Organization",
          packName: pack?.activation?.display_name ?? "",
          userName: s?.user.display_name ?? "",
          userRole: s?.memberships[0]?.role?.replace(/_/g, " ") ?? "Recruiter",
          postings: postings.postings,
          columns: pipeline.columns,
          analytics: analytics?.analytics ?? null,
          notifications: notes?.notifications ?? [],
          unread: notes?.unread_count ?? 0,
        }),
      )
      .catch((e: unknown) => setD((p) => ({ ...p, loading: false, error: e instanceof Error ? e.message : "Failed to load" })));
  }, []);
  return d;
}

export const NAV = [
  { label: "Home", href: "/", icon: LuHouse, group: "work" },
  { label: "Jobs", href: "/jobs", icon: LuBriefcase, group: "work" },
  { label: "Pipeline", href: "/pipeline", icon: LuGitFork, group: "work" },
  { label: "Talent", href: "/talent", icon: LuUsers, group: "work" },
  { label: "Messages", href: "/messages", icon: LuMail, group: "work" },
  { label: "Analytics", href: "/analytics", icon: LuTrendingUp, group: "work" },
  { label: "Interviews", href: "/interviews/faculty-panel", icon: LuVideo, group: "work" },
  { label: "Automations", href: "/automations", icon: LuSparkles, group: "manage" },
  { label: "Administration", href: "/admin", icon: LuSettings, group: "manage" },
] as const;

/* ---------- pipeline helpers ---------- */

export const PHASES = [
  { id: "received", label: "Received", stages: ["received", "screened"] },
  { id: "shortlisted", label: "Shortlisted", stages: ["shortlisted"] },
  { id: "interview", label: "Interview", stages: ["applied_interview", "offer"] },
  { id: "results", label: "Results", stages: ["hired", "rejected", "withdrawn"] },
] as const;

export function allCards(columns: PipelineColumn[]): PipelineCard[] {
  return columns.flatMap((c) => c.cards);
}

export function phaseCards(columns: PipelineColumn[], stages: readonly string[]) {
  return columns.filter((c) => stages.includes(c.stage_id)).flatMap((c) => c.cards);
}

export function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function displayName(card: PipelineCard, blind: boolean) {
  return blind ? `Candidate #${card.id.slice(-4)}` : card.candidate_name;
}

export function relTime(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

/* ---------- small UI ---------- */

export function Avatar({ name, size = 28, hidden }: { name: string; size?: number; hidden?: boolean }) {
  return (
    <span className="p-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {hidden ? "•" : initials(name)}
    </span>
  );
}

export function Score({ value, label }: { value: number | null | undefined; label: string }) {
  if (value === null || value === undefined) return <span className="p-score p-score--none">{label} —</span>;
  const tier = value >= 80 ? "high" : value >= 60 ? "mid" : "low";
  return (
    <span className={`p-score p-score--${tier}`} title={`${label} score`}>
      <span className="p-score__label">{label}</span>
      <b className="tnum">{Math.round(value)}</b>
    </span>
  );
}

export function StageTag({ card }: { card: PipelineCard }) {
  return <span className={`p-tag p-tag--${card.stage_category}`}>{card.stage_label}</span>;
}

export function StatusLine({ card }: { card: PipelineCard }) {
  const bits: string[] = [];
  if (card.applied_interview_status) bits.push(`Interview ${card.applied_interview_status.replace(/_/g, " ")}`);
  if (card.sandbox_status) bits.push(`Sandbox ${card.sandbox_status}`);
  if (!bits.length) return null;
  return <span className="p-muted p-small">{bits.join(" · ")}</span>;
}

/* ---------- toast ---------- */

let pushToast: ((msg: string) => void) | null = null;
export function protoAction(label: string) {
  pushToast?.(`${label} — prototype only, nothing was changed`);
}
export function ToastHost() {
  const [msgs, setMsgs] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    pushToast = (text) => {
      const id = Date.now();
      setMsgs((m) => [...m, { id, text }]);
      setTimeout(() => setMsgs((m) => m.filter((x) => x.id !== id)), 3200);
    };
    return () => { pushToast = null; };
  }, []);
  return (
    <div className="p-toasts" role="status" aria-live="polite">
      {msgs.map((m) => <div key={m.id} className="p-toast">{m.text}</div>)}
    </div>
  );
}

/* ---------- theme ---------- */

export function useProtoTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("thos-theme");
      if (saved === "dark" || saved === "light") setTheme(saved);
      else if (window.matchMedia("(prefers-color-scheme: dark)").matches) setTheme("dark");
    } catch { /* ignore */ }
  }, []);
  const toggle = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  return { theme, toggle };
}

export function ThemeButton({ theme, onToggle }: { theme: string; onToggle: () => void }) {
  return (
    <button type="button" className="p-icon-btn" onClick={onToggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
      {theme === "light" ? <LuMoon size={16} /> : <LuSun size={16} />}
    </button>
  );
}

/* ---------- popover hook ---------- */

export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, close]);
  return ref;
}

/* ---------- notifications ---------- */

export function NotificationsButton({ data, align = "right" }: { data: ProtoData; align?: "right" | "left" }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div className="p-pop-anchor" ref={ref}>
      <button type="button" className="p-icon-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        aria-label={data.unread ? `Notifications, ${data.unread} unread` : "Notifications"}>
        <LuBell size={16} />
        {data.unread > 0 && <span className="p-badge-dot tnum">{data.unread}</span>}
      </button>
      {open && (
        <div className={`p-popover p-popover--${align} p-notes`} role="dialog" aria-label="Notifications">
          <header><b>Notifications</b><button type="button" className="p-link" onClick={() => protoAction("Mark all read")}>Mark all read</button></header>
          {data.notifications.length === 0 && <p className="p-muted p-pad">You&apos;re all caught up.</p>}
          {data.notifications.map((n) => (
            <a key={n.id} className={`p-note ${n.read ? "" : "is-unread"}`} href={n.link || "#"}>
              <span className="p-note__dot" aria-hidden="true" />
              <span><b>{n.title}</b><small>{n.body}</small></span>
              <time className="p-muted p-small">{relTime(n.created_at)}</time>
            </a>
          ))}
          <footer><a className="p-link" href="/admin#audit">Open audit log</a></footer>
        </div>
      )}
    </div>
  );
}

/* ---------- command palette ---------- */

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ data, onClose, onOpenCandidate }: {
  data: ProtoData; onClose: () => void; onOpenCandidate: (c: PipelineCard) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const pages = NAV.filter((n) => match(n.label)).map((n) => ({ kind: "Go to", label: n.label, run: () => { window.location.href = n.href; } }));
    const actions = [
      { kind: "Action", label: "Create job", run: () => { window.location.href = "/jobs?create=1"; } },
      { kind: "Action", label: "Toggle blind review", run: () => protoAction("Toggle blind review") },
    ].filter((a) => match(a.label));
    const jobs = data.postings.filter((p) => needle.length >= 2 && match(p.title)).slice(0, 5)
      .map((p) => ({ kind: "Job", label: p.title, run: () => { window.location.href = `/jobs/${p.id}`; } }));
    const people = allCards(data.columns).filter((c) => needle.length >= 2 && match(c.candidate_name)).slice(0, 5)
      .map((c) => ({ kind: "Candidate", label: `${c.candidate_name} · ${c.job_title}`, run: () => { onOpenCandidate(c); onClose(); } }));
    return [...pages, ...actions, ...jobs, ...people];
  }, [q, data, onClose, onOpenCandidate]);

  return (
    <div className="p-scrim" onMouseDown={onClose}>
      <div className="p-palette" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="p-palette__input">
          <LuSearch size={16} aria-hidden="true" />
          <input autoFocus value={q} placeholder="Search or jump to…  (pages, jobs, candidates)"
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") items[active]?.run();
            }} />
          <kbd>Esc</kbd>
        </div>
        <ul className="p-palette__list" role="listbox">
          {items.length === 0 && <li className="p-muted p-pad">No matches for “{q}”</li>}
          {items.map((it, i) => (
            <li key={it.kind + it.label} role="option" aria-selected={i === active}
              className={i === active ? "is-active" : undefined} onMouseEnter={() => setActive(i)} onClick={() => it.run()}>
              <span className="p-palette__kind">{it.kind}</span>
              <span className="p-palette__label">{it.label}</span>
              {i === active && <LuCornerDownLeft size={14} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function SearchTrigger({ onOpen, compact }: { onOpen: () => void; compact?: boolean }) {
  return (
    <button type="button" className={`p-search-trigger ${compact ? "is-compact" : ""}`} onClick={onOpen} aria-label="Search or jump to (Ctrl K)">
      <LuSearch size={15} aria-hidden="true" />
      {!compact && <span>Search or jump to…</span>}
      {!compact && <kbd>Ctrl K</kbd>}
    </button>
  );
}

/* ---------- candidate preview (drawer / detail pane body) ---------- */

export function CandidatePreview({ card, blind, onClose }: { card: PipelineCard; blind: boolean; onClose?: () => void }) {
  const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Interview", "Scorecards", "Messages", "Audit"];
  return (
    <div className="p-preview">
      <header className="p-preview__head">
        <Avatar name={card.candidate_name} size={40} hidden={blind} />
        <div className="p-grow">
          <h2>{displayName(card, blind)}</h2>
          <p className="p-muted p-small">{card.job_title} · applied {relTime(card.applied_at)} ago</p>
        </div>
        {onClose && <button type="button" className="p-icon-btn" onClick={onClose} aria-label="Close"><LuX size={16} /></button>}
      </header>
      <div className="p-preview__meta">
        <StageTag card={card} />
        <Score value={card.job_match_score} label="Match" />
        <Score value={card.profile_interview_score} label="Screening" />
        {blind && <span className="p-tag p-tag--verified"><LuShieldCheck size={12} /> Blind review</span>}
      </div>
      <nav className="p-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "is-active" : undefined} onClick={() => setTab(t)}>{t}</button>
        ))}
      </nav>
      <div className="p-preview__body">
        {tab === "Overview" && (
          <>
            <section><h3>AI match reasoning</h3><p>{card.job_match_reasons || "No match reasoning yet — screen this candidate to generate it."}</p></section>
            <section><h3>Progress</h3><p className="p-muted">Stage {card.stage_position?.current ?? "–"} of {card.stage_position?.total ?? "–"}</p><StatusLine card={card} /></section>
          </>
        )}
        {tab !== "Overview" && <p className="p-muted">The real {tab.toLowerCase()} tab content (unchanged features) renders here.</p>}
      </div>
      <footer className="p-preview__foot">
        <select className="p-select" defaultValue="" aria-label="Move stage" onChange={(e) => e.target.value && protoAction(`Move to ${e.target.value}`)}>
          <option value="">Move stage…</option>
          {card.valid_destinations.map((d) => <option key={d.id} value={d.label}>{d.label}</option>)}
        </select>
        <button type="button" className="p-btn" onClick={() => protoAction("Save scorecard")}>Scorecard</button>
        <button type="button" className="p-btn p-btn--primary" onClick={() => protoAction("Extend offer")}>Decide…</button>
      </footer>
    </div>
  );
}

/* ---------- pipeline actions menu ---------- */

export function ActionsMenu({ counts }: { counts: { received: number; screened: number; shortlisted: number } }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div className="p-pop-anchor" ref={ref}>
      <button type="button" className="p-btn p-btn--primary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <LuSparkles size={14} aria-hidden="true" /> Actions
      </button>
      {open && (
        <div className="p-popover p-popover--right p-menu" role="menu">
          <button role="menuitem" type="button" disabled={!counts.received} onClick={() => protoAction("Screen all received")}>
            <b>Screen all received</b><small>{counts.received} waiting · AI scores against the job</small>
          </button>
          <button role="menuitem" type="button" disabled={!counts.screened} onClick={() => protoAction("Auto-shortlist top N")}>
            <b>Auto-shortlist top N…</b><small>{counts.screened} screened · preview before confirming</small>
          </button>
          <button role="menuitem" type="button" disabled={!counts.shortlisted} onClick={() => protoAction("Auto-invite top N")}>
            <b>Invite top N to interview…</b><small>{counts.shortlisted} shortlisted</small>
          </button>
        </div>
      )}
    </div>
  );
}

export function BulkBar({ count, onClear }: { count: number; onClear: () => void }) {
  if (!count) return null;
  return (
    <div className="p-bulk" role="toolbar" aria-label="Bulk actions">
      <b className="tnum">{count} selected</b>
      <select className="p-select" defaultValue="" aria-label="Move selected to stage" onChange={(e) => e.target.value && protoAction(`Bulk move to ${e.target.value}`)}>
        <option value="">Move to…</option><option>Screened</option><option>Shortlisted</option><option>AI Interview</option>
      </select>
      <button type="button" className="p-btn p-btn--ghost" onClick={() => protoAction("Screen selected")}>Screen</button>
      <button type="button" className="p-btn p-btn--ghost" onClick={() => protoAction("Shortlist selected")}>Shortlist</button>
      <button type="button" className="p-btn p-btn--ghost" onClick={() => protoAction("Invite selected")}>Invite</button>
      <button type="button" className="p-btn p-btn--ghost" onClick={() => protoAction("Export CSV")}>Export CSV</button>
      <button type="button" className="p-btn p-btn--danger" onClick={() => protoAction("Reject selected")}>Reject…</button>
      <button type="button" className="p-icon-btn" onClick={onClear} aria-label="Clear selection"><LuX size={15} /></button>
    </div>
  );
}

export function useSelection() {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return { sel, toggle, clear: () => setSel(new Set()) };
}

/* ---------- variant switcher ---------- */

export function PrototypeSwitcher({ variants, current }: { variants: { key: string; name: string }[]; current: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const idx = Math.max(0, variants.findIndex((v) => v.key === current));
  const go = (i: number) => {
    const v = variants[(i + variants.length) % variants.length];
    const p = new URLSearchParams(params.toString());
    p.set("variant", v.key);
    router.replace(`?${p.toString()}`);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(idx - 1);
      if (e.key === "ArrowRight") go(idx + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="p-switcher" role="navigation" aria-label="Prototype variant switcher">
      <button type="button" onClick={() => go(idx - 1)} aria-label="Previous variant"><LuChevronLeft size={16} /></button>
      <span><b>{variants[idx].key}</b> — {variants[idx].name}</span>
      <button type="button" onClick={() => go(idx + 1)} aria-label="Next variant"><LuChevronRight size={16} /></button>
    </div>
  );
}

export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="p-page-head">
      <div className="p-grow p-min0">
        <h1>{title}</h1>
        {meta && <p className="p-muted p-small">{meta}</p>}
      </div>
      {actions && <div className="p-page-head__actions">{actions}</div>}
    </header>
  );
}
