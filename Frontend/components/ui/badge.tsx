import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type BadgeVariant = "default" | "brand" | "teal" | "amber" | "red";

export function Badge({
  children,
  variant = "default",
  icon,
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("badge", `badge--${variant}`, className)}>
      {icon && <span className="badge__icon" aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}
