"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { SandboxSessionState, SandboxState } from "@/lib/types";
import { CodeEditor } from "./code-editor";
import { RecordingIndicator, useSandboxRecorder } from "./sandbox-recorder";
import { SandboxTimer } from "./sandbox-timer";
import { enterFullscreen, useProctoring } from "./use-proctoring";
import { WrittenExercise } from "./written-exercise";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Phase = "loading" | "lobby" | "active" | "done";

function sandboxPath(attemptId: string, suffix = ""): string {
  return `/api/v1/candidates/me/applied-interviews/${attemptId}/sandbox${suffix}`;
}

function CenterCard({
  title,
  message,
  tone = "neutral",
  children,
}: {
  title: string;
  message?: string | null;
  tone?: "neutral" | "success" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        minHeight: "calc(100vh - var(--topbar-height))",
        backgroundColor: "var(--surface-app)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "680px" }}>
        <div
          className="panel"
          style={{
            padding: "48px 40px",
            textAlign: "center",
            boxShadow: "var(--shadow-overlay)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <p
            className="eyebrow"
            style={{
              color:
                tone === "success"
                  ? "var(--green-700)"
                  : tone === "danger"
                  ? "var(--red-600)"
                  : "var(--brand-600)",
            }}
          >
            {tone === "success"
              ? "Assessment Complete"
              : tone === "danger"
              ? "Attention Required"
              : "Proctored Sandbox"}
          </p>
          <h1 style={{ fontSize: "22px", marginBottom: "10px" }}>{title}</h1>
          {message ? (
            <p style={{ margin: "0 auto", maxWidth: "480px", color: "var(--ink-600)", fontSize: "14px" }}>
              {message}
            </p>
          ) : null}
          {children ? <div style={{ marginTop: "24px" }}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function SandboxPortal({ attemptId }: { attemptId: string }) {
  const [state, setState] = useState<SandboxState | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [permError, setPermError] = useState<string | null>(null);
  const [screen, setScreen] = useState<MediaStream | null>(null);
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ status: string; score: number | null } | null>(null);

  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Refs mirror the latest submission so timer/violation callbacks never go stale.
  const codeRef = useRef(code);
  codeRef.current = code;
  const languageRef = useRef(language);
  languageRef.current = language;
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submitLockRef = useRef(false);

  const prefill = useCallback((session: SandboxSessionState) => {
    const saved = session.submission;
    if (saved?.updated_at) {
      setCode(saved.code ?? "");
    } else {
      setCode(session.problem?.starter_code ?? "");
    }
    setLanguage(saved?.language || session.problem?.language_hint || "python");
    setAnswers(saved?.answers ?? {});
  }, []);

  // Load the current sandbox state (resume-safe).
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const next = await api.get<SandboxState>(sandboxPath(attemptId));
        if (!live) return;
        setState(next);
        const session = next.session;
        if (session && (session.status === "submitted" || session.status === "expired")) {
          setResult({ status: session.status, score: session.evaluation?.score ?? null });
          setPhase("done");
          return;
        }
        if (session) prefill(session);
        setPhase("lobby");
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : "Could not load the sandbox.");
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [attemptId, prefill]);

  const stopStreams = useCallback(() => {
    for (const stream of [screen, camera]) {
      stream?.getTracks().forEach((track) => track.stop());
    }
    setScreen(null);
    setCamera(null);
  }, [screen, camera]);

  const recorder = useSandboxRecorder({
    attemptId,
    screen,
    camera,
    active: phase === "active",
  });

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setSubmitting(true);
      let outcome = { status: "submitted", score: null as number | null };
      try {
        outcome = await api.post<{ status: string; score: number | null }>(
          sandboxPath(attemptId, "/submit"),
          {
            auto,
            code: codeRef.current,
            language: languageRef.current,
            answers: answersRef.current,
          },
        );
      } catch (cause) {
        // 409 means the sandbox was already finalized server-side; keep going.
        if (!(cause instanceof ApiError && cause.status === 409)) {
          setError("Your work was saved, but the final submission could not be confirmed.");
        }
      }
      await recorder.stopAndUpload();
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Already exited.
        }
      }
      stopStreams();
      setResult(outcome);
      setSubmitting(false);
      setPhase("done");
    },
    [attemptId, recorder, stopStreams],
  );

  const handleViolation = useCallback(
    (type: string, detail: string) => {
      void api.post(sandboxPath(attemptId, "/violations"), { type, detail }).catch(() => undefined);
    },
    [attemptId],
  );

  const handleForceSubmit = useCallback(() => {
    void doSubmit(true);
  }, [doSubmit]);

  useProctoring({
    enabled: phase === "active",
    onViolation: handleViolation,
    onForceSubmit: handleForceSubmit,
  });

  // Autosave every 10s and with keepalive when the tab hides.
  useEffect(() => {
    if (phase !== "active") return;
    const path = sandboxPath(attemptId, "/progress");
    const snapshot = () => ({
      code: codeRef.current,
      language: languageRef.current,
      answers: answersRef.current,
    });
    const save = () => {
      void api.put(path, snapshot()).catch(() => undefined);
    };
    const interval = window.setInterval(save, 10_000);
    const onVisibility = () => {
      if (!document.hidden) return;
      const token = getAccessToken();
      void fetch(`${API_BASE}${path}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(snapshot()),
        keepalive: true,
      }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, attemptId]);

  const requestScreen = async () => {
    setPermError(null);
    try {
      setScreen(await navigator.mediaDevices.getDisplayMedia({ video: true }));
    } catch {
      setPermError("Screen sharing is required to take this assessment.");
    }
  };

  const requestCamera = async () => {
    setPermError(null);
    try {
      setCamera(await navigator.mediaDevices.getUserMedia({ video: true, audio: true }));
    } catch {
      setPermError("Camera and microphone access are required to take this assessment.");
    }
  };

  const handleStart = async () => {
    if (!screen || !camera) return;
    setStarting(true);
    setPermError(null);
    try {
      await enterFullscreen();
    } catch {
      setPermError("Fullscreen mode is required. Allow fullscreen and try again.");
      setStarting(false);
      return;
    }
    try {
      const body = await api.post<{ session: SandboxSessionState }>(
        sandboxPath(attemptId, "/start"),
        {},
      );
      if (body.session) prefill(body.session);
      setState((prev) => (prev ? { ...prev, session: body.session } : prev));
      setPhase("active");
    } catch (cause) {
      if (document.fullscreenElement) {
        try {
          await document.exitFullscreen();
        } catch {
          // Already exited.
        }
      }
      setPermError(cause instanceof Error ? cause.message : "Could not start the sandbox.");
    } finally {
      setStarting(false);
    }
  };

  if (phase === "loading") {
    return <CenterCard title="Preparing the sandbox" message="Loading your assessment…" />;
  }
  if (error && phase !== "done") {
    return <CenterCard title="Sandbox unavailable" message={error} tone="danger" />;
  }
  if (!state?.required) {
    return (
      <CenterCard
        title="No sandbox required"
        message="This role does not include a sandbox assessment."
      >
        <a className="button button--primary" href="/candidate">
          Back to candidate home
        </a>
      </CenterCard>
    );
  }

  const session = state.session;
  const config = state.config;

  if (phase === "done") {
    return (
      <CenterCard
        title={result?.status === "expired" ? "Time expired — sandbox submitted" : "Sandbox submitted"}
        message="Thank you. Your submission, proctoring log, and recording have been shared with the hiring team."
        tone="success"
      >
        {result?.score != null ? (
          <p style={{ marginBottom: "12px", fontWeight: 700 }}>Score: {result.score}/100</p>
        ) : null}
        {error ? <p style={{ marginBottom: "12px" }}>{error}</p> : null}
        <a className="button button--primary" href="/candidate">
          Back to candidate home
        </a>
      </CenterCard>
    );
  }

  if (phase === "lobby") {
    const resuming = session?.status === "in_progress";
    return (
      <CenterCard
        title={resuming ? "Resume your sandbox" : "Before you begin"}
        message={
          config
            ? `${config.type === "coding" ? "Coding problem" : "Written exercise"} · ${
                config.difficulty
              } · ${config.time_limit_minutes} minutes`
            : null
        }
      >
        <ul
          style={{
            textAlign: "left",
            maxWidth: "520px",
            margin: "0 auto 20px",
            paddingLeft: "18px",
            lineHeight: 1.7,
          }}
        >
          <li>The sandbox runs in fullscreen. Leaving fullscreen submits your work immediately.</li>
          <li>Copy, paste, and browser shortcuts are disabled during the assessment.</li>
          <li>Switching tabs or windows is logged; repeated switches auto-submit your work.</li>
          <li>Your screen, camera, and microphone are recorded for the hiring team to review.</li>
          <li>The timer is enforced by the server — when it ends, your work is submitted as-is.</li>
        </ul>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void requestScreen()}
              disabled={Boolean(screen)}
            >
              {screen ? "✓ Screen shared" : "Share your screen"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void requestCamera()}
              disabled={Boolean(camera)}
            >
              {camera ? "✓ Camera & mic on" : "Enable camera & microphone"}
            </button>
          </div>
          {permError ? <p style={{ color: "var(--red-700)", margin: 0 }}>{permError}</p> : null}
          <button
            type="button"
            className="button button--primary"
            onClick={() => void handleStart()}
            disabled={!screen || !camera || starting}
          >
            {starting ? "Starting…" : resuming ? "Resume in fullscreen" : "Start the sandbox"}
          </button>
        </div>
      </CenterCard>
    );
  }

  const problem = session?.problem;
  const exercise = session?.exercise;
  const isWritten = session?.type === "written";

  return (
    <div className="sandbox-active">
      <header className="sandbox-active__header">
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>
            Proctored sandbox · {session?.difficulty ?? ""}
          </p>
          <h1>{isWritten ? "Written exercise" : problem?.title || "Coding problem"}</h1>
        </div>
        <div className="sandbox-active__meta">
          <RecordingIndicator active={recorder.recording} />
          {session?.deadline ? (
            <SandboxTimer deadline={session.deadline} onExpire={() => void doSubmit(true)} />
          ) : null}
          <button
            type="button"
            className="button button--primary button--small"
            onClick={() => void doSubmit(false)}
            disabled={submitting}
          >
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </header>
      {isWritten && exercise ? (
        <WrittenExercise
          exercise={exercise}
          answers={answers}
          onChange={(promptId, value) =>
            setAnswers((prev) => ({ ...prev, [promptId]: value }))
          }
          disabled={submitting}
        />
      ) : (
        <div className="sandbox-coding">
          <aside className="sandbox-problem">
            <h2 style={{ marginTop: 0 }}>{problem?.title}</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{problem?.statement}</p>
            {problem?.examples?.length ? (
              <>
                <h3>Examples</h3>
                {problem.examples.map((example, index) => (
                  <div key={index} className="sandbox-problem__example">
                    <p>
                      <strong>Input:</strong> {example.input}
                    </p>
                    <p>
                      <strong>Output:</strong> {example.output}
                    </p>
                    {example.explanation ? (
                      <p>
                        <strong>Why:</strong> {example.explanation}
                      </p>
                    ) : null}
                  </div>
                ))}
              </>
            ) : null}
            {problem?.constraints?.length ? (
              <>
                <h3>Constraints</h3>
                <ul>
                  {problem.constraints.map((constraint, index) => (
                    <li key={index}>{constraint}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
          <CodeEditor
            value={code}
            language={language}
            onChange={setCode}
            onLanguageChange={setLanguage}
            disabled={submitting}
          />
        </div>
      )}
    </div>
  );
}
