import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { CandidateProfilePage } from "@/components/candidate/candidate-profile-page";

export const metadata: Metadata = { title: "Profile & privacy · THOS" };

export default function Profile() {
  return (
    <CandidateShell>
      <CandidateProfilePage />
    </CandidateShell>
  );
}
