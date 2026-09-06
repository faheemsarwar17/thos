import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PillTone =
  | "neutral"
  | "brand"
  | "verified"
  | "attention"
  | "danger"
  | "success"
  | "approval";

export function Pill({
  children,
  tone = "neutral",
  icon,
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("pill", `pill--${tone}`, className)}>
      {icon && <span className="pill__icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
