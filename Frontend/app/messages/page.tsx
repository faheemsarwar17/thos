"use client";

import { Suspense } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MessagesInbox } from "@/components/messages/messages-inbox";

export default function EmployerMessagesPage() {
  return (
    <DashboardShell>
      <Suspense fallback={null}>
        <MessagesInbox persona="employer" />
      </Suspense>
    </DashboardShell>
  );
}
