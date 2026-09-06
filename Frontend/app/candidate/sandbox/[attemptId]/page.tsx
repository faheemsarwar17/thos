import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { SandboxPortal } from "@/components/sandbox/sandbox-portal";

export const metadata: Metadata = { title: "Sandbox assessment · THOS" };

export default async function CandidateSandbox({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return (
    <CandidateShell>
      <SandboxPortal attemptId={attemptId} />
    </CandidateShell>
  );
}
