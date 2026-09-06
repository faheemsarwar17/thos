import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { PipelinePage } from "@/components/pipeline/pipeline-page";
import { LoadingState } from "@/components/ui/state";

export const metadata: Metadata = { title: "Pipeline · THOS" };

export default function Pipeline() {
  return (
    <DashboardShell>
      <Suspense fallback={<div className="dashboard"><LoadingState /></div>}>
        <PipelinePage />
      </Suspense>
    </DashboardShell>
  );
}
