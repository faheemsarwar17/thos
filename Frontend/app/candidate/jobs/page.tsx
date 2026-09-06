import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { CandidateJobsPage } from "@/components/candidate/candidate-jobs-page";

export const metadata: Metadata = { title: "Find jobs · THOS" };

export default function CandidateJobs() {
  return (
    <CandidateShell>
      <CandidateJobsPage />
    </CandidateShell>
  );
}
