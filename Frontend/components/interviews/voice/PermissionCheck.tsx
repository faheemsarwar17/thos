"use client";

import { useEffect, useState } from "react";
import { LuMicOff, LuTriangleAlert } from "react-icons/lu";

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
      <div className="fx-card" role="status">
        <span className="fx-icon" aria-hidden="true">
          <span className="state-block__spinner" />
        </span>
        <h1>Checking permissions</h1>
        <p className="fx-card__text">Making sure your browser has the access needed to start the interview.</p>
      </div>
    );
  }

  return (
    <div className="fx-card">
      <span className="fx-icon fx-icon--warn" aria-hidden="true">
        <LuMicOff size={24} />
      </span>
      <h1>{cameraBusy ? "Camera Is In Use" : "Permissions Required"}</h1>
      <p className="fx-alert" role="alert">
        <LuTriangleAlert size={16} aria-hidden="true" />
        <span>
          {cameraBusy
            ? "Your camera is currently being used by another app or browser tab. Close anything using the camera and try again."
            : "This interview requires microphone and camera access. Please allow access and try again."}
        </span>
      </p>

      <ul className="fx-reqs">
        {[
          { title: "Microphone", desc: "To capture your spoken answers", required: true },
          { title: "Camera", desc: "To record your video responses", required: true },
        ].map((item) => (
          <li key={item.title}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.desc}</small>
            </span>
            <span className="pill pill--danger">{item.required ? "Required" : "Optional"}</span>
          </li>
        ))}
      </ul>

      <button type="button" className="button button--primary fx-card__wide" onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  );
}
