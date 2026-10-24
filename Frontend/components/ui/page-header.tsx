import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({ title, meta, actions, className }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("page-header", className)}>
      <div className="page-header__text">
        <h1>{title}</h1>
        {meta && <div className="page-header__meta">{meta}</div>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
