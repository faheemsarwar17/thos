"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  LuHouse,
  LuBriefcase,
  LuFileText,
  LuSparkles,
  LuUser,
  LuSearch,
  LuMail,
} from "react-icons/lu";
import { RequireAuth } from "@/components/auth/require-auth";
import { AppShell, type NavItem } from "@/components/layout/app-shell";

const candidateNav: NavItem[] = [
  { label: "Overview", href: "/candidate", icon: <LuHouse size={17} /> },
  { label: "Find jobs", href: "/candidate/jobs", icon: <LuBriefcase size={17} /> },
  { label: "My applications", href: "/candidate/applications", icon: <LuFileText size={17} /> },
  { label: "Messages", href: "/candidate/messages", icon: <LuMail size={17} /> },
  { label: "Skill screening", href: "/candidate/interview", icon: <LuSparkles size={17} /> },
  { label: "Profile & privacy", href: "/candidate/profile", icon: <LuUser size={17} /> },
];

export function CandidateShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AppShell
        persona="candidate"
        primaryNav={candidateNav}
        topbarAction={
          <Link className="button button--secondary button--sm" href="/candidate/jobs">
            <LuSearch size={14} aria-hidden="true" />
            <span>Browse jobs</span>
          </Link>
        }
      >
        {children}
      </AppShell>
    </RequireAuth>
  );
}
