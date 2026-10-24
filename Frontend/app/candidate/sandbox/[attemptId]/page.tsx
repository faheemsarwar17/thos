import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { SandboxPortal } from "@/components/sandbox/sandbox-portal";

export const metadata: Metadata = { title: "Sandbox assessment · THOS" };

export default async function CandidateSandbox({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return (
    <RequireAuth>
      <SandboxPortal attemptId={attemptId} />
    </RequireAuth>
  );
}
