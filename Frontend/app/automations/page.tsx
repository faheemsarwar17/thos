"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AutomationBuilder } from "@/components/automations/automation-builder";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

export default function AutomationsPage() {
  return (
    <DashboardShell>
      <main className="content" style={{ padding: "20px 24px", maxWidth: "1280px", margin: "0 auto" }}>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Automations" },
          ]}
        />

        <div style={{ margin: "14px 0 24px" }}>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 700, color: "var(--ink-900)" }}>
            Workflow Automations & Event Triggers
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--ink-500)" }}>
            WHEN / IF / THEN automated stage actions with deterministic safety, zero silent rejections, and complete audit logging
          </p>
        </div>

        <AutomationBuilder />
      </main>
    </DashboardShell>
  );
}
