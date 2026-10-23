"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LuEllipsis, LuLogOut, LuMail, LuPanelLeft, LuX } from "react-icons/lu";
import { PackChip } from "@/components/ui/pack-chip";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { CommandPalette } from "@/components/layout/command-palette";
import { NotificationsPanel } from "@/components/layout/notifications-panel";
import { RequisitionsPanel } from "@/components/layout/requisitions-panel";
import { api, logout } from "@/lib/api";
import { currentSession, type AuthSession } from "@/lib/auth";

export type NavItem = { label: string; href: string; icon: ReactNode; mobile?: boolean };

export type AppShellProps = {
  persona: "employer" | "candidate";
  nav: NavItem[];
  manageNav?: NavItem[];
  topbarAction?: ReactNode;
  children: ReactNode;
};

function isActive(pathname: string, href: string) {
  return href === "/" || href === "/candidate" ? pathname === href : pathname.startsWith(href.split("?")[0].split("#")[0]);
}

export function AppShell({ persona, nav, manageNav = [], topbarAction, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [packName, setPackName] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const allNav = [...nav, ...manageNav];
  const panelApplies = persona === "employer" && (pathname === "/" || pathname.startsWith("/pipeline"));
  const title = allNav.find((n) => isActive(pathname, n.href))?.label ?? "THOS";

  useEffect(() => {
    const s = currentSession();
    setSession(s);
    try { setPanelOpen(window.localStorage.getItem("thos.panel") !== "0"); } catch { /* ignore */ }
    if (persona === "employer") {
      api.get<{ organization: { name: string } }>("/api/v1/organizations/current")
        .then((b) => setOrgName(b.organization.name)).catch(() => setOrgName("Hiring Organization"));
      api.get<{ activation: { display_name: string } | null }>("/api/v1/organizations/current/domain-packs/active")
        .then((b) => setPackName(b.activation?.display_name ?? null)).catch(() => setPackName(null));
    } else {
      setOrgName(s?.user.display_name ?? "Candidate Portal");
      api.get<{ packs: { display_name: string }[] }>("/api/v1/packs/catalog")
        .then((b) => setPackName(b.packs[0]?.display_name ?? "Verified Skills")).catch(() => setPackName("Verified Skills"));
    }
  }, [persona]);

  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const togglePanel = () => setPanelOpen((v) => { try { window.localStorage.setItem("thos.panel", v ? "0" : "1"); } catch { /* ignore */ } return !v; });
  const signOut = async () => { await logout(); router.replace("/login"); };
  const name = session?.user.display_name ?? "";
  const role = persona === "employer" ? session?.memberships[0]?.role?.replace(/_/g, " ") ?? "Recruiter" : "Verified Candidate";
  const initials = name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "TH";
  const link = (item: NavItem, variant: "rail" | "tab" | "sheet") => {
    const active = isActive(pathname, item.href);
    return (
      <Link key={`${variant}-${item.href}`} href={item.href} className={`nav-${variant}__item${active ? " is-active" : ""}`}
        aria-label={variant === "rail" ? item.label : undefined} aria-current={active ? "page" : undefined} title={variant === "rail" ? item.label : undefined}>
        <span className="nav-icon" aria-hidden="true">{item.icon}</span>
        {variant === "rail" ? <span className="rail-tip" aria-hidden="true">{item.label}</span> : <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className={`shell${panelApplies && panelOpen ? " shell--panel" : ""}`} data-persona={persona}>
      <a className="skip-link" href="#main-content">Skip to main content</a>

      <nav className="rail" aria-label="Primary">
        <Link className="rail__mark" href={persona === "employer" ? "/" : "/candidate"} aria-label="THOS home">T</Link>
        {nav.map((n) => link(n, "rail"))}
        {manageNav.length > 0 && <span className="rail__divider" aria-hidden="true" />}
        {manageNav.map((n) => link(n, "rail"))}
        <div className="rail__end">
          <ThemeToggle />
          <button type="button" className="icon-button" aria-label="Sign out" title="Sign out of THOS" onClick={signOut}><LuLogOut size={16} aria-hidden="true" /></button>
          <span className="avatar" title={`${name} · ${role}`} aria-label={`${name}, ${role}`} role="img">{initials}</span>
        </div>
      </nav>

      {panelApplies && panelOpen && (
        <Suspense fallback={null}>
          <RequisitionsPanel orgName={orgName} />
        </Suspense>
      )}

      <div className="shell__main">
        <header className="topbar">
          {panelApplies && (
            <button type="button" className="icon-button topbar__panel-toggle" aria-pressed={panelOpen} aria-label="Toggle requisitions panel" onClick={togglePanel}>
              <LuPanelLeft size={16} aria-hidden="true" />
            </button>
          )}
          <span className="topbar__title">{title}</span>
          <div className="topbar__actions">
            <CommandPalette persona={persona} destinations={allNav.map((n) => ({ label: n.label, href: n.href }))} />
            {persona === "candidate" && <Link className="icon-button topbar__mobile-only" href="/candidate/messages" aria-label="Messages"><LuMail size={16} aria-hidden="true" /></Link>}
            <NotificationsPanel persona={persona} />
            {packName && <span className="topbar__pack"><PackChip name={packName} /></span>}
            {topbarAction}
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="shell__content">{children}</main>
      </div>

      <nav className="nav-tab" aria-label="Primary (mobile)">
        {allNav.filter((n) => n.mobile).map((n) => link(n, "tab"))}
        <button type="button" className="nav-tab__item" aria-expanded={moreOpen} aria-controls="more-sheet" onClick={() => setMoreOpen(true)}>
          <span className="nav-icon" aria-hidden="true"><LuEllipsis size={19} /></span><span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet-scrim" onClick={() => setMoreOpen(false)}>
          <div id="more-sheet" className="sheet" role="dialog" aria-modal="true" aria-label="More navigation" onClick={(e) => e.stopPropagation()}>
            <header className="sheet__head"><b>{orgName || "THOS"}</b><button type="button" className="icon-button" aria-label="Close" onClick={() => setMoreOpen(false)}><LuX size={16} /></button></header>
            <div className="sheet__list">{allNav.filter((n) => !n.mobile).map((n) => link(n, "sheet"))}</div>
            <footer className="sheet__foot"><span>{name}</span><ThemeToggle /><button type="button" className="button button--secondary button--sm" onClick={signOut}><LuLogOut size={14} aria-hidden="true" /> Sign out</button></footer>
          </div>
        </div>
      )}
    </div>
  );
}
