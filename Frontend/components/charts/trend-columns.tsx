"use client";
import type { PipelineCard } from "@/lib/types";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

export function TrendColumns({ cards, days = 14 }: { cards: PipelineCard[]; days?: number }) {
  const { bind, node } = useChartTooltip();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, i) => { const d = new Date(today); d.setDate(d.getDate() - (days - 1 - i)); return { d, n: 0 }; });
  for (const c of cards) {
    const a = new Date(c.applied_at); a.setHours(0, 0, 0, 0);
    const idx = Math.round((a.getTime() - buckets[0].d.getTime()) / 86_400_000);
    if (idx >= 0 && idx < days) buckets[idx].n += 1;
  }
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const sum = buckets.reduce((s, b) => s + b.n, 0);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <ChartCard title="Applications received" sub={`${sum} in the last ${days} days`}
      table={<ChartTable head={["Day", "Applications"]} rows={buckets.map((b) => [fmt(b.d), b.n])} />}>
      <div className="chart-cols chart-cols--trend" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
        {buckets.map((b, i) => (
          <div key={i} className="chart-cols__col" {...bind(`${b.n} applications`, fmt(b.d))}>
            <span className="chart-cols__value tabular-nums">{b.n || ""}</span>
            <span className="chart-cols__bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <span className="chart-cols__label">{i === 0 || i === days - 1 || i === Math.floor(days / 2) ? fmt(b.d) : " "}</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
