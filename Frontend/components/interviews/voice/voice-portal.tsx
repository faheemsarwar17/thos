"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { configureVoiceApi, publicApi, type VoiceKind } from "@/utils/api";
import type { Interview } from "@/types/tracking";
import LiveKitRoomWrapper from "@/components/interviews/voice/LiveKitRoomWrapper";
import StepIndicator from "@/components/interviews/voice/StepIndicator";
import PermissionCheck from "@/components/interviews/voice/PermissionCheck";
import DeviceCheck from "@/components/interviews/voice/DeviceCheck";
import InterviewSetup from "@/components/interviews/voice/InterviewSetup";

type Step = "permissions" | "device-check" | "setup" | "interview";

function InterviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - var(--topbar-height))",
        minHeight: "calc(100vh - var(--topbar-height))",
        maxHeight: "calc(100vh - var(--topbar-height))",
        overflow: "hidden",
        boxSizing: "border-box",
        backgroundColor: "var(--surface-app)",
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
    </div>
  );
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
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
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
          <p className="eyebrow" style={{ color: tone === "success" ? "var(--green-700)" : tone === "danger" ? "var(--red-600)" : "var(--brand-600)" }}>
            {tone === "success" ? "Assessment Complete" : tone === "danger" ? "Notice" : "Voice Screening"}
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

