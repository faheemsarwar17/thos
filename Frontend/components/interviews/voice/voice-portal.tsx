"use client";

import { useCallback, useEffect, useState } from "react";
import { LuCircleCheck, LuMic, LuTriangleAlert } from "react-icons/lu";
import { FocusLayout } from "@/components/layout/focus-layout";
import { api } from "@/lib/api";
import { configureVoiceApi, publicApi, type VoiceKind } from "@/utils/api";
import type { Interview } from "@/types/tracking";
import LiveKitRoomWrapper from "@/components/interviews/voice/LiveKitRoomWrapper";
import StepIndicator from "@/components/interviews/voice/StepIndicator";
import PermissionCheck from "@/components/interviews/voice/PermissionCheck";
import DeviceCheck from "@/components/interviews/voice/DeviceCheck";
import InterviewSetup from "@/components/interviews/voice/InterviewSetup";

type Step = "permissions" | "device-check" | "setup" | "interview";

/** Shell-less focus layout for every voice-flow state (PRD §5.3). */
function InterviewShell({
  title,
  steps,
  full,
  children,
}: {
  title: string;
  steps?: React.ReactNode;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FocusLayout title={title} steps={steps} exitHref="/candidate" full={full}>
      {children}
    </FocusLayout>
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
    <div className="fx-card" role={tone === "danger" ? "alert" : undefined}>
      <span className={tone === "success" ? "fx-icon fx-icon--ok" : tone === "danger" ? "fx-icon fx-icon--warn" : "fx-icon"} aria-hidden="true">
        {tone === "success" ? <LuCircleCheck size={24} /> : tone === "danger" ? <LuTriangleAlert size={24} /> : <LuMic size={24} />}
      </span>
      <h1>{title}</h1>
      {message ? <p className="fx-card__text">{message}</p> : null}
      {children ? <div className="fx-card__actions">{children}</div> : null}
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
      <InterviewShell title={label}>
        <CenterCard title={`Preparing ${label}`} message="Loading your interview session…" />
      </InterviewShell>
    );
  }
  if (error) {
    return (
      <InterviewShell title={label}>
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
      <InterviewShell title={label}>
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
            <>
              <a className="button button--primary" href={`/candidate/sandbox/${attemptId}`}>
                Continue to the sandbox
              </a>
              <a className="button button--secondary" href="/candidate">
                Back to candidate home
              </a>
            </>
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
      <InterviewShell title={label}>
        <CenterCard title={label} message="Interview session not found." tone="danger" />
      </InterviewShell>
    );
  }

  return (
    <InterviewShell
      title={label}
      full={currentStep === "interview"}
      steps={
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
      }
    >

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
              className={currentStep === "interview" ? "fx-room" : "fx-room fx-room--hidden"}
            >
              <LiveKitRoomWrapper
                token={attemptId}
                interview={interview}
                title={label}
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

  const explainer =
    "A short AI voice interview on your target domain. Your best score is shared with employers you apply to.";
  if (loading) {
    return (
      <InterviewShell title="Skill screening">
        <CenterCard title="Skill screening" message={`${explainer} Starting your session…`} />
      </InterviewShell>
    );
  }
  if (error) {
    return (
      <InterviewShell title="Skill screening">
        <CenterCard title="Skill screening" message={error} tone="danger">
          <a className="button button--secondary" href="/candidate">Back to candidate home</a>
        </CenterCard>
      </InterviewShell>
    );
  }
  if (!attemptId) {
    return (
      <InterviewShell title="Skill screening">
        <CenterCard title="Skill screening" message="No attempt available." tone="danger" />
      </InterviewShell>
    );
  }
  return <VoiceInterviewPortal kind="profile" attemptId={attemptId} label="Skill screening" />;
}
