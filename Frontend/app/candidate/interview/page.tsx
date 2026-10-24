import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { ProfileScreeningLauncher } from "@/components/interviews/voice/voice-portal";

export const metadata: Metadata = { title: "Skill screening · THOS" };

export default function ProfileInterview() {
  return (
    <RequireAuth>
      <ProfileScreeningLauncher />
    </RequireAuth>
  );
}
