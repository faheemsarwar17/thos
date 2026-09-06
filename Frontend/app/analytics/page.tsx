"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export default function AnalyticsPage() {
  return (
    <DashboardShell>
      <main className="content" style={{ padding: "20px 24px", maxWidth: "1280px", margin: "0 auto" }}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Analytics" },
          ]}
        />

        <div style={{ margin: "14px 0 24px" }}>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "var(--ink-900)" }}>
            Platform Analytics & SLA Governance
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--ink-500)" }}>
            Real-time pipeline conversion waterfall, candidate SLA velocity tracking, and algorithmic fairness monitoring
          </p>
        </div>

        <AnalyticsDashboard />
      </main>
    </DashboardShell>
  );
}
