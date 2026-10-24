"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LuCheck,
  LuCircleDot,
  LuCircle,
  LuFileText,
  LuSparkles,
  LuCode,
  LuChevronDown,
  LuChevronUp,
  LuCircleX,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Stepper } from "@/components/ui/stepper";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api } from "@/lib/api";
import { isTerminal as isTerminalApp, nextStep, sandboxState } from "@/lib/candidate-next-step";
import { useApi } from "@/lib/use-api";
import type { CandidateApplication, Timeline } from "@/lib/types";

function ApplicationTimeline({ applicationId }: { applicationId: string }) {
  const { data, error, loading, reload } = useApi<{ timeline: Timeline }>(
    `/api/v1/candidates/me/applications/${applicationId}/timeline`
  );

  if (loading) return <LoadingState label="Loading progress timeline…" />;
  if (error || !data) {
    return (
      <ErrorState
        message={error?.message ?? "The timeline could not be loaded."}
        onRetry={reload}
      />
    );
  }

  const timeline = data.timeline;

  return (
    <div className="timeline" aria-label={`Progress timeline for ${timeline.job_title}`}>
      <ol>
        {timeline.steps.map((step) => (
          <li key={step.status} className={`timeline__step timeline__step--${step.state}`}>
            <span className="timeline__marker" aria-hidden="true">
              {step.state === "completed" ? (
                <LuCheck size={14} strokeWidth={2.5} />
              ) : step.state === "current" ? (
                <LuCircleDot size={14} strokeWidth={2.5} />
              ) : (
                <LuCircle size={14} />
              )}
            </span>
            <div>
              <strong>{step.status}</strong>
              <span>
                {step.state === "current"
                  ? "Current stage"
                  : step.state === "completed"
                  ? "Completed"
                  : "Upcoming"}
                {step.occurred_at && ` · ${new Date(step.occurred_at).toLocaleDateString()}`}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {timeline.next_action && (
        <p className="note-box timeline__next">
          <strong>Expected Next Step:</strong> {timeline.next_action}
        </p>
      )}
    </div>
  );
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function FeedbackViewer({ content }: { content: string }) {
  const paragraphs = content.split(/\n\s*\n/);
  return (
    <div className="md">
      {paragraphs.map((p, pIdx) => {
        const lines = p
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return null;

        const first = lines[0];
        if (first.startsWith("### ")) {
          return (
            <div key={pIdx}>
              <h4>{first.replace(/^###\s+/, "")}</h4>
              {lines.slice(1).map((line, lIdx) => {
                if (line.startsWith("- ") || line.startsWith("* ")) {
                  return <li key={lIdx}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>;
                }
                return <p key={lIdx}>{renderInlineMarkdown(line)}</p>;
              })}
            </div>
          );
        }

        if (lines.every((l) => l.startsWith("- ") || l.startsWith("* "))) {
          return (
            <ul key={pIdx}>
              {lines.map((l, lIdx) => (
                <li key={lIdx}>{renderInlineMarkdown(l.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }

        return (
          <div key={pIdx}>
            {lines.map((line, lIdx) => {
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return <li key={lIdx}>{renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}</li>;
              }
              return <p key={lIdx}>{renderInlineMarkdown(line)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function CandidateApplicationsPage() {
  const { data, error, loading, reload } = useApi<{ applications: CandidateApplication[] }>(
    "/api/v1/candidates/me/applications"
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [withdrawingApp, setWithdrawingApp] = useState<CandidateApplication | null>(null);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  async function handleConfirmWithdraw() {
    if (!withdrawingApp) return;
    setIsWithdrawing(true);
    setWithdrawError(null);
    try {
      await api.post(`/api/v1/candidates/me/applications/${withdrawingApp.id}/withdraw`, {
        reason: "Candidate requested withdrawal",
      });
      setWithdrawingApp(null);
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to withdraw application. Please try again.";
      setWithdrawError(msg);
    } finally {
      setIsWithdrawing(false);
    }
  }

  return (
    <div className="dashboard">
      <PageHeader title="My applications" meta="Every step, and what happens next" />

      {loading ? (
        <LoadingState label="Loading your active applications…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data && data.applications.length === 0 ? (
        <EmptyState
          icon={<LuFileText size={24} />}
          title="You have not submitted any applications yet"
          description="Browse published job requisitions across verified organizations to apply with your Skill Profile."
          action={
            <Link className="button button--primary" href="/candidate/jobs">
              Browse Open Jobs
            </Link>
          }
        />
      ) : (
        <ul className="journey-list">
          {data?.applications.map((application) => {
            const isOpen = openId === application.id;
            const matchScore = (application as unknown as { job_match_score?: number }).job_match_score;
            const isTerminal = isTerminalApp(application);
            const step = nextStep(application);
            const sandbox = sandboxState(application);
            const current = application.status_order.indexOf(application.status);

            const currentAction = step ? (
              <Link className="button button--primary button--sm" href={step.href}>
                {step.tone === "violet" ? <LuCode size={13} aria-hidden="true" /> : <LuSparkles size={13} aria-hidden="true" />}
                <span>{step.tone === "violet" ? "Take sandbox" : "Complete interview"}</span>
              </Link>
            ) : sandbox === "complete" ? (
              <Pill tone="success">Sandbox complete</Pill>
            ) : sandbox === "pending" ? (
              <Pill tone="attention">Sandbox pending</Pill>
            ) : isTerminal ? null : (
              <span className="journey__waiting">Waiting on the employer</span>
            );

            return (
              <li key={application.id}>
                <article className="panel journey" aria-label={`${application.job_title} at ${application.organization_name}`}>
                  <header className="journey__head">
                    <div className="journey__title">
                      <h2>{application.job_title}</h2>
                      <small>
                        {application.organization_name} · applied {new Date(application.applied_at).toLocaleDateString()} · updated{" "}
                        {new Date(application.updated_at).toLocaleDateString()}
                      </small>
                    </div>
                    <Pill tone={application.status === "Withdrawn" ? "neutral" : application.status === "Decision" ? "approval" : "brand"}>
                      {application.status}
                    </Pill>
                  </header>

                  {application.status_order.length > 0 && (
                    <Stepper
                      orientation="vertical"
                      steps={application.status_order}
                      current={current}
                      renderStep={(label, _i, state) => (
                        <span className="journey__step">
                          <span className="stepper__label">{label}</span>
                          {state === "current" && currentAction && <span className="journey__action">{currentAction}</span>}
                        </span>
                      )}
                    />
                  )}
                  {current < 0 && currentAction && <div className="journey__action">{currentAction}</div>}

                  <div className="journey__scores">
                    <ScoreBadge score={matchScore ?? null} label="Overall match" />
                    <ScoreBadge score={application.applied_interview?.interview_score ?? null} label="Voice interview" />
                    <ScoreBadge score={application.applied_interview?.sandbox?.score ?? null} label="Technical sandbox" />
                  </div>

                  <footer className="journey__foot">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-expanded={isOpen}
                      onClick={() => setOpenId(isOpen ? null : application.id)}
                      iconRight={isOpen ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />}
                    >
                      Details
                    </Button>
                    {!isTerminal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="button--danger-text"
                        iconLeft={<LuCircleX size={13} />}
                        onClick={() => {
                          setWithdrawError(null);
                          setWithdrawingApp(application);
                        }}
                      >
                        Withdraw
                      </Button>
                    )}
                  </footer>

                  {isOpen && (
                    <div className="journey__details">
                      <ApplicationTimeline applicationId={application.id} />
                      {application.ai_improvement_feedback && (
                        <div className="note-box note-box--brand roadmap">
                          <p className="roadmap__title">
                            <LuSparkles size={16} aria-hidden="true" />
                            <span>AI Career Advisor: Growth &amp; Improvement Roadmap</span>
                          </p>
                          <FeedbackViewer content={application.ai_improvement_feedback} />
                        </div>
                      )}
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={!!withdrawingApp}
        onClose={() => {
          if (!isWithdrawing) setWithdrawingApp(null);
        }}
        title="Withdraw application?"
        description="This immediately cancels any pending interview sessions and notifies the hiring team. This action cannot be undone."
      >
        {withdrawingApp && (
          <div className="modal-stack">
            <p>
              Withdraw your application for <strong>{withdrawingApp.job_title}</strong> at{" "}
              <strong>{withdrawingApp.organization_name}</strong>?
            </p>
            {withdrawError && <p className="thread__error" role="alert">{withdrawError}</p>}
            <div className="modal-actions">
              <Button variant="secondary" size="sm" disabled={isWithdrawing} onClick={() => setWithdrawingApp(null)}>
                Keep application
              </Button>
              <Button variant="danger-filled" size="sm" disabled={isWithdrawing} onClick={handleConfirmWithdraw}>
                {isWithdrawing ? "Withdrawing…" : "Confirm withdrawal"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
