import Link from "next/link";
import type { ReactNode } from "react";

export function FocusLayout({ title, steps, right, exitHref, exitLabel = "Exit", children, full }: {
  title: ReactNode; steps?: ReactNode; right?: ReactNode; exitHref?: string; exitLabel?: string; children: ReactNode; full?: boolean;
}) {
  return (
    <div className="focus">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="focus__head">
        <span className="focus__mark" aria-hidden="true">T</span>
        <b className="focus__title">{title}</b>
        {steps}
        <span className="focus__spacer" />
        {right}
        {exitHref && <Link className="button button--ghost button--sm" href={exitHref}>{exitLabel}</Link>}
      </header>
      <main id="main-content" tabIndex={-1} className={full ? "focus__main focus__main--full" : "focus__main"}>{children}</main>
    </div>
  );
}
