import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AdminPage } from "@/components/admin/admin-page";

export const metadata: Metadata = { title: "Administration · THOS" };

export default function Admin() {
  return (
    <DashboardShell>
      <AdminPage />
    </DashboardShell>
  );
}