export function VoiceInterviewPortal({
  kind,
  attemptId,
  label,
}: {
  kind: VoiceKind;
  attemptId: string;
  label: string;
}) {
  const [interview, setInterview] = useState<Interview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<Step>("permissions");
  const [setupStarted, setSetupStarted] = useState(false);
  const [setupStage, setSetupStage] = useState("pending");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [isInterviewCompleted, setIsInterviewCompleted] = useState(false);

  useEffect(() => {
    configureVoiceApi({ kind, attemptId });
  }, [kind, attemptId]);

  const requestInterviewComplete = useCallback(async () => {
    await publicApi.completeInterview(attemptId);
  }, [attemptId]);

  const markInterviewFinished = useCallback(() => {
    setIsInterviewCompleted(true);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await publicApi.getInterview(attemptId);
        if (!active) return;
        setInterview(res.data as Interview);
        const status = String(res.data.status || "").toUpperCase();
        if (["COMPLETED", "SUBMITTED", "EVALUATED", "ANALYZED"].includes(status)) {
          setIsInterviewCompleted(true);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Could not load interview.");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [attemptId]);

  useEffect(() => {
    if (setupStage === "setup_complete" || setupStage === "ready") {
      setCurrentStep("interview");
    }
  }, [setupStage]);

  if (isLoading) {
    return (
      <InterviewShell>
        <CenterCard title={`Preparing ${label}`} message="Loading your interview session…" />
      </InterviewShell>
    );
  }
  if (error) {
    return (
      <InterviewShell>
        <CenterCard title={`${label} unavailable`} message={error} tone="danger" />
      </InterviewShell>
    );
  }
  if (isInterviewCompleted) {
    const sandbox = interview?.sandbox;
    const sandboxPending =
      kind === "applied" &&
      Boolean(sandbox?.required) &&
      !["submitted", "expired"].includes(sandbox?.status ?? "");
    return (
      <InterviewShell>
        <CenterCard
          title={`${label} complete`}
          message={
            sandboxPending
              ? "Thank you. One final step remains: a short proctored sandbox assessment."
              : "Thank you. Your responses are being reviewed. You can return to your candidate home."
          }
          tone="success"
        >
          {sandboxPending ? (
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <a className="button button--primary" href={`/candidate/sandbox/${attemptId}`}>
                Continue to the sandbox
              </a>
              <a className="button button--secondary" href="/candidate">
                Back to candidate home
              </a>
            </div>
          ) : (
            <a className="button button--primary" href="/candidate">
              Back to candidate home
            </a>
          )}
        </CenterCard>
      </InterviewShell>
    );
  }
  if (!interview) {
    return (
      <InterviewShell>
        <CenterCard title={label} message="Interview session not found." tone="danger" />
      </InterviewShell>
    );
  }

  return (
    <InterviewShell>
      <div style={{ width: "100%", maxWidth: "720px", margin: "0 auto", padding: "32px 16px 8px" }}>
        <p className="eyebrow" style={{ textAlign: "center" }}>{label}</p>
        <StepIndicator
          current={
            currentStep === "permissions"
              ? 0
              : currentStep === "device-check"
                ? 1
                : currentStep === "setup"
                  ? 2
                  : 3
          }
          steps={["Permissions", "Device check", "Setup", "Interview"]}
        />
      </div>

      {currentStep === "permissions" && (
        <PermissionCheck cameraRequired={false} onComplete={() => setCurrentStep("device-check")} />
      )}
      {currentStep === "device-check" && (
        <DeviceCheck onNext={() => setCurrentStep("setup")} />
      )}
      {(currentStep === "setup" || currentStep === "interview") && (
        <>
          {currentStep === "setup" && (
            <InterviewSetup
              title={interview.title || label}
              durationMinutes={interview.duration_minutes || 10}
              languageLabel={interview.language || "English"}
              currentStage={setupStage}
              errorMessage={setupError}
              onStart={() => {
                setSetupStarted(true);
                setSetupStage("setting_up");
                return true;
              }}
            />
          )}
          {setupStarted && (
            <div
              suppressHydrationWarning={true}
              style={
                currentStep === "interview"
                  ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }
                  : {
                      position: "absolute",
                      inset: 0,
                      opacity: 0,
                      pointerEvents: "none",
                      overflow: "hidden"
                    }
              }
            >
              <LiveKitRoomWrapper
                token={attemptId}
                interview={interview}
                onRequestInterviewComplete={requestInterviewComplete}
                onInterviewFinished={markInterviewFinished}
                uiMode={currentStep === "setup" ? "setup" : "interview"}
                onSetupStageChange={(stage) => {
                  const mapped: Record<string, string> = {
                    starting: "setting_up",
                    generating_persona: "prompt_generation",
                    connecting_to_room: "agent_initialization",
                    initializing_agents: "agent_initialization",
                    ready: "setup_complete",
                  };
                  setSetupStage(mapped[stage] || stage);
                }}
                onSetupStatusChange={() => undefined}
                onSetupFailed={(detail) => {
                  setSetupError(detail.error);
                  setSetupStage("setup_failed");
                  setCurrentStep("setup");
                }}
              />
            </div>
          )}
        </>
      )}
    </InterviewShell>
  );
}

export function ProfileScreeningLauncher() {
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const listed = await api.get<{ attempts: Array<{ id: string; status: string }> }>(
          "/api/v1/candidates/me/profile-interview-attempts",
        );
        const open = listed.attempts.find((a) => a.status === "in_progress");
        if (open) {
          if (active) setAttemptId(open.id);
          return;
        }
        const profileResp = await api.get<{
          candidate: { target_domains?: string[] };
        }>("/api/v1/candidates/me/profile");
        const packId =
          (profileResp.candidate.target_domains &&
            profileResp.candidate.target_domains[0]) ||
          "education";
        const created = await api.post<{ attempt: { id: string } }>(
          "/api/v1/candidates/me/profile-interview-attempts",
          { pack_id: packId },
        );
        if (active) setAttemptId(created.attempt.id);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not start Profile Screening.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <CenterCard title="Profile Screening" message="Starting your session…" />;
  if (error) return <CenterCard title="Profile Screening" message={error} tone="danger" />;
  if (!attemptId) {
    return <CenterCard title="Profile Screening" message="No attempt available." tone="danger" />;
  }
  return <VoiceInterviewPortal kind="profile" attemptId={attemptId} label="Profile Screening" />;
}
