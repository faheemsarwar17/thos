"use client";
// PROTOTYPE — dashboard charts (plain SVG/HTML, no library). Palette validated with the dataviz validator:
// 4 categorical slots pass CVD + normal-vision gates in light (#fff) and dark (#141519); light-mode aqua/yellow
// are < 3:1 so every chart carries visible labels/legend counts (relief rule).

import { useState, type ReactNode } from "react";
import type { PipelineCard, PipelineColumn, Posting } from "@/lib/types";
import { PHASES, allCards } from "./shared";

const PHASE_VARS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];

type Tip = { x: number; y: number; value: string; label: string } | null;

function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (value: string, label: string) => ({
    onPointerMove: (e: React.PointerEvent) => setTip({ x: e.clientX, y: e.clientY, value, label }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<Element>) => {
      const r = (e.target as Element).getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, value, label });
    },
    onBlur: () => setTip(null),
    tabIndex: 0,
    "aria-label": `${label}: ${value}`,
  });
  const node = tip ? (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <b>{tip.value}</b><span>{tip.label}</span>
    </div>
  ) : null;
  return { bind, node };
}

export function ChartCard({ title, sub, children, table }: { title: string; sub?: string; children: ReactNode; table?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="viz-card">
      <header>
        <div className="p-grow p-min0"><h2>{title}</h2>{sub && <p className="p-muted p-small">{sub}</p>}</div>
        {table && <button type="button" className="p-link" onClick={() => setAsTable((v) => !v)}>{asTable ? "Chart" : "Table"}</button>}
      </header>
      {asTable ? table : children}
    </section>
  );
}

