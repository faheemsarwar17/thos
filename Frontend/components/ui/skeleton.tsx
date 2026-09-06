import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({
  width,
  height,
  borderRadius,
  className,
  style,
}: {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: borderRadius ?? "var(--radius-sm)",
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={14}
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("panel", className)}
      style={{ padding: "20px", display: "grid", gap: "14px" }}
      aria-hidden="true"
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton width={120} height={18} />
        <Skeleton width={48} height={20} borderRadius="var(--radius-full)" />
      </div>
      <SkeletonText lines={2} />
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <Skeleton width={80} height={24} borderRadius="var(--radius-sm)" />
        <Skeleton width={80} height={24} borderRadius="var(--radius-sm)" />
      </div>
    </div>
  );
}
