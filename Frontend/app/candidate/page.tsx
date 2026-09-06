import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { CandidateOverview } from "@/components/candidate/candidate-overview";

export const metadata: Metadata = { title: "Candidate portal · THOS" };

export default function CandidateHome() {
  return (
    <CandidateShell>
      <CandidateOverview />
    </CandidateShell>
  );
}
