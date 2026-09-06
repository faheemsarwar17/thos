"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isAuthenticated } from "@/lib/auth";

export function RequireAuth({
  children,
  employerOnly = false,
}: {
  children: ReactNode;
  employerOnly?: boolean;
}) {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    if (employerOnly) {
      const raw = window.localStorage.getItem("thos.session");
      const session = raw ? JSON.parse(raw) : null;
      if (!session?.has_employer_membership && !session?.is_superadmin) {
        router.replace("/candidate");
        return;
      }
    }
    setOk(true);
  }, [router, employerOnly]);

  if (!ok) {
    return (
      <main id="main-content" className="dashboard">
        <p className="panel-note">Checking your session…</p>
      </main>
    );
  }
  return <>{children}</>;
}
