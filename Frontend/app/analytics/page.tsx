"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default function AnalyticsPage() {
  return (
    <DashboardShell>
      <AnalyticsDashboard />
    </DashboardShell>
  );
}