/* Funnel: magnitude per ordered stage → horizontal bars, one hue, direct-labelled. */
export function FunnelChart({ columns }: { columns: PipelineColumn[] }) {
  const { bind, node } = useTip();
  const rows = columns.filter((c) => !["rejected", "withdrawn"].includes(c.stage_id));
  const total = allCards(columns).length || 1;
  const max = Math.max(1, ...rows.map((r) => r.cards.length));
  return (
    <ChartCard title="Pipeline funnel" sub={`${total} candidates · where they are now`}
      table={<SimpleTable head={["Stage", "Candidates", "% of all"]} rows={rows.map((r) => [r.label, r.cards.length, `${Math.round((r.cards.length / total) * 100)}%`])} />}>
      <div className="viz-funnel">
        {rows.map((r) => (
          <div key={r.stage_id} className="viz-funnel__row">
            <span className="viz-funnel__label p-truncate">{r.label}</span>
            <span className="viz-funnel__track">
              <span className="viz-funnel__bar" style={{ width: r.cards.length ? `${(r.cards.length / max) * 100}%` : "0%" }}
                {...bind(`${r.cards.length} candidates`, r.label)} />
            </span>
            <span className="viz-funnel__value tnum">{r.cards.length}</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}

/* Applications per day, last 14 days → single-series columns, hover per bar. */
export function ApplicationsTrend({ cards }: { cards: PipelineCard[] }) {
  const { bind, node } = useTip();
  const days = 14;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i));
    return { d, n: 0 };
  });
  for (const c of cards) {
    const a = new Date(c.applied_at); a.setHours(0, 0, 0, 0);
    const idx = Math.round((a.getTime() - buckets[0].d.getTime()) / 86400000);
    if (idx >= 0 && idx < days) buckets[idx].n += 1;
  }
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sum = buckets.reduce((s, b) => s + b.n, 0);
  return (
    <ChartCard title="Applications received" sub={`${sum} in the last 14 days`}
      table={<SimpleTable head={["Day", "Applications"]} rows={buckets.map((b) => [fmt(b.d), b.n])} />}>
      <div className="viz-hist viz-hist--trend" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
        {buckets.map((b, i) => (
          <div key={i} className="viz-hist__col" {...bind(`${b.n} applications`, fmt(b.d))}>
            <span className="viz-hist__value tnum">{b.n || ""}</span>
            <span className="viz-hist__bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <span className="viz-hist__label">{i === 0 || i === days - 1 || i === Math.floor(days / 2) ? fmt(b.d) : " "}</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/* Stage mix per requisition (B's stage bars) → horizontal stacked bars by phase, legend + direct counts. */
export function StageMix({ columns, postings, compact }: { columns: PipelineColumn[]; postings: Posting[]; compact?: boolean }) {
  const { bind, node } = useTip();
  const rows = postings.map((p) => {
    const counts = PHASES.map((ph) => columns.filter((c) => (ph.stages as readonly string[]).includes(c.stage_id))
      .reduce((s, c) => s + c.cards.filter((x) => x.posting_id === p.id).length, 0));
    return { p, counts, total: counts.reduce((a, b) => a + b, 0) };
  });
  const Row = ({ href, children }: { href: string; children: ReactNode }) =>
    compact ? <span className="viz-mix__row">{children}</span> : <a href={href} className="viz-mix__row">{children}</a>;
  const legend = (
    <div className="viz-legend">
      {PHASES.map((ph, i) => <span key={ph.id}><i style={{ background: PHASE_VARS[i] }} />{ph.label}</span>)}
    </div>
  );
  const body = (
    <div className="viz-mix">
      {rows.map(({ p, counts, total }) => (
        <Row key={p.id} href={`/jobs/${p.id}`}>
          {!compact && <span className="viz-mix__head"><b className="p-truncate">{p.title}</b><span className="p-muted p-small tnum">{total}</span></span>}
          <span className="viz-stack" aria-hidden={total === 0}>
            {total === 0 ? <span className="viz-stack__empty">{p.status === "draft" ? "Draft — finish setup" : "No applicants yet"}</span>
              : counts.map((n, i) => n > 0 && (
                <span key={i} className="viz-stack__seg" style={{ flexGrow: n, background: PHASE_VARS[i] }}
                  {...bind(`${n} candidates`, `${p.title} · ${PHASES[i].label}`)}>
                  {!compact && <em className="tnum">{n}</em>}
                </span>
              ))}
          </span>
        </Row>
      ))}
    </div>
  );
  if (compact) return <>{body}{node}</>;
  return (
    <ChartCard title="Requisitions by stage" sub="Where each job's candidates sit"
      table={<SimpleTable head={["Requisition", ...PHASES.map((p) => p.label), "Total"]} rows={rows.map((r) => [r.p.title, ...r.counts, r.total])} />}>
      {legend}{body}{node}
    </ChartCard>
  );
}

/* Screening score distribution → 5 buckets, one hue, direct labels. */
export function ScoreHistogram({ cards }: { cards: PipelineCard[] }) {
  const { bind, node } = useTip();
  const scored = cards.map((c) => c.profile_interview_score).filter((s): s is number => s !== null);
  const buckets = [0, 20, 40, 60, 80].map((lo) => ({ lo, n: scored.filter((s) => s >= lo && (lo === 80 ? s <= 100 : s < lo + 20)).length }));
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const median = scored.length ? [...scored].sort((a, b) => a - b)[Math.floor(scored.length / 2)] : null;
  return (
    <ChartCard title="Screening scores" sub={scored.length ? `${scored.length} scored · median ${Math.round(median!)}` : "No scores yet"}
      table={<SimpleTable head={["Score range", "Candidates"]} rows={buckets.map((b) => [`${b.lo}–${b.lo === 80 ? 100 : b.lo + 19}`, b.n])} />}>
      <div className="viz-hist">
        {buckets.map((b) => (
          <div key={b.lo} className="viz-hist__col" {...bind(`${b.n} candidates`, `Score ${b.lo}–${b.lo === 80 ? 100 : b.lo + 19}`)}>
            <span className="viz-hist__value tnum">{b.n || ""}</span>
            <span className="viz-hist__bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <span className="viz-hist__label tnum">{b.lo}+</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="viz-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "tnum" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
