import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { CandidateApplicationsPage } from "@/components/candidate/candidate-applications-page";

export const metadata: Metadata = { title: "My applications · THOS" };

export default function CandidateApplications() {
  return (
    <CandidateShell>
      <CandidateApplicationsPage />
    </CandidateShell>
  );
}
