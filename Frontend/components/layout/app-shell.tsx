"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LuMenu,
  LuX,
  LuBell,
  LuLogOut,
} from "react-icons/lu";
import { PackChip } from "@/components/ui/pack-chip";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { api, logout } from "@/lib/api";
import { currentSession, type AuthSession } from "@/lib/auth";

export type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  count?: number;
};

export type AppShellProps = {
  persona: "employer" | "candidate";
  primaryNav: NavItem[];
  secondaryNav?: NavItem[];
  topbarAction?: ReactNode;
  children: ReactNode;
};

function SidebarNavigation({
  primaryNav,
  secondaryNav,
  pathname,
  onNavigate,
}: {
  primaryNav: NavItem[];
  secondaryNav?: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const isActive = (href: string) =>
    href === "/" || href === "/candidate"
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <nav className="sidebar__nav" aria-label="Main navigation">
      <p className="sidebar__label">Workspace</p>
      <ul>
        {primaryNav.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.label}>
              <Link
                className={active ? "is-active" : undefined}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
              >
                <span className="nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="nav-count tabular-nums">{item.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {secondaryNav && secondaryNav.length > 0 && (
        <>
          <p className="sidebar__label">Manage</p>
          <ul>
            {secondaryNav.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.label}>
                  <Link
                    className={active ? "is-active" : undefined}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    <span className="nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </nav>
  );
}

export function AppShell({
  persona,
  primaryNav,
  secondaryNav,
  topbarAction,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [orgName, setOrgName] = useState("Loading workspace…");
  const [packName, setPackName] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const s = currentSession();
    setSession(s);

    if (persona === "employer") {
      api
        .get<{ organization: { name: string } }>("/api/v1/organizations/current")
        .then((body) => setOrgName(body.organization.name))
        .catch(() => setOrgName("Hiring Organization"));

      api
        .get<{ activation: { display_name: string } | null }>(
          "/api/v1/organizations/current/domain-packs/active"
        )
        .then((body) => setPackName(body.activation?.display_name ?? null))
        .catch(() => setPackName(null));
    } else {
      setOrgName(s?.user.display_name ?? "Candidate Portal");
      api
        .get<{ packs: { display_name: string }[] }>("/api/v1/packs/catalog")
        .then((body) => setPackName(body.packs[0]?.display_name ?? "Verified Skills"))
        .catch(() => setPackName("Verified Skills"));
    }

    api
      .get<{ unread_count: number }>("/api/v1/notifications")
      .then((body) => setUnread(body.unread_count))
      .catch(() => setUnread(0));
  }, [persona]);

  const handleSignOut = async () => {
    await logout();
    router.replace("/login");
  };

  const userRole =
    persona === "employer"
      ? session?.memberships[0]?.role?.replace(/_/g, " ") ?? "Recruiter"
      : "Verified Candidate";

  const userInitials =
    session?.user.display_name
      ?.split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "TH";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      {/* Persistent Left Sidebar */}
      <aside className="sidebar" aria-label="Primary navigation">
        <Link className="wordmark" href={persona === "employer" ? "/" : "/candidate"}>
          <span className="wordmark__symbol">T</span>
          <span>THOS</span>
          <span className="wordmark__tag">{persona}</span>
        </Link>

        <div className="tenant-switcher" title={orgName}>
          <span className="tenant-switcher__mark" aria-hidden="true">
            {orgName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <span className="tenant-switcher__text">
            <strong>{orgName}</strong>
            <small>{persona === "employer" ? "Hiring workspace" : "Candidate portal"}</small>
          </span>
        </div>

        <SidebarNavigation
          primaryNav={primaryNav}
          secondaryNav={secondaryNav}
          pathname={pathname}
        />

        {session && (
          <div className="sidebar__footer">
            <div className="avatar" aria-hidden="true">
              {userInitials}
            </div>
            <span>
              <strong>{session.user.display_name}</strong>
              <small>{userRole}</small>
            </span>
            <button
              type="button"
              className="sidebar__signout-btn focus-ring"
              aria-label="Sign out"
              title="Sign out of THOS"
              onClick={handleSignOut}
            >
              <LuLogOut size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </aside>

      {/* Main Workspace Canvas */}
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu focus-ring"
            aria-expanded={navOpen}
            aria-controls="mobile-navigation"
            aria-label="Toggle navigation menu"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <LuX size={18} aria-hidden="true" /> : <LuMenu size={18} aria-hidden="true" />}
          </button>

          <div className="mobile-wordmark">THOS</div>

          <GlobalSearch />

          <div className="topbar__actions">
            {packName && <PackChip name={packName} />}

            <ThemeToggle />

            <Link
              className="icon-button focus-ring"
              href={persona === "employer" ? "/admin#audit" : "/candidate/applications"}
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              title="Notifications"
            >
              <LuBell size={17} aria-hidden="true" />
              {unread > 0 && <span className="notification-dot tabular-nums">{unread}</span>}
            </Link>

            {topbarAction}
          </div>
        </header>

        {/* Mobile Slide-Down Drawer Navigation */}
        {navOpen && (
          <div className="mobile-nav" id="mobile-navigation">
            <SidebarNavigation
              primaryNav={primaryNav}
              secondaryNav={secondaryNav}
              pathname={pathname}
              onNavigate={() => setNavOpen(false)}
            />
            {session && (
              <div
                style={{
                  marginTop: "20px",
                  paddingTop: "16px",
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "white", fontSize: "13px" }}>
                  {session.user.display_name}
                </span>
                <button
                  type="button"
                  className="button button--secondary button--sm focus-ring"
                  onClick={handleSignOut}
                >
                  <LuLogOut size={14} aria-hidden="true" /> Sign out
                </button>
              </div>
            )}
          </div>
        )}

        <main id="main-content" tabIndex={-1} style={{ outline: "none", display: "flex", flexDirection: "column", flex: 1 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
