"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 10;

/**
 * Composites the shared screen (full frame) and the webcam (picture-in-picture)
 * onto a canvas at ~10 fps, mixes in the microphone, records a single webm via
 * MediaRecorder, and uploads it when the sandbox ends.
 */
export function useSandboxRecorder({
  attemptId,
  screen,
  camera,
  active,
}: {
  attemptId: string;
  screen: MediaStream | null;
  camera: MediaStream | null;
  active: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const uploadedRef = useRef(false);

  useEffect(() => {
    if (!active || !screen || !camera) return;

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return;

    const screenVideo = document.createElement("video");
    screenVideo.muted = true;
    screenVideo.srcObject = screen;
    void screenVideo.play().catch(() => undefined);

    const cameraVideo = document.createElement("video");
    cameraVideo.muted = true;
    cameraVideo.srcObject = camera;
    void cameraVideo.play().catch(() => undefined);

    const draw = () => {
      context.fillStyle = "#000";
      context.fillRect(0, 0, WIDTH, HEIGHT);
      if (screenVideo.videoWidth > 0) {
        const scale = Math.min(WIDTH / screenVideo.videoWidth, HEIGHT / screenVideo.videoHeight);
        const width = screenVideo.videoWidth * scale;
        const height = screenVideo.videoHeight * scale;
        context.drawImage(screenVideo, (WIDTH - width) / 2, (HEIGHT - height) / 2, width, height);
      }
      if (cameraVideo.videoWidth > 0) {
        const pipWidth = 200;
        const pipHeight = (cameraVideo.videoHeight / cameraVideo.videoWidth) * pipWidth;
        context.drawImage(
          cameraVideo,
          WIDTH - pipWidth - 16,
          HEIGHT - pipHeight - 16,
          pipWidth,
          pipHeight,
        );
      }
    };
    const interval = window.setInterval(draw, 1000 / FPS);

    const stream = canvas.captureStream(FPS);
    for (const track of camera.getAudioTracks()) {
      stream.addTrack(track);
    }
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);

    return () => {
      window.clearInterval(interval);
      screenVideo.srcObject = null;
      cameraVideo.srcObject = null;
      if (recorder.state !== "inactive") recorder.stop();
      recorderRef.current = null;
      setRecording(false);
    };
  }, [active, screen, camera]);

  /** Flush the recording and upload it; idempotent and best-effort. */
  const stopAndUpload = useCallback(async () => {
    if (uploadedRef.current) return;
    uploadedRef.current = true;
    const recorder = recorderRef.current;
    const blob = await new Promise<Blob>((resolve) => {
      if (!recorder || recorder.state === "inactive") {
        resolve(new Blob(chunksRef.current, { type: "video/webm" }));
        return;
      }
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "video/webm" }));
      recorder.stop();
    });
    if (blob.size === 0) return;
    const form = new FormData();
    form.append("file", blob, `sandbox_${attemptId}.webm`);
    try {
      await api.postForm(
        `/api/v1/candidates/me/applied-interviews/${attemptId}/sandbox/recording`,
        form,
      );
    } catch {
      // Recording upload is best-effort; the submission itself already landed.
    }
  }, [attemptId]);

  return { recording, stopAndUpload };
}

/** Small red "REC" badge shown in the sandbox header while recording. */
export function RecordingIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="sandbox-recording" role="status" aria-label="Recording in progress">
      ● REC
    </span>
  );
}
