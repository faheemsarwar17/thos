import type { ReactNode } from "react";
import { LuShieldCheck } from "react-icons/lu";

/** Public auth pages: brand panel + form card at ≥1024px, one column below (PRD §6.4). */
export function AuthLayout({
  title,
  subtitle,
  children,
  wide,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="auth">
      <aside className="auth__brand">
        <span className="auth__wordmark">
          <span className="auth__mark" aria-hidden="true">T</span> THOS
        </span>
        <p className="auth__value">Hire on verified skills, not guesswork.</p>
        <p className="auth__trust">
          <LuShieldCheck size={14} aria-hidden="true" /> Tenant-isolated &amp; WCAG 2.2 AA compliant
        </p>
      </aside>
      <main id="main-content" tabIndex={-1} className="auth__main">
        <div className={wide ? "auth__card auth__card--wide" : "auth__card"}>
          <header className="auth__head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
