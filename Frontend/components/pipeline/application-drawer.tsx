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
import { Popover } from "@/components/ui/popover";
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
          <span className="panel-note tabular-nums">
            confidence {Math.round(verdict.confidence * 100)}%
          </span>
        )}
      </div>
      {verdict.detail && <p className="panel-note">{verdict.detail}</p>}
      {verdict.checked_at && (
        <p className="panel-note panel-note--xs">
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

      <div className="scorecard-form__actions">
        <Button size="sm" onClick={submit} loading={busy}>
          Save Scorecard
        </Button>
        <Popover
          label="Candidate decision"
          align="left"
          className="menu popover--up"
          trigger={({ open, toggle, ref }) => (
            <button ref={ref} type="button" className="button button--secondary button--sm" aria-expanded={open} onClick={toggle} disabled={busy}>
              Decide…
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                className="menu__item"
                disabled={busy}
                onClick={() => { close(); void submitDecision("Selected", "Congratulations! We would like to extend an offer."); }}
              >
                <span><LuAward size={13} aria-hidden="true" /> Extend Offer</span>
                <small>Sends the branded offer email</small>
              </button>
              <button
                type="button"
                className="menu__item"
                disabled={busy}
                onClick={() => { close(); void submitDecision("Online Interview 2", "We would like to invite you to a second round online interview."); }}
              >
                <span><LuMail size={13} aria-hidden="true" /> Invite Round 2</span>
                <small>Second-round online interview invitation</small>
              </button>
              <button
                type="button"
                className="menu__item"
                disabled={busy}
                onClick={() => { close(); void submitDecision("Onsite Interview", "We would like to invite you to an onsite interview."); }}
              >
                <span><LuMail size={13} aria-hidden="true" /> Invite Onsite</span>
                <small>Onsite interview invitation</small>
              </button>
            </>
          )}
        </Popover>
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
      className="drawer--wide"
      title={
        <span className="app-head">
          {!blindMode && application?.candidate_avatar_url && (
            <AuthedImage
              path={application.candidate_avatar_url}
              alt={`${application.candidate_name} profile photo`}
              size={36}
            />
          )}
          {blindMode && <span className="avatar app-head__avatar" aria-hidden="true">#</span>}
          <span className="app-head__text">
            <span>{candidateDisplayName}</span>
            <small>{application?.job_title}</small>
          </span>
        </span>
      }
      subtitle={
        <span className="app-head__meta">
          {application && <Pill tone="brand">{application.stage_label}</Pill>}
          {application && (
            <ScoreBadge
              score={application.job_match_score ?? application.profile_interview_score}
              label="Match"
            />
          )}
          {blindMode && <Pill tone="neutral">Blind Review Active</Pill>}
        </span>
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

          <div className="app-body">
            {activeTab === "overview" && (
              <div className="app-stack">
                {application.job_match_reasons && (
                  <section aria-labelledby="drawer-match-reasoning">
                    <h3 id="drawer-match-reasoning">
                      AI Match Reasoning
                    </h3>
                    <p className="panel-note note-box">
                      {application.job_match_reasons}
                    </p>
                  </section>
                )}

                {application.ai_improvement_feedback && (
                  <section aria-labelledby="drawer-ai-feedback">
                    <h3 id="drawer-ai-feedback" className="app-body__ai">
                      <LuSparkles size={14} aria-hidden="true" /> AI Improvement Feedback &amp; Advice
                    </h3>
                    <div className="panel-note note-box note-box--brand">
                      {application.ai_improvement_feedback}
                    </div>
                  </section>
                )}

                <section aria-labelledby="drawer-profile">
                  <h3 id="drawer-profile">
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
              <div className="app-stack">
                <section aria-labelledby="drawer-interview">
                  <h3 id="drawer-interview">
                    Job Interview Status
                  </h3>
                  {!application.applied_interview ? (
                    <div className="note-box app-stack">
                      <p className="panel-note">
                        Not invited yet. Inviting sends the locked question pool for this requisition to the candidate.
                      </p>
                      {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
                      <Button size="sm" onClick={invite} loading={inviteBusy} iconLeft={<LuSend size={13} />}>
                        Invite to Job Interview
                      </Button>
                    </div>
                  ) : (
                    <div className="app-stack">
                      <div className="app-row">
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
                                      <span className="evidence-time tabular-nums">
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
              <div className="app-stack">
                {application.scorecards.length > 0 && (
                  <section aria-labelledby="existing-scorecards">
                    <div className="app-row app-row--between">
                      <h3 id="existing-scorecards">
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
                      <div className="note-box">
                        <strong className="note-box__title">
                          Reviewer Panel Calibration Analysis
                        </strong>
                        <p className="panel-note">
                          {new Set(application.scorecards.map((s) => s.recommendation)).size === 1
                            ? "All panel reviewers agree on the candidate recommendation. Score distribution is well-aligned."
                            : "Panel divergence detected: Multiple reviewers submitted conflicting recommendations. Review panel discussion is recommended before issuing an offer or rejection."}
                        </p>
                      </div>
                    )}

                    <ul className="scorecard-list">
                      {application.scorecards.map((card) => (
                        <li key={card.id}>
                          <div className="app-row app-row--between">
                            <strong>{card.reviewer_name}</strong>
                            <Pill tone={card.recommendation === "advance" || card.recommendation === "hire" ? "approval" : "neutral"}>
                              {card.recommendation}
                            </Pill>
                          </div>
                          {card.scores && Object.keys(card.scores).length > 0 && (
                            <div className="app-row app-row--wrap">
                              {Object.entries(card.scores).map(([dim, val]) => (
                                <span key={dim} className="panel-note panel-note--xs">
                                  {dim}: <strong>{val}/100</strong>
                                </span>
                              ))}
                            </div>
                          )}
                          {card.note && <p className="scorecard-list__note">{card.note}</p>}
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
                <h3 id="drawer-history">
                  Immutable Transition Audit Log
                </h3>
                <ul className="history-list">
                  {(application.history || application.transitions || []).map((entry: { id: string; action?: string; detail?: string; from_stage?: string; to_stage?: string; reason_code?: string; note?: string; timestamp?: string; occurred_at?: string; actor_id?: string; actor_name?: string }) => (
                    <li key={entry.id}>
                      <strong>{entry.action ?? `${entry.from_stage} → ${entry.to_stage}`}</strong>
                      <p>{entry.detail ?? entry.note ?? entry.reason_code}</p>
                      <span className="tabular-nums">
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
