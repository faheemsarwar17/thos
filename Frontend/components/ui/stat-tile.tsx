import Link from "next/link";
import type { ReactNode } from "react";

export function StatTile({ label, value, hint, href, action }: { label: ReactNode; value: ReactNode; hint?: ReactNode; href?: string; action?: ReactNode }) {
  return (
    <div className="stat-tile">
      <span className="stat-tile__label">{label}</span>
      <strong className="stat-tile__value tabular-nums">{value}</strong>
      {hint && <span className="stat-tile__hint">{hint}</span>}
      {href && <Link className="stat-tile__link" href={href}>{action ?? "Open"}</Link>}
      {!href && action}
    </div>
  );
}
