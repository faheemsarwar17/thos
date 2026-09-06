import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { EmployerDashboard } from "@/components/dashboard/employer-dashboard";

export default function HomePage() {
  return <DashboardShell><EmployerDashboard /></DashboardShell>;
}
