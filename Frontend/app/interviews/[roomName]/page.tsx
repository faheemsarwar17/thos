import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveKitInterviewRoom } from "@/components/interviews/livekit-interview-room";

export const metadata: Metadata = { title: "Interview room · THOS" };

const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export default async function InterviewPage({ params }: { params: Promise<{ roomName: string }> }) {
  const { roomName } = await params;
  if (!ROOM_NAME_PATTERN.test(roomName)) notFound();
  return <LiveKitInterviewRoom roomName={roomName} />;
}
