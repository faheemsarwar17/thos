"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  LuHouse,
  LuBriefcase,
  LuFileText,
  LuMic,
  LuUser,
  LuSearch,
  LuMail,
} from "react-icons/lu";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const nav: NavItem[] = [
  { label: "Home", href: "/candidate", icon: <LuHouse size={18} />, mobile: true },
  { label: "Jobs", href: "/candidate/jobs", icon: <LuBriefcase size={18} />, mobile: true },
  { label: "Applications", href: "/candidate/applications", icon: <LuFileText size={18} />, mobile: true },
  { label: "Messages", href: "/candidate/messages", icon: <LuMail size={18} /> },
  { label: "Screening", href: "/candidate/interview", icon: <LuMic size={18} />, mobile: true },
  { label: "Profile", href: "/candidate/profile", icon: <LuUser size={18} />, mobile: true },
];

export function CandidateShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell
        persona="candidate"
        nav={nav}
        topbarAction={
          <Link className="button button--secondary button--sm" href="/candidate/jobs" aria-label="Browse jobs">
            <LuSearch size={14} aria-hidden="true" />
            <span className="hide-sm">Browse jobs</span>
          </Link>
        }
      >
        {children}
      </AppShell>
    </RequireAuth>
  );
}
