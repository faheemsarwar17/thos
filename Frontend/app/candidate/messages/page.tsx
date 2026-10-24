"use client";

import { Suspense } from "react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { MessagesInbox } from "@/components/messages/messages-inbox";

export default function CandidateMessagesPage() {
  return (
    <CandidateShell>
      <Suspense fallback={null}>
        <MessagesInbox persona="candidate" />
      </Suspense>
    </CandidateShell>
  );
}
