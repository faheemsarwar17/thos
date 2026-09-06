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
  LuTriangleAlert,
  LuCircleX,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api } from "@/lib/api";
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
        <div style={{ marginTop: "14px", padding: "10px 14px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
          <p className="panel-note" style={{ color: "var(--ink-800)", fontWeight: 500 }}>
            <strong>Expected Next Step:</strong> {timeline.next_action}
          </p>
        </div>
      )}
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
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Candidate Portal", href: "/candidate" }, { label: "My Applications" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Status tracking</p>
          <h1>My Applications</h1>
          <p>Transparent progress tracking. Every application shows exactly where you stand and what happens next.</p>
        </div>
      </div>

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
        <ul className="application-cards" style={{ listStyle: "none", padding: 0 }}>
          {data?.applications.map((application) => {
            const isOpen = openId === application.id;
            const matchScore = (application as unknown as { job_match_score?: number }).job_match_score;
            const isTerminal = ["Withdrawn", "Hired", "Rejected"].includes(application.status);

            return (
              <li key={application.id} className="panel" style={{ marginBottom: "16px" }}>
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">{application.organization_name}</p>
                    <h2>{application.job_title}</h2>
                    {matchScore !== undefined && matchScore !== null && (
                      <div style={{ marginTop: "4px", marginBottom: "6px" }}>
                        <Badge variant="brand">
                          Match Score: {Math.round(matchScore)}/100
                        </Badge>
                      </div>
                    )}
                    <p className="panel-note" style={{ fontSize: "12px", color: "var(--ink-400)" }}>
                      Applied {new Date(application.applied_at).toLocaleDateString()} · Updated{" "}
                      {new Date(application.updated_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="panel__actions" style={{ flexWrap: "wrap", gap: "8px" }}>
                    <Pill tone={application.status === "Withdrawn" ? "neutral" : application.status === "Decision" ? "approval" : "brand"}>
                      {application.status}
                    </Pill>

                    {!isTerminal && application.applied_interview?.sandbox?.required &&
                      (["submitted", "expired"].includes(
                        application.applied_interview.sandbox.status ?? ""
                      ) ? (
                        <Pill tone="success">Sandbox complete</Pill>
                      ) : ["submitted", "evaluated"].includes(
                          application.applied_interview.status
                        ) ? (
                        <Link
                          className="button button--primary button--sm"
                          href={`/candidate/sandbox/${application.applied_interview.attempt_id}`}
                        >
                          <LuCode size={13} aria-hidden="true" />
                          <span>Take sandbox</span>
                        </Link>
                      ) : (
                        <Pill tone="attention">Sandbox pending</Pill>
                      ))}

                    {!isTerminal && application.applied_interview &&
                      ["invited", "in_progress"].includes(application.applied_interview.status) && (
                        <Link
                          className="button button--primary button--sm"
                          href={`/candidate/applied/${application.applied_interview.attempt_id}`}
                        >
                          <LuSparkles size={13} aria-hidden="true" />
                          <span>Complete interview</span>
                        </Link>
                      )}

                    <Button
                      variant="secondary"
                      size="sm"
                      aria-expanded={isOpen}
                      onClick={() => setOpenId(isOpen ? null : application.id)}
                      iconRight={isOpen ? <LuChevronUp size={13} /> : <LuChevronDown size={13} />}
                    >
                      {isOpen ? "Hide timeline" : "View timeline"}
                    </Button>

                    {!isTerminal && (
                      <Button
                        variant="ghost"
                        size="sm"
                        style={{ color: "var(--danger-700)" }}
                        onClick={() => {
                          setWithdrawError(null);
                          setWithdrawingApp(application);
                        }}
                      >
                        <LuCircleX size={13} aria-hidden="true" />
                        <span>Withdraw</span>
                      </Button>
                    )}
                  </div>
                </div>

                {application.ai_improvement_feedback && (
                  <div
                    style={{
                      margin: "0 20px 16px",
                      padding: "16px 18px",
                      background: "var(--brand-50)",
                      border: "1px solid var(--brand-200)",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "10px",
                        color: "var(--brand-800)",
                        fontWeight: 600,
                        fontSize: "14px",
                      }}
                    >
                      <LuSparkles size={16} />
                      <span>AI Career Advisor: Growth &amp; Improvement Roadmap</span>
                    </div>
                    <div
                      style={{
                        whiteSpace: "pre-wrap",
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "var(--ink-800)",
                      }}
                    >
                      {application.ai_improvement_feedback}
                    </div>
                  </div>
                )}

                {isOpen && (
                  <div className="panel-body" style={{ borderTop: "1px solid var(--border)" }}>
                    <ApplicationTimeline applicationId={application.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Confirmation Modal for Self-Withdrawal */}
      {withdrawingApp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-dialog-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="panel"
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "var(--surface)",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
              borderRadius: "12px",
              border: "1px solid var(--border)",
              overflow: "hidden",
            }}
          >
            <div className="panel__header" style={{ borderBottom: "1px solid var(--border)", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "var(--danger-100, #fee2e2)",
                    color: "var(--danger-700, #b91c1c)",
                  }}
                >
                  <LuTriangleAlert size={18} />
                </span>
                <h2 id="withdraw-dialog-title" style={{ margin: 0, fontSize: "17px" }}>
                  Withdraw Application
                </h2>
              </div>
            </div>

            <div className="panel-body" style={{ padding: "20px" }}>
              <p style={{ color: "var(--ink-700)", marginBottom: "12px", fontSize: "14px", lineHeight: 1.5 }}>
                Are you sure you want to withdraw your application for <strong>{withdrawingApp.job_title}</strong> at{" "}
                <strong>{withdrawingApp.organization_name}</strong>?
              </p>
              <p style={{ color: "var(--ink-500)", fontSize: "13px", lineHeight: 1.4, margin: 0 }}>
                This will immediately cancel any pending interview sessions and notify the hiring team. This action cannot be undone.
              </p>

              {withdrawError && (
                <div style={{ marginTop: "14px", padding: "10px 14px", borderRadius: "8px", background: "#fef2f2", color: "#991b1b", fontSize: "13px" }}>
                  {withdrawError}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                padding: "14px 20px",
                background: "var(--surface-sunken)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <Button
                variant="secondary"
                size="sm"
                disabled={isWithdrawing}
                onClick={() => setWithdrawingApp(null)}
              >
                Keep Application
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={isWithdrawing}
                onClick={handleConfirmWithdraw}
              >
                {isWithdrawing ? "Withdrawing…" : "Confirm Withdrawal"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

