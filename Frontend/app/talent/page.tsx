import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { TalentDiscoveryPage } from "@/components/talent/talent-discovery-page";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Talent Discovery · THOS" };

export default function TalentPage() {
  return (
    <DashboardShell>
      <TalentDiscoveryPage />
    </DashboardShell>
  );
}
