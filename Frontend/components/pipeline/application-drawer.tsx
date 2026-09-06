"use client";

import { useState } from "react";
import {
  LuSparkles,
  LuFileText,
  LuHistory,
  LuAward,
  LuMail,
  LuSend,
} from "react-icons/lu";
import { AuthedImage } from "@/components/ui/authed-image";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast-provider";
import { MessagingThreadView } from "@/components/messages/messaging-thread-view";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { ApplicationDetail, Conversation, IdentityVerification } from "@/lib/types";

const IDENTITY_DISPLAY: Record<
  IdentityVerification["status"],
  { label: string; tone: PillTone }
> = {
  match: { label: "Identity verified", tone: "verified" },
  ambiguous: { label: "Identity ambiguous", tone: "attention" },
  mismatch: { label: "Identity mismatch", tone: "danger" },
  no_reference_photo: { label: "No profile photo on file", tone: "neutral" },
  unavailable: { label: "Identity check unavailable", tone: "neutral" },
};

function IdentityVerdictBlock({ verdict }: { verdict: IdentityVerification }) {
  const display = IDENTITY_DISPLAY[verdict.status] ?? {
    label: verdict.status,
    tone: "neutral" as PillTone,
  };
  return (
    <div className="identity-verdict" data-testid="identity-verdict">
      <div className="identity-verdict__row">
        <Pill tone={display.tone}>{display.label}</Pill>
        {typeof verdict.confidence === "number" && (
          <span className="panel-note" style={{ fontVariantNumeric: "tabular-nums" }}>
            confidence {Math.round(verdict.confidence * 100)}%
          </span>
        )}
      </div>
      {verdict.detail && <p className="panel-note">{verdict.detail}</p>}
      {verdict.checked_at && (
        <p className="panel-note" style={{ fontSize: "11px", color: "var(--ink-400)" }}>
          Checked {new Date(verdict.checked_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}

function ScorecardForm({
  applicationId,
  dimensions,
  onSaved,
}: {
  applicationId: string;
  dimensions: string[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState("advance");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitDecision(decision: string, message: string) {
    if (confirm(`Are you sure you want to send a ${decision} email to the candidate?`)) {
      setBusy(true);
      setError(null);
      try {
        await api.post(`/api/v1/applications/${applicationId}/decision`, {
          decision,
          message,
        });
        toast.success(`Candidate status updated: ${decision}`);
        onSaved();
      } catch (cause) {
        const msg = cause instanceof ApiError ? cause.message : "Failed to send decision notification.";
        setError(msg);
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/applications/${applicationId}/scorecards`, {
        scores,
        recommendation,
        note,
      });
      toast.success("Scorecard submitted successfully!");
      onSaved();
    } catch (cause) {
      const msg = cause instanceof ApiError ? cause.message : "The scorecard could not be saved.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scorecard-form">
      <h4>Submit Official Scorecard</h4>
      {dimensions.map((dim) => (
        <label key={dim} className="form-field">
          <span className="form-field__label">{dim} (1–5)</span>
          <select
            className="select"
            value={scores[dim] ?? ""}
            onChange={(e) =>
              setScores((prev) => ({ ...prev, [dim]: Number(e.target.value) }))
            }
          >
            <option value="">Select rating…</option>
            <option value="1">1 — Insufficient evidence</option>
            <option value="2">2 — Developing / partial</option>
            <option value="3">3 — Meets requirements</option>
            <option value="4">4 — Strong / above expectations</option>
            <option value="5">5 — Exceptional mastery</option>
          </select>
        </label>
      ))}

      <label className="form-field">
        <span className="form-field__label">Recommendation</span>
        <select
          className="select"
          value={recommendation}
          onChange={(e) => setRecommendation(e.target.value)}
        >
          <option value="advance">Advance to next round</option>
          <option value="hire">Recommend offer</option>
          <option value="hold">Keep on hold</option>
          <option value="reject">Do not proceed</option>
        </select>
      </label>

      <label className="form-field">
        <span className="form-field__label">Reviewer Notes</span>
        <textarea
          className="textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Specific evidence and feedback supporting your scores…"
        />
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <Button size="sm" onClick={submit} loading={busy}>
        Save Scorecard
      </Button>

      <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
        <h4 style={{ margin: "0 0 8px", fontSize: "13px" }}>Direct Candidate Communication</h4>
        <p className="panel-note" style={{ marginBottom: "12px" }}>
          Trigger branded automated notification workflows for candidate progression.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => submitDecision("Selected", "Congratulations! We would like to extend an offer.")}
            disabled={busy}
            iconLeft={<LuAward size={13} />}
          >
            Extend Offer
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              submitDecision("Online Interview 2", "We would like to invite you to a second round online interview.")
            }
            disabled={busy}
            iconLeft={<LuMail size={13} />}
          >
            Invite Round 2
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              submitDecision("Onsite Interview", "We would like to invite you to an onsite interview.")
            }
            disabled={busy}
            iconLeft={<LuMail size={13} />}
          >
            Invite Onsite
          </Button>
        </div>
      </div>
    </div>
  );
}

function DrawerApplicationMessaging({
  applicationId,
  candidateName,
  jobTitle,
}: {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
}) {
  const { data, loading, error, reload } = useApi<{ conversation: Conversation }>(
    `/api/v1/conversations/by-application/${applicationId}`
  );

  if (loading) return <LoadingState label="Connecting to candidate messaging…" />;
  if (error || !data) {
    return (
      <ErrorState
        message={error?.message ?? "Could not load messages for this application."}
        onRetry={reload}
      />
    );
  }

  return (
    <MessagingThreadView
      conversationId={data.conversation.id}
      recipientTitle={candidateName}
      subtitle={jobTitle}
      isCompact={true}
    />
  );
}

export function ApplicationDrawer({
  applicationId,
  onClose,
  onChanged,
  blindMode = false,
}: {
  applicationId: string;
  onClose: () => void;
  onChanged: () => void;
  blindMode?: boolean;
}) {
  const { data, error, loading, reload } = useApi<{ application: ApplicationDetail }>(
    `/api/v1/applications/${applicationId}`
  );
  const [activeTab, setActiveTab] = useState<"overview" | "interview" | "scorecard" | "messages" | "history">("overview");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  async function invite() {
    setInviteBusy(true);
    setInviteError(null);
    try {
      await api.post(`/api/v1/applications/${applicationId}/applied-interview-invitations`, {
        idempotency_key: idempotencyKey(),
      });
      await reload();
      onChanged();
    } catch (cause) {
      setInviteError(cause instanceof ApiError ? cause.message : "The invitation failed.");
    } finally {
      setInviteBusy(false);
    }
  }

  const application = data?.application;
  const evaluation = application?.applied_interview?.evaluation ?? null;
  const rubricDimensions = evaluation?.dimension_scores.map((d) => d.label) ?? [
    "Structure",
    "Reasoning",
    "Domain correctness",
  ];

  const tabs: TabItem<"overview" | "interview" | "scorecard" | "messages" | "history">[] = [
    { id: "overview", label: "Overview & Match", icon: <LuFileText size={14} /> },
    {
      id: "interview",
      label: "Job Interview",
      icon: <LuSparkles size={14} />,
      count: application?.applied_interview ? 1 : 0,
    },
    { id: "scorecard", label: "Scorecards", icon: <LuAward size={14} /> },
    { id: "messages", label: "Messages", icon: <LuMail size={14} /> },
    { id: "history", label: "Audit Trail", icon: <LuHistory size={14} /> },
  ];

  const candidateDisplayName = blindMode
    ? `Candidate #${application?.id.slice(-4)}`
    : (application?.candidate_name ?? "Application");

  return (
    <Drawer
      open={true}
      onClose={onClose}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {!blindMode && application?.candidate_avatar_url && (
            <AuthedImage
              path={application.candidate_avatar_url}
              alt={`${application.candidate_name} profile photo`}
              size={36}
            />
          )}
          {blindMode && (
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: "var(--brand-100)",
                color: "var(--brand-700)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              #
            </div>
          )}
          <div>
            <span>{candidateDisplayName}</span>
            <span style={{ display: "block", fontSize: "12px", color: "var(--ink-500)", fontWeight: 400 }}>
              {application?.job_title}
            </span>
          </div>
        </div>
      }
      subtitle={
        <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
          {application && <Pill tone="brand">{application.stage_label}</Pill>}
          {application && (
            <ScoreBadge
              score={application.job_match_score ?? application.profile_interview_score}
              label="Match"
            />
          )}
          {blindMode && <Pill tone="neutral">Blind Review Active</Pill>}
        </div>
      }
    >
      {loading ? (
        <LoadingState label="Loading application details…" />
      ) : error || !application ? (
        <ErrorState
          message={error?.message ?? "This application could not be loaded."}
          onRetry={reload}
        />
      ) : (
        <div>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div style={{ marginTop: "20px" }}>
            {activeTab === "overview" && (
              <div style={{ display: "grid", gap: "20px" }}>
                {application.job_match_reasons && (
                  <section aria-labelledby="drawer-match-reasoning">
                    <h3 id="drawer-match-reasoning" style={{ marginBottom: "6px" }}>
                      AI Match Reasoning
                    </h3>
                    <p className="panel-note" style={{ background: "var(--surface-sunken)", padding: "12px", borderRadius: "8px" }}>
                      {application.job_match_reasons}
                    </p>
                  </section>
                )}

                {application.ai_improvement_feedback && (
                  <section aria-labelledby="drawer-ai-feedback">
                    <h3 id="drawer-ai-feedback" style={{ marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px", color: "var(--brand-700)" }}>
                      <LuSparkles size={14} /> AI Improvement Feedback &amp; Advice
                    </h3>
                    <div
                      className="panel-note"
                      style={{
                        background: "var(--brand-50)",
                        border: "1px solid var(--brand-200)",
                        padding: "14px",
                        borderRadius: "8px",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        color: "var(--ink-800)",
                      }}
                    >
                      {application.ai_improvement_feedback}
                    </div>
                  </section>
                )}

                <section aria-labelledby="drawer-profile">
                  <h3 id="drawer-profile" style={{ marginBottom: "6px" }}>
                    Profile Snapshot
                  </h3>
                  <p className="panel-note">
                    Captured when the candidate applied; immutable reference copy.
                  </p>
                  <dl className="meta-list">
                    <div>
                      <dt>Headline</dt>
                      <dd>{application.profile_snapshot.headline || "—"}</dd>
                    </div>
                    <div>
                      <dt>Summary</dt>
                      <dd>{application.profile_snapshot.summary || "—"}</dd>
                    </div>
                    <div>
                      <dt>Skills</dt>
                      <dd>{application.profile_snapshot.skills.join(", ") || "—"}</dd>
                    </div>
                    <div>
                      <dt>Credentials</dt>
                      <dd>{application.profile_snapshot.credentials.join(", ") || "—"}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}

            {activeTab === "interview" && (
              <div style={{ display: "grid", gap: "20px" }}>
                <section aria-labelledby="drawer-interview">
                  <h3 id="drawer-interview" style={{ marginBottom: "8px" }}>
                    Job Interview Status
                  </h3>
                  {!application.applied_interview ? (
                    <div style={{ padding: "16px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
                      <p className="panel-note" style={{ marginBottom: "12px" }}>
                        Not invited yet. Inviting sends the locked question pool for this requisition to the candidate.
                      </p>
                      {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
                      <Button size="sm" onClick={invite} loading={inviteBusy} iconLeft={<LuSend size={13} />}>
                        Invite to Job Interview
                      </Button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <Pill
                          tone={
                            application.applied_interview.status === "evaluated"
                              ? "verified"
                              : "attention"
                          }
                        >
                          {application.applied_interview.status.replace(/_/g, " ")}
                        </Pill>
                      </div>

                      {application.applied_interview.identity_verification && (
                        <IdentityVerdictBlock
                          verdict={application.applied_interview.identity_verification}
                        />
                      )}

                      {evaluation && (
                        <div className="evaluation-block">
                          <div className="evaluation-block__top">
                            <ScoreBadge score={evaluation.overall_score} />
                            <span className="panel-note">
                              Graded on {evaluation.dimension_scores.length} rubric dimensions
                            </span>
                          </div>

                          <ul className="dimension-list">
                            {evaluation.dimension_scores.map((dim) => (
                              <li key={dim.dimension_id}>
                                <strong>{dim.label}</strong>
                                <ScoreBadge score={dim.score} />
                              </li>
                            ))}
                          </ul>

                          {evaluation.evidence && evaluation.evidence.length > 0 && (
                            <details className="evidence-details">
                              <summary>Rubric Citations & Evidence ({evaluation.evidence.length})</summary>
                              <ul>
                                {evaluation.evidence.map((ev, index: number) => (
                                  <li key={index}>
                                    <strong>{ev.dimension_id}:</strong> {ev.text}
                                    {ev.timestamp_range && (
                                      <span style={{ marginLeft: "6px", color: "var(--ink-400)", fontVariantNumeric: "tabular-nums" }}>
                                        [{ev.timestamp_range.start}s – {ev.timestamp_range.end}s]
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === "scorecard" && (
              <div style={{ display: "grid", gap: "20px" }}>
                {application.scorecards.length > 0 && (
                  <section aria-labelledby="existing-scorecards">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <h3 id="existing-scorecards" style={{ margin: 0 }}>
                        Submitted Reviewer Scorecards ({application.scorecards.length})
                      </h3>
                      {application.scorecards.length >= 2 && (
                        <Pill tone={
                          new Set(application.scorecards.map((s) => s.recommendation)).size === 1
                            ? "verified"
                            : "attention"
                        }>
                          {new Set(application.scorecards.map((s) => s.recommendation)).size === 1
                            ? "Consensus"
                            : "Divergence Detected"}
                        </Pill>
                      )}
                    </div>

                    {application.scorecards.length >= 2 && (
                      <div
                        style={{
                          padding: "12px 14px",
                          borderRadius: "8px",
                          background: "var(--surface-sunken)",
                          border: "1px solid var(--border)",
                          marginBottom: "12px",
                        }}
                      >
                        <strong style={{ fontSize: "13px", display: "block", marginBottom: "4px" }}>
                          Reviewer Panel Calibration Analysis
                        </strong>
                        <p className="panel-note" style={{ fontSize: "12px", margin: 0 }}>
                          {new Set(application.scorecards.map((s) => s.recommendation)).size === 1
                            ? "All panel reviewers agree on the candidate recommendation. Score distribution is well-aligned."
                            : "Panel divergence detected: Multiple reviewers submitted conflicting recommendations. Review panel discussion is recommended before issuing an offer or rejection."}
                        </p>
                      </div>
                    )}

                    <ul className="scorecard-list">
                      {application.scorecards.map((card) => (
                        <li key={card.id}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <strong>{card.reviewer_name}</strong>
                            <Pill tone={card.recommendation === "advance" || card.recommendation === "hire" ? "approval" : "neutral"}>
                              {card.recommendation}
                            </Pill>
                          </div>
                          {card.scores && Object.keys(card.scores).length > 0 && (
                            <div style={{ display: "flex", gap: "10px", marginTop: "6px", flexWrap: "wrap" }}>
                              {Object.entries(card.scores).map(([dim, val]) => (
                                <span key={dim} style={{ fontSize: "11px", color: "var(--ink-600)" }}>
                                  {dim}: <strong>{val}/100</strong>
                                </span>
                              ))}
                            </div>
                          )}
                          {card.note && <p style={{ margin: "6px 0 0", fontSize: "13px" }}>{card.note}</p>}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <ScorecardForm
                  applicationId={applicationId}
                  dimensions={rubricDimensions}
                  onSaved={() => {
                    void reload();
                    onChanged();
                  }}
                />
              </div>
            )}

            {activeTab === "messages" && (
              <DrawerApplicationMessaging
                applicationId={applicationId}
                candidateName={candidateDisplayName}
                jobTitle={application.job_title}
              />
            )}

            {activeTab === "history" && (
              <section aria-labelledby="drawer-history">
                <h3 id="drawer-history" style={{ marginBottom: "12px" }}>
                  Immutable Transition Audit Log
                </h3>
                <ul className="history-list">
                  {(application.history || application.transitions || []).map((entry: { id: string; action?: string; detail?: string; from_stage?: string; to_stage?: string; reason_code?: string; note?: string; timestamp?: string; occurred_at?: string; actor_id?: string; actor_name?: string }) => (
                    <li key={entry.id}>
                      <strong>{entry.action ?? `${entry.from_stage} → ${entry.to_stage}`}</strong>
                      <p style={{ margin: "2px 0 0" }}>{entry.detail ?? entry.note ?? entry.reason_code}</p>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {(entry.timestamp || entry.occurred_at) ? new Date(entry.timestamp || entry.occurred_at!).toLocaleString() : "Recently"} · Actor: {entry.actor_id ?? entry.actor_name ?? "System"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
