"use client";
import { useState, type FocusEvent, type PointerEvent } from "react";

type Tip = { x: number; y: number; value: string; label: string } | null;

export function useChartTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (value: string, label: string) => ({
    tabIndex: 0 as const,
    "aria-label": `${label}: ${value}`,
    onPointerMove: (e: PointerEvent) => setTip({ x: e.clientX, y: e.clientY, value, label }),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, value, label });
    },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <b>{tip.value}</b><span>{tip.label}</span>
    </div>
  ) : null;
  return { bind, node };
}
