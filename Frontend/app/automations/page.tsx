"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AutomationBuilder } from "@/components/automations/automation-builder";

export default function AutomationsPage() {
  return (
    <DashboardShell>
      <AutomationBuilder />
    </DashboardShell>
  );
}
