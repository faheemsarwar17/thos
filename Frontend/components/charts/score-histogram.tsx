"use client";
import type { PipelineCard } from "@/lib/types";
import { ChartCard, ChartTable } from "./chart-card";
import { useChartTooltip } from "./use-chart-tooltip";

export function ScoreHistogram({ cards }: { cards: PipelineCard[] }) {
  const { bind, node } = useChartTooltip();
  const scored = cards.map((c) => c.profile_interview_score).filter((s): s is number => s !== null && s !== undefined);
  const buckets = [0, 20, 40, 60, 80].map((lo) => ({ lo, hi: lo === 80 ? 100 : lo + 19, n: scored.filter((s) => s >= lo && (lo === 80 ? s <= 100 : s < lo + 20)).length }));
  const max = Math.max(1, ...buckets.map((b) => b.n));
  const sorted = [...scored].sort((a, b) => a - b);
  const median = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : null;
  return (
    <ChartCard title="Screening scores" sub={scored.length ? `${scored.length} scored · median ${median}` : "No scores yet"}
      table={<ChartTable head={["Score range", "Candidates"]} rows={buckets.map((b) => [`${b.lo}–${b.hi}`, b.n])} />}>
      <div className="chart-cols" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {buckets.map((b) => (
          <div key={b.lo} className="chart-cols__col" {...bind(`${b.n} candidates`, `Score ${b.lo}–${b.hi}`)}>
            <span className="chart-cols__value tabular-nums">{b.n || ""}</span>
            <span className="chart-cols__bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <span className="chart-cols__label tabular-nums">{b.lo}+</span>
          </div>
        ))}
      </div>
      {node}
    </ChartCard>
  );
}
