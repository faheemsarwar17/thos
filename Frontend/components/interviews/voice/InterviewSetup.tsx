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
      <div className="fx-card" role="alert">
        <h1 className="fx-card__danger">Interview setup failed</h1>
        <p className="fx-card__text">
          {errorMessage || "Something went wrong while preparing your interview. You can close this page or refresh the link to try again."}
        </p>
      </div>
    );
  }

  return (
    <div className="fx-card fx-card--wide fx-card--left">
      <header className="fx-setup__head">
        <h1>{hasStarted ? "Interview Setup" : "Ready to Begin?"}</h1>
        <p className="fx-card__text">
          {hasStarted ? "Setting up your interview environment" : "Review the details and instructions below"}
        </p>
      </header>

      <div className="fx-setup">
        <div className="fx-setup__details">
          <h2>{title}</h2>
          <div className="chip-row">
            <span className="pill pill--brand">{durationMinutes} minutes</span>
            <span className="pill pill--brand capitalize">{languageLabel}</span>
          </div>
          <h3>Important Instructions</h3>
          <ul className="fx-tips">
            {[
              "Speak clearly and at a normal pace.",
              "Wait for the interviewer to finish speaking before responding.",
              "You can ask questions if you need clarification.",
              "The interview will end automatically after the time limit.",
              "Please ensure your media device working correctly.",
            ].map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        <div className="fx-setup__progress">
          <ol className="fx-stages">
            {setupStages.map((stage, index) => {
              const isDisabled = !showSetupProgress;
              const isActive = showSetupProgress && index === setupProgressIndex;
              const isCompleted = showSetupProgress && index < setupProgressIndex;
              const state = isDisabled ? "is-disabled" : isCompleted ? "is-done" : isActive ? "is-current" : "";

              return (
                <li key={stage.key} className={`fx-stage ${state}`}>
                  <span className="fx-stage__num" aria-hidden="true">
                    {isCompleted ? <RiCheckLine size={16} aria-hidden /> : index + 1}
                  </span>
                  <span className="fx-stage__text">
                    <strong>{stage.label}</strong>
                    <small>{stage.description}</small>
                  </span>
                  {isActive && <span className="pill pill--brand">In progress</span>}
                  {isCompleted && <span className="pill pill--success">Complete</span>}
                </li>
              );
            })}
          </ol>

          {showSetupProgress && (
            <div className="fx-setup__bar">
              <div className="fx-setup__bar-row">
                <span>Estimated Time ~ 1 minute</span>
                <span className="tabular-nums">{Math.round(progress)}%</span>
              </div>
              <div className="fx-bar" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${progress}%` }} />
              </div>
              {isAnytimeNow && <p className="fx-setup__soon">Anytime now...</p>}
            </div>
          )}

          {!showSetupProgress ? (
            <button type="button" className="button button--primary button--lg fx-card__wide" onClick={handleBeginInterview} disabled={isBeginning}>
              {isBeginning ? "Starting setup..." : "Start Interview"}
            </button>
          ) : (
            <button type="button" className="button button--primary button--lg fx-card__wide" disabled={true}>
              {isSetupDone ? "Starting interview..." : "Setting up..."}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
