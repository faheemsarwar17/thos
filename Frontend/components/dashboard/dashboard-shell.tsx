"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  LuHouse,
  LuBriefcase,
  LuGitFork,
  LuUsers,
  LuSettings,
  LuBuilding2,
  LuPlus,
  LuMail,
  LuTrendingUp,
  LuSparkles,
} from "react-icons/lu";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const primaryNav: NavItem[] = [
  { label: "Home", href: "/", icon: <LuHouse size={17} /> },
  { label: "Jobs", href: "/jobs", icon: <LuBriefcase size={17} /> },
  { label: "Pipeline", href: "/pipeline", icon: <LuGitFork size={17} /> },
  { label: "Talent", href: "/talent", icon: <LuUsers size={17} /> },
  { label: "Analytics", href: "/analytics", icon: <LuTrendingUp size={17} /> },
  { label: "Messages", href: "/messages", icon: <LuMail size={17} /> },
];

const secondaryNav: NavItem[] = [
  { label: "Automations", href: "/automations", icon: <LuSparkles size={17} /> },
  { label: "Administration", href: "/admin", icon: <LuSettings size={17} /> },
  { label: "Register organization", href: "/register/organization", icon: <LuBuilding2 size={17} /> },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth employerOnly>
      <AppShell
        persona="employer"
        primaryNav={primaryNav}
        secondaryNav={secondaryNav}
        topbarAction={
          <Link className="button button--primary button--sm" href="/jobs?create=1">
            <LuPlus size={14} aria-hidden="true" />
            <span>Create job</span>
          </Link>
        }
      >
        {children}
      </AppShell>
    </RequireAuth>
  );
}
