"use client";

import { useEffect, useState } from "react";
import { RiCheckLine } from "react-icons/ri";

type InterviewSetupProps = {
  title: string;
  durationMinutes: number;
  languageLabel: string;
  currentStage: string;
  /** Server or client fatal error during setup (e.g. interview_setup_failed). */
  errorMessage?: string | null;
  onStart: () => Promise<boolean> | boolean;
};

type SetupStage = {
  key: string;
  label: string;
  description: string;
};

const setupStages: SetupStage[] = [
  { key: "setting_up", label: "Setting Up", description: "Initializing and configuring interview environment" },
  { key: "prompt_generation", label: "Creating Agent", description: "Creating agent, persona and preparing interviewer" },
  { key: "agent_initialization", label: "Finalizing Setup", description: "Finalizing setup and starting interview" },
];

export default function InterviewSetup({
  title,
  durationMinutes,
  languageLabel,
  currentStage,
  errorMessage,
  onStart,
}: InterviewSetupProps) {
  const [isBeginning, setIsBeginning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isAnytimeNow, setIsAnytimeNow] = useState(false);

  const handleBeginInterview = async () => {
    setIsBeginning(true);
    const started = await onStart();
    if (!started) setIsBeginning(false);
  };

  const hasFatalError = Boolean(errorMessage) || currentStage === "setup_failed";

  const isSetupDone = currentStage === "setup_complete" || currentStage === "ready";
  const currentIndex = !currentStage ? -1 : isSetupDone ? setupStages.length : setupStages.findIndex((s) => s.key === currentStage);
  const hasStarted = currentIndex >= 0;
  const showSetupProgress = hasStarted || isBeginning;
  const setupProgressIndex = hasStarted ? currentIndex : isBeginning ? 0 : -1;

  const stageCapByKey: Record<string, number> = {
    setting_up: 55,
    prompt_generation: 90,
    agent_initialization: 97,
    setup_complete: 100,
    ready: 100,
  };

  const stageCap =
    setupProgressIndex < 0
      ? 0
      : isSetupDone
        ? 100
        : stageCapByKey[currentStage] ?? Math.min(((setupProgressIndex + 1) / setupStages.length) * 100, 100);

  useEffect(() => {
    if (hasFatalError || !showSetupProgress) {
      queueMicrotask(() => {
        setProgress(0);
        setIsAnytimeNow(false);
      });
      return;
    }

    const tickMs = 500;
    const pctPerTick = 0.5;
    const interval = window.setInterval(() => {
      setProgress((prev) => {
        const next = prev + pctPerTick;
        if (stageCap >= 100) {
          if (next >= 100) {
            setIsAnytimeNow(true);
            return 100;
          }
          return next;
        }
        return Math.min(next, stageCap);
      });
    }, tickMs);

    return () => window.clearInterval(interval);
  }, [hasFatalError, showSetupProgress, stageCap]);

  if (hasFatalError) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "40px 16px",
          background:
            "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(239,246,255,0.55) 35%, rgba(241,245,249,1) 100%)",
        }}
      >
        <div style={{ width: "100%", maxWidth: "720px" }} className="card animate-fade-up">
          <div style={{ padding: "40px 32px", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-error)", marginBottom: "12px" }}>
              Interview setup failed
            </h1>
            <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              {errorMessage || "Something went wrong while preparing your interview. You can close this page or refresh the link to try again."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "40px 16px",
        background:
          "linear-gradient(135deg, rgba(248,250,252,1) 0%, rgba(239,246,255,0.55) 35%, rgba(241,245,249,1) 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "1100px", display: "grid", gap: "18px" }}>
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>
            {hasStarted ? "Interview Setup" : "Ready to Begin?"}
          </h1>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
            {hasStarted ? "Setting up your interview environment" : "Review the details and instructions below"}
          </p>
        </div>

        <div className="card animate-fade-up" style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {/* Left column */}
            <div style={{ padding: "24px", borderRight: "1px solid var(--color-border)" }}>
              <div style={{ marginBottom: "18px" }}>
                <h1 style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--color-text)" }}>{title}</h1>
                <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: "8px",
                      backgroundColor: "var(--color-accent-light)",
                      color: "var(--color-accent)",
                      border: "1px solid rgba(37,99,235,0.18)",
                      padding: "6px 10px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {durationMinutes} minutes
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: "8px",
                      backgroundColor: "var(--color-accent-light)",
                      color: "var(--color-accent)",
                      border: "1px solid rgba(37,99,235,0.18)",
                      padding: "6px 10px",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                  >
                    {languageLabel}
                  </span>
                </div>
              </div>

              <div>
                <p style={{ marginBottom: "12px", fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text)" }}>
                  Important Instructions
                </p>
                {[
                  "Speak clearly and at a normal pace.",
                  "Wait for the interviewer to finish speaking before responding.",
                  "You can ask questions if you need clarification.",
                  "The interview will end automatically after the time limit.",
                  "Please ensure your media device working correctly.",
                ].map((tip) => (
                  <div key={tip} style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                    <div style={{ width: "5px", height: "5px", borderRadius: "999px", backgroundColor: "var(--color-text-muted)" }} />
                    <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "grid", gap: "10px" }}>
                  {setupStages.map((stage, index) => {
                    const isDisabled = !showSetupProgress;
                    const isActive = showSetupProgress && index === setupProgressIndex;
                    const isCompleted = showSetupProgress && index < setupProgressIndex;

                    const borderColor = isDisabled
                      ? "var(--color-border)"
                      : isCompleted
                        ? "rgba(16,185,129,0.28)"
                        : isActive
                          ? "rgba(37,99,235,0.28)"
                          : "var(--color-border)";

                    const bgColor = isDisabled
                      ? "rgba(148,163,184,0.10)"
                      : isCompleted
                        ? "rgba(16,185,129,0.10)"
                        : isActive
                          ? "rgba(37,99,235,0.10)"
                          : "var(--color-surface)";

                    const badgeBg = isActive ? "rgba(37,99,235,0.14)" : "rgba(16,185,129,0.14)";
                    const badgeText = isActive ? "rgba(37,99,235,0.95)" : "rgba(16,185,129,0.95)";

                    return (
                      <div
                        key={stage.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          borderRadius: "12px",
                          border: `1px solid ${borderColor}`,
                          backgroundColor: bgColor,
                          padding: "12px",
                          opacity: isDisabled ? 0.7 : 1,
                        }}
                      >
                        <div
                          style={{
                            width: "32px",
                            height: "32px",
                            borderRadius: "999px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            fontWeight: 800,
                            color: isCompleted || isActive ? "#fff" : "var(--color-text-muted)",
                            backgroundColor: isCompleted
                              ? "rgba(16,185,129,0.95)"
                              : isActive
                                ? "rgba(37,99,235,0.95)"
                                : "rgba(148,163,184,0.30)",
                          }}
                        >
                          {isCompleted ? <RiCheckLine size={18} color="#fff" aria-hidden strokeWidth={2.5} /> : index + 1}
                        </div>

                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-text)" }}>
                            {stage.label}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)" }}>
                            {stage.description}
                          </div>
                        </div>

                        {isActive && (
                          <span style={{ borderRadius: "999px", backgroundColor: badgeBg, padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700, color: badgeText }}>
                            In progress
                          </span>
                        )}
                        {isCompleted && (
                          <span style={{ borderRadius: "999px", backgroundColor: badgeBg, padding: "4px 10px", fontSize: "0.75rem", fontWeight: 700, color: badgeText }}>
                            Complete
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {showSetupProgress && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                      <span style={{ fontWeight: 700 }}>Estimated Time ~ 1 minute</span>
                      <span style={{ fontWeight: 700 }}>{Math.round(progress)}%</span>
                    </div>
                    <div style={{ height: "10px", borderRadius: "999px", backgroundColor: "rgba(148,163,184,0.30)", overflow: "hidden" }}>
                      <div
                        style={{
                          height: "100%",
                          width: `${progress}%`,
                          borderRadius: "999px",
                          backgroundColor: "rgba(37,99,235,0.95)",
                          transition: "width 500ms",
                          opacity: isAnytimeNow ? 0.9 : 1,
                        }}
                      />
                    </div>
                    {isAnytimeNow && (
                      <p style={{ marginTop: "8px", fontSize: "0.75rem", fontWeight: 700, color: "rgba(37,99,235,0.95)" }}>
                        Anytime now...
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: "18px" }}>
                {!showSetupProgress ? (
                  <button className="btn btn-primary" style={{ width: "100%", height: "42px" }} onClick={handleBeginInterview} disabled={isBeginning}>
                    {isBeginning ? "Starting setup..." : "Start Interview"}
                  </button>
                ) : (
                  <button className="btn btn-primary" style={{ width: "100%", height: "42px", opacity: 0.7 }} disabled={true}>
                    {isSetupDone ? "Starting interview..." : "Setting up..."}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

