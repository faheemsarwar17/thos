"use client";
import type { PipelineColumn } from "@/lib/types";
import { allCards } from "@/lib/pipeline-phases";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

export function FunnelChart({ columns }: { columns: PipelineColumn[] }) {
  const { bind, node } = useChartTooltip();
  const rows = columns.filter((c) => !["rejected", "withdrawn"].includes(c.stage_id));
  const total = allCards(columns).length;
  const max = Math.max(1, ...rows.map((r) => r.cards.length));
  return (
    <ChartCard title="Pipeline funnel" sub={`${total} candidates · where they are now`}
      table={<ChartTable head={["Stage", "Candidates", "% of all"]} rows={rows.map((r) => [r.label, r.cards.length, total ? `${Math.round((r.cards.length / total) * 100)}%` : "0%"])} />}>
      <div className="chart-funnel">
        {rows.map((r) => (
          <div key={r.stage_id} className="chart-funnel__row">
            <span className="chart-funnel__label">{r.label}</span>
            <span className="chart-funnel__track">
              <span className="chart-funnel__bar" style={{ width: `${(r.cards.length / max) * 100}%` }} {...bind(`${r.cards.length} candidates`, r.label)} />
            </span>
            <span className="chart-funnel__value tabular-nums">{r.cards.length}</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
