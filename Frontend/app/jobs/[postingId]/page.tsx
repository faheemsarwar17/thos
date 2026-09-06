import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { JobDetailPage } from "@/components/jobs/job-detail-page";

export const metadata: Metadata = { title: "Job detail · THOS" };

export default async function JobDetail({ params }: { params: Promise<{ postingId: string }> }) {
  const { postingId } = await params;
  return (
    <DashboardShell>
      <JobDetailPage postingId={postingId} />
    </DashboardShell>
  );
}
