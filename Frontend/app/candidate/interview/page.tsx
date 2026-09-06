import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { ProfileScreeningLauncher } from "@/components/interviews/voice/voice-portal";

export const metadata: Metadata = { title: "Profile Screening · THOS" };

export default function ProfileInterview() {
  return (
    <CandidateShell>
      <ProfileScreeningLauncher />
    </CandidateShell>
  );
}
