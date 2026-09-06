import type { HTMLAttributes, ReactNode, TableHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("table-container", className)} {...props} />;
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("table", className)} {...props} />;
}

export function TableEmpty({ children, colSpan }: { children: ReactNode; colSpan: number }) {
  return (
    <tr>
      <td className="table__empty" colSpan={colSpan}>{children}</td>
    </tr>
  );
}

export function TableSkeletonRows({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={`skeleton-row-${r}`}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={`skeleton-cell-${r}-${c}`}>
              <div
                className="skeleton"
                style={{
                  height: "16px",
                  width: c === 0 ? "70%" : "50%",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
