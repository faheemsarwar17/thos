"use client";

import { useState, useEffect, useRef } from "react";
import {
  RiMicLine,
  RiCameraLine,
  RiAlertFill,
  RiCameraOffLine,
} from "react-icons/ri";
import StepIndicator from "./StepIndicator";

interface Props {
  onAccept: () => void;
  participantName: string;
  interviewType: string;
}

export default function DevicePermissionGate({ onAccept, participantName, interviewType }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"request" | "test">("request");
  const [volume, setVolume] = useState(0);
  const [hasMic, setHasMic] = useState(false);
  const [hasCam, setHasCam] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const requestPermissions = async () => {
    setIsLoading(true);
    setError(null);

    let micOk = false;
    let camOk = false;

    // Try to get both mic + camera together
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      streamRef.current = stream;
      micOk = true;
      camOk = true;
    } catch {
      // Try audio-only fallback
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        streamRef.current = audioStream;
        micOk = true;
      } catch {
        setError("Microphone access is required to conduct this interview. Please allow permissions in your browser.");
        setIsLoading(false);
        return;
      }
    }

    setHasMic(micOk);
    setHasCam(camOk);

    // Hook up audio analyser
    if (streamRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = audioContext.createMediaStreamSource(streamRef.current);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
    }

    setStep("test");
    setIsLoading(false);
    updateVolume();
  };

  // Attach camera stream to video element after step changes to "test"
  useEffect(() => {
    if (step === "test" && hasCam && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [step, hasCam]);

  const updateVolume = () => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
    const average = sum / dataArray.length;
    setVolume(Math.min(100, Math.round((average / 128) * 100)));
    animationFrameRef.current = requestAnimationFrame(updateVolume);
  };

  const handleJoin = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    onAccept();
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ─── Request Step ────────────────────────────────────────────────────────────
  if (step === "request") {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: "center",
          padding: "24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: "720px", margin: "0 auto" }}>
          <div style={{ padding: "8px 8px 16px" }}>
            <StepIndicator current={0} steps={["Permissions", "Device check", "Interview"]} />
          </div>

          <div className="card animate-fade-up" style={{ width: "100%", padding: "56px 48px", textAlign: "center" }}>
            {/* Icon row */}
            <div style={{ marginBottom: "18px", display: "flex", justifyContent: "center", gap: "14px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-accent-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--color-border)",
                }}
              >
                <RiMicLine size={26} color="var(--color-accent)" />
              </div>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-accent-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid var(--color-border)",
                }}
              >
                <RiCameraLine size={26} color="var(--color-accent)" />
              </div>
            </div>

            <h1 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Welcome, {participantName}</h1>
            <p style={{ margin: "0 auto 22px", maxWidth: "520px" }}>
              You’re about to start your <strong>{interviewType} evaluation</strong>. Please allow{" "}
              <strong>microphone</strong> (required) and <strong>camera</strong> (recommended) access to continue.
            </p>

            {error && (
              <div
                style={{
                  backgroundColor: "var(--color-error-light)",
                  color: "var(--color-error)",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-xl)",
                  fontSize: "0.875rem",
                  margin: "0 auto 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  textAlign: "left",
                  border: "1px solid rgba(220, 38, 38, 0.18)",
                  maxWidth: "560px",
                }}
              >
                <RiAlertFill size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                onClick={requestPermissions}
                disabled={isLoading}
                className="btn btn-primary"
                style={{ width: "100%", maxWidth: "420px", height: "46px", fontSize: "1rem" }}
              >
                {isLoading ? <span className="spinner" /> : "Allow microphone & camera"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Test Step ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ padding: "8px 8px 16px" }}>
          <StepIndicator current={1} steps={["Permissions", "Device check", "Interview"]} />
        </div>

        <div className="card animate-fade-up" style={{ width: "100%", padding: "40px" }}>
          <div style={{ textAlign: "center", marginBottom: "18px" }}>
            <h1 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Device check</h1>
            <p style={{ margin: "0 auto", maxWidth: "520px" }}>Confirm your microphone and camera before joining the interview.</p>
          </div>

          {/* Camera Preview */}
          <div style={{ marginBottom: "18px" }}>
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16/9",
                backgroundColor: "#0f172a",
                borderRadius: "var(--radius-xl)",
                overflow: "hidden",
                border: "1px solid rgba(148, 163, 184, 0.25)",
              }}
            >
              {hasCam ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    color: "#94a3b8",
                  }}
                >
                  <RiCameraOffLine size={36} />
                  <span style={{ fontSize: "0.8125rem" }}>Camera unavailable — audio-only mode</span>
                </div>
              )}

              {hasCam && (
                <div
                  style={{
                    position: "absolute",
                    top: "10px",
                    left: "10px",
                    backgroundColor: "rgba(0,0,0,0.55)",
                    backdropFilter: "blur(4px)",
                    borderRadius: "20px",
                    padding: "4px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <div style={{ width: "6px", height: "6px", borderRadius: "999px", backgroundColor: "#22c55e" }} />
                  <span style={{ color: "#fff", fontSize: "0.75rem", fontWeight: 600 }}>Camera active</span>
                </div>
              )}
            </div>
          </div>

          {/* Audio Level Meter */}
          <div
            style={{
              marginBottom: "18px",
              padding: "14px 16px",
              backgroundColor: "var(--color-bg)",
              borderRadius: "var(--radius-xl)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <RiMicLine size={16} color={hasMic ? "var(--color-success)" : "var(--color-error)"} />
                <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--color-text-muted)" }}>Microphone level</span>
              </div>
              <span style={{ fontSize: "0.8125rem", color: volume > 10 ? "var(--color-success)" : "var(--color-text-muted)" }}>
                {volume > 10 ? "Detecting audio" : "Speak to test..."}
              </span>
            </div>
            <div style={{ width: "100%", height: "10px", backgroundColor: "var(--color-border)", borderRadius: "999px", overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${volume}%`,
                  backgroundColor: volume > 75 ? "var(--color-warning)" : "var(--color-success)",
                  transition: "width 0.1s linear, background-color 0.2s ease",
                  borderRadius: "999px",
                }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleJoin}
              className="btn btn-primary"
              style={{
                width: "100%",
                maxWidth: "420px",
                height: "48px",
                fontSize: "1rem",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "8px",
              }}
            >
              Join interview
            </button>
          </div>

          {!hasCam && (
            <p style={{ textAlign: "center", fontSize: "0.8125rem", color: "var(--color-text-muted)", marginTop: "12px", marginBottom: 0 }}>
              Interview will proceed in audio-only mode. A camera is recommended but not required.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
