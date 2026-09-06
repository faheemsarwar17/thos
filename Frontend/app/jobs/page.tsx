import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { JobsPage } from "@/components/jobs/jobs-page";
import { LoadingState } from "@/components/ui/state";

export const metadata: Metadata = { title: "Jobs · THOS" };

export default function Jobs() {
  return (
    <DashboardShell>
      <Suspense fallback={<main id="main-content" className="dashboard"><LoadingState /></main>}>
        <JobsPage />
      </Suspense>
    </DashboardShell>
  );
}
