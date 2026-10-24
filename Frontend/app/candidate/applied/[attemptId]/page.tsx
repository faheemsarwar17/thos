import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { VoiceInterviewPortal } from "@/components/interviews/voice/voice-portal";

export const metadata: Metadata = { title: "Job interview · THOS" };

export default async function AppliedInterview({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return (
    <RequireAuth>
      <VoiceInterviewPortal kind="applied" attemptId={attemptId} label="Job interview" />
    </RequireAuth>
  );
}
