"use client";
import { useState, type ReactNode } from "react";

export function ChartCard({ title, sub, actions, table, children }: { title: string; sub?: ReactNode; actions?: ReactNode; table?: ReactNode; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="chart-card" aria-label={title}>
      <header className="chart-card__head">
        <div className="chart-card__titles"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
        <div className="chart-card__actions">
          {actions}
          {table && <button type="button" className="link" onClick={() => setAsTable((v) => !v)}>{asTable ? "Chart" : "Table"}</button>}
        </div>
      </header>
      {asTable ? table : children}
    </section>
  );
}

export function ChartTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="table-container">
      <table className="chart-table">
        <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === "number" ? "tabular-nums" : undefined}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
