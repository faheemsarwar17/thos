"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PipelineColumn, Posting } from "@/lib/types";
import { PHASES, phaseOf } from "@/lib/pipeline-phases";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

const SLOT = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];

export function StageMixChart({ columns, postings, compact, actions }: { columns: PipelineColumn[]; postings: Posting[]; compact?: boolean; actions?: ReactNode }) {
  const { bind, node } = useChartTooltip();
  const rows = postings.map((p) => {
    const counts = PHASES.map((ph) => columns.filter((c) => phaseOf(c) === ph.id).reduce((s, c) => s + c.cards.filter((x) => x.posting_id === p.id).length, 0));
    return { p, counts, total: counts.reduce((a, b) => a + b, 0) };
  });
  const bar = (p: Posting, counts: number[], total: number) => (
    <span className="chart-stack">
      {total === 0
        ? <span className="chart-stack__empty">{p.status === "draft" ? "Draft — finish setup" : "No applicants yet"}</span>
        : counts.map((n, i) => n > 0 && (
          <span key={i} className="chart-stack__seg" style={{ flexGrow: n, background: SLOT[i] }} {...bind(`${n} candidates`, `${p.title} · ${PHASES[i].label}`)}>
            {!compact && <em className="tabular-nums">{n}</em>}
          </span>
        ))}
    </span>
  );
  if (compact) return <>{rows.map(({ p, counts, total }) => <span key={p.id} className="chart-mix__row chart-mix__row--compact">{bar(p, counts, total)}</span>)}{node}</>;
  return (
    <ChartCard title="Requisitions by stage" sub="Where each job's candidates sit" actions={actions}
      table={<ChartTable head={["Requisition", ...PHASES.map((p) => p.label), "Total"]} rows={rows.map((r) => [r.p.title, ...r.counts, r.total])} />}>
      <div className="chart-legend">{PHASES.map((ph, i) => <span key={ph.id}><i style={{ background: SLOT[i] }} />{ph.label}</span>)}</div>
      <div className="chart-mix">
        {rows.map(({ p, counts, total }) => (
          <Link key={p.id} href={`/jobs/${p.id}`} className="chart-mix__row">
            <span className="chart-mix__head"><b>{p.title}</b><span className="tabular-nums">{total}</span></span>
            {bar(p, counts, total)}
          </Link>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
