"use client";

import { useEffect, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { publicApi, getTelemetryWsUrl } from "@/utils/api";
import type { Interview } from "@/types/tracking";
import InterviewInterface from "./InterviewInterface";

interface LiveKitRoomWrapperProps {
  token: string;
  interview: Interview;
  onRequestInterviewComplete: () => Promise<void>;
  onInterviewFinished: () => void;
  uiMode?: "setup" | "interview";
  onSetupStageChange?: (stage: string) => void;
  onSetupStatusChange?: (status: string) => void;
  onSetupFailed?: (detail: { error: string; sessionId?: string }) => void;
}

export default function LiveKitRoomWrapper({
  token,
  interview,
  onRequestInterviewComplete,
  onInterviewFinished,
  uiMode = "interview",
  onSetupStageChange,
  onSetupStatusChange,
  onSetupFailed,
}: LiveKitRoomWrapperProps) {
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await publicApi.getLiveKitToken(token);
        if (active) {
          setLiveKitToken(res.data.token);
          setWsUrl(res.data.ws_url);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : "Failed to initialize LiveKit connection.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  if (error) {
    return (
      <div className="panel" style={{ margin: "2rem auto", maxWidth: 720, padding: "2rem", textAlign: "center" }}>
        <h1>Connection issue</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!liveKitToken || !wsUrl) {
    return (
      <div className="panel" style={{ margin: "2rem auto", maxWidth: 720, padding: "2rem", textAlign: "center" }}>
        <h1>Preparing interview</h1>
        <p>Connecting you to the interview room…</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={liveKitToken}
      serverUrl={wsUrl}
      connect
      audio={false}
      video={false}
      data-lk-theme="default"
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        backgroundColor: "transparent",
      }}
    >
      <RoomAudioRenderer />
      <InterviewInterface
        interview={interview}
        telemetrySocketUrl={getTelemetryWsUrl(token)}
        onRequestInterviewComplete={onRequestInterviewComplete}
        onInterviewFinished={onInterviewFinished}
        uiMode={uiMode}
        onSetupStageChange={onSetupStageChange}
        onSetupStatusChange={onSetupStatusChange}
        onSetupFailed={onSetupFailed}
      />
    </LiveKitRoom>
  );
}
