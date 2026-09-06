"use client";

import { useEffect, useState } from "react";

export default function PermissionCheck({
  onComplete,
  cameraRequired,
}: {
  onComplete: (granted: boolean) => void;
  cameraRequired: boolean;
}) {
  const [denied, setDenied] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);

  useEffect(() => {
    const checkPermissions = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: cameraRequired,
        });
        stream.getTracks().forEach((t) => t.stop());
        onComplete(true);
      } catch (error: unknown) {
        const mediaError = error as { name?: string; message?: string };
        const errorName = mediaError?.name || "";
        const errorMessage = (mediaError?.message || "").toLowerCase();
        const isCameraInUse =
          errorName === "NotReadableError" ||
          errorName === "TrackStartError" ||
          errorMessage.includes("device in use") ||
          errorMessage.includes("could not start video source");

        setCameraBusy(isCameraInUse);
        setDenied(true);
      }
    };

    checkPermissions();
  }, [cameraRequired, onComplete]);

  if (!denied) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px" }}>
        <div
          className="animate-fade-up"
          style={{
            width: "100%",
            maxWidth: "380px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "16px",
            padding: "40px",
            textAlign: "center",
            boxShadow: "var(--shadow-card)",
            marginTop: "-96px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "999px",
              backgroundColor: "var(--color-accent-light)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 18px",
            }}
          >
            <span className="spinner spinner-accent" style={{ width: "22px", height: "22px" }} />
          </div>
          <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--color-text)", marginBottom: "6px" }}>
            Checking permissions
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            Making sure your browser has the access needed to start the interview.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", marginTop: "-48px" }}>
      <div
        className="card animate-fade-up"
        style={{ width: "100%", maxWidth: "520px", padding: "32px", boxShadow: "var(--shadow-card)" }}
      >
        <div
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "12px",
            backgroundColor: "var(--color-error-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 18px",
            border: "1px solid rgba(220,38,38,0.18)",
          }}
        >
          <div style={{ width: "10px", height: "10px", borderRadius: "999px", backgroundColor: "var(--color-error)" }} />
        </div>

        <h2 style={{ textAlign: "center", fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>
          {cameraBusy ? "Camera Is In Use" : "Permissions Required"}
        </h2>
        <p style={{ marginTop: "8px", textAlign: "center", fontSize: "0.875rem", color: "var(--color-error)" }}>
          {cameraBusy
            ? "Your camera is currently being used by another app or browser tab. Close anything using the camera and try again."
            : "This interview requires microphone and camera access. Please allow access and try again."}
        </p>

        <div style={{ marginTop: "24px", display: "grid", gap: "12px" }}>
          {[
            { title: "Microphone", desc: "To capture your spoken answers", required: true },
            { title: "Camera", desc: "To record your video responses", required: true },
          ].map((item) => (
            <div
              key={item.title}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                border: "1px solid var(--color-border)",
                borderRadius: "12px",
                padding: "14px 16px",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
              />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)", margin: 0 }}>
                  {item.title}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", margin: 0 }}>{item.desc}</p>
              </div>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--color-error)" }}>
                {item.required ? "Required" : "Optional"}
              </span>
            </div>
          ))}
        </div>

        <button
          className="btn btn-primary"
          style={{ width: "100%", height: "42px", marginTop: "18px" }}
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    </div>
  );
}

