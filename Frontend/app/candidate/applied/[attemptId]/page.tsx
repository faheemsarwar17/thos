import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { VoiceInterviewPortal } from "@/components/interviews/voice/voice-portal";

export const metadata: Metadata = { title: "Job Interview · THOS" };

export default async function AppliedInterview({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return (
    <CandidateShell>
      <VoiceInterviewPortal kind="applied" attemptId={attemptId} label="Job Interview" />
    </CandidateShell>
  );
}
