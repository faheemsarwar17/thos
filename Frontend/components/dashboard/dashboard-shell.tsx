"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  LuHouse,
  LuBriefcase,
  LuGitFork,
  LuUsers,
  LuSettings,
  LuPlus,
  LuMail,
  LuTrendingUp,
  LuSparkles,
  LuVideo,
} from "react-icons/lu";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [
  { label: "Home", href: "/", icon: <LuHouse size={18} />, mobile: true },
  { label: "Jobs", href: "/jobs", icon: <LuBriefcase size={18} />, mobile: true },
  { label: "Pipeline", href: "/pipeline", icon: <LuGitFork size={18} />, mobile: true },
  { label: "Talent", href: "/talent", icon: <LuUsers size={18} /> },
  { label: "Messages", href: "/messages", icon: <LuMail size={18} />, mobile: true },
  { label: "Analytics", href: "/analytics", icon: <LuTrendingUp size={18} /> },
  { label: "Interviews", href: "/interviews/faculty-panel", icon: <LuVideo size={18} /> },
];

// Register organization moved out of the rail: it is linked from Administration → Organization and from login.
const manageNav: NavItem[] = [
  { label: "Automations", href: "/automations", icon: <LuSparkles size={18} /> },
  { label: "Administration", href: "/admin", icon: <LuSettings size={18} /> },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth employerOnly>
      <AppShell
        persona="employer"
        nav={nav}
        manageNav={manageNav}
        topbarAction={
          <Link className="button button--primary button--sm" href="/jobs?create=1" aria-label="New job">
            <LuPlus size={14} aria-hidden="true" />
            <span className="hide-sm">New job</span>
          </Link>
        }
      >
        {children}
      </AppShell>
    </RequireAuth>
  );
}
