"use client";

import { FormEvent, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VideoConference,
} from "@livekit/components-react";
import { FocusLayout } from "@/components/layout/focus-layout";
import { Button } from "@/components/ui/button";
import { PackChip } from "@/components/ui/pack-chip";

type ConnectionDetails = { token: string; serverUrl: string };

export function LiveKitInterviewRoom({ roomName }: { roomName: string }) {
  const [participantName, setParticipantName] = useState("");
  const [connection, setConnection] = useState<ConnectionDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function joinInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = participantName.trim();
    if (!name) {
      setError("Enter your name before joining the interview.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const response = await fetch("/api/interviews/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, participantName: name }),
      });
      const payload = (await response.json()) as Partial<ConnectionDetails> & { error?: string };
      if (!response.ok || !payload.token || !payload.serverUrl) {
        throw new Error(payload.error ?? "The interview connection could not be prepared. Try again.");
      }
      setConnection({ token: payload.token, serverUrl: payload.serverUrl });
      setStatus("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The interview connection could not be prepared. Try again.");
      setStatus("error");
    }
  }

  if (connection) {
    return (
      <main id="main-content" className="interview-room" data-lk-theme="default">
        <LiveKitRoom
          token={connection.token}
          serverUrl={connection.serverUrl}
          connect
          video
          audio
          onDisconnected={() => setConnection(null)}
          onError={(roomError) => {
            setError(`The room disconnected: ${roomError.message}`);
            setStatus("error");
            setConnection(null);
          }}
        >
          <VideoConference />
          <RoomAudioRenderer />
        </LiveKitRoom>
      </main>
    );
  }

  return (
    <FocusLayout title="Interview room" right={<PackChip name="Domain Pack interview" />} exitHref="/">
      <div className="fx-card fx-card--wide fx-card--left">
        <div className="fx-lobby">
          <section className="fx-lobby__intro" aria-labelledby="interview-title">
            <h1 id="interview-title">Ready to join?</h1>
            <p className="fx-card__text">Check your details before entering. Your browser will ask for camera and microphone access after you join.</p>
            <dl className="meta-list">
              <div><dt>Room</dt><dd className="mono">{roomName}</dd></div>
              <div><dt>Connection</dt><dd><span className="status-dot" aria-hidden="true" /> Encrypted LiveKit session</dd></div>
            </dl>
          </section>
          <section aria-labelledby="setup-title">
            <h2 id="setup-title">Interview setup</h2>
            <form id="join-form" className="stack-md" onSubmit={joinInterview} noValidate>
              <div className="form-field">
                <label className="form-field__label" htmlFor="participant-name">Your name</label>
                <input id="participant-name" className="input" name="participantName" value={participantName} onChange={(event) => setParticipantName(event.target.value)} autoComplete="name" aria-describedby={error ? "join-error" : "name-help"} aria-invalid={Boolean(error)} placeholder="Enter your full name" />
                <p id="name-help" className="form-field__hint">This is how you will appear to other participants.</p>
              </div>
              {error && <p id="join-error" className="fx-alert" role="alert"><strong>Unable to join</strong> <span>{error}</span></p>}
              <ul className="fx-bullets">
                <li className="fx-bullet"><span aria-hidden="true">✓</span> Use a stable internet connection</li>
                <li className="fx-bullet"><span aria-hidden="true">✓</span> Find a quiet, well-lit space</li>
                <li className="fx-bullet"><span aria-hidden="true">✓</span> Close apps using your camera</li>
              </ul>
              <Button type="submit" disabled={status === "loading"} className="fx-card__wide">{status === "loading" ? "Preparing secure room…" : "Join interview room"}</Button>
              <p className="fx-card__fine">By joining, you acknowledge the organization’s interview and recording policy.</p>
            </form>
          </section>
        </div>
      </div>
    </FocusLayout>
  );
}
