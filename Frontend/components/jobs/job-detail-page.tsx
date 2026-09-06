"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LuArrowUp,
  LuArrowDown,
  LuTrash2,
  LuLock,
  LuSparkles,
  LuSave,
  LuShieldCheck,
  LuGitFork,
  LuCircleCheck,
  LuMapPin,
  LuLaptop,
  LuCalendar,
  LuCopy,
  LuCheck,
} from "react-icons/lu";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PackChip } from "@/components/ui/pack-chip";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Posting, Question } from "@/lib/types";

const STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  published: "brand",
  closed: "danger",
};

function QuestionPoolPanel({
  posting,
  onChanged,
}: {
  posting: Posting;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<Question[] | null>(null);
  const [showLockModal, setShowLockModal] = useState(false);

  const pool = posting.question_pool;
  const questions = draftQuestions ?? pool?.questions ?? [];
  const locked = posting.pool_status === "locked";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDraftQuestions(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The action failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const next = [...questions];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraftQuestions(next);
  }

  function removeQuestion(index: number) {
    if (questions.length <= 1) {
      setError("A question pool requires at least one question.");
      return;
    }
    setDraftQuestions(questions.filter((_, i) => i !== index));
  }

  return (
    <section className="panel" aria-labelledby="pool-heading">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Applied Interview</p>
          <h2 id="pool-heading">Interview Question Pool</h2>
        </div>
        <div className="panel__actions">
          <Pill tone={locked ? "verified" : "attention"}>
            {locked ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <LuLock size={12} /> Locked & Ready
              </span>
            ) : (
              "Draft Pool"
            )}
            {pool ? ` · v${pool.version}` : ""}
          </Pill>
        </div>
      </div>

      <div className="panel-body">
        {error && <p className="form-error" role="alert">{error}</p>}
        {!pool && (
          <div style={{ padding: "12px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
            <p className="panel-note" style={{ marginBottom: "12px" }}>
              Generate an interview question pool from the assigned domain pack. You can edit, reorder,
              and curate questions before locking. Once locked, all applicants receive the same standardized pool.
            </p>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              loading={busy}
              iconLeft={<LuSparkles size={14} />}
              onClick={() => run(() => api.post(`/api/v1/postings/${posting.id}/question-pool/generate`))}
            >
              Generate AI Question Pool
            </Button>
          </div>
        )}

        {pool && (
          <ol className="question-list">
            {questions.map((question, index) => (
              <li key={question.id}>
                <div style={{ flex: 1 }}>
                  <p className="question-list__prompt">
                    <strong style={{ marginRight: "6px", color: "var(--ink-500)" }}>{index + 1}.</strong>
                    {question.prompt}
                  </p>
                  <Pill tone="brand">{question.competency}</Pill>
                </div>
                {!locked && (
                  <div className="question-list__controls">
                    <button
                      type="button"
                      aria-label={`Move question ${index + 1} up`}
                      disabled={index === 0 || busy}
                      onClick={() => moveQuestion(index, -1)}
                      title="Move up"
                    >
                      <LuArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Move question ${index + 1} down`}
                      disabled={index === questions.length - 1 || busy}
                      onClick={() => moveQuestion(index, 1)}
                      title="Move down"
                    >
                      <LuArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove question ${index + 1}`}
                      disabled={busy}
                      onClick={() => removeQuestion(index)}
                      title="Remove question"
                    >
                      <LuTrash2 size={13} style={{ color: "var(--red-600)" }} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {pool && !locked && (
          <div className="form-actions" style={{ marginTop: "16px" }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              iconLeft={<LuSparkles size={13} />}
              onClick={() => run(() => api.post(`/api/v1/postings/${posting.id}/question-pool/generate`))}
            >
              Regenerate
            </Button>

            {draftQuestions && (
              <Button
                variant="primary"
                size="sm"
                disabled={busy}
                loading={busy}
                iconLeft={<LuSave size={13} />}
                onClick={() =>
                  run(() =>
                    api.patch(`/api/v1/postings/${posting.id}/question-pool`, {
                      questions: draftQuestions,
                    })
                  )
                }
              >
                Save Curation
              </Button>
            )}

            <Button
              variant="primary"
              size="sm"
              disabled={busy || draftQuestions !== null}
              iconLeft={<LuLock size={13} />}
              onClick={() => setShowLockModal(true)}
            >
              Lock & Finalize Pool
            </Button>

            {draftQuestions !== null && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setDraftQuestions(null)}
              >
                Discard changes
              </Button>
            )}
          </div>
        )}

        {pool && !locked && draftQuestions !== null && (
          <p className="panel-note" style={{ marginTop: "8px", color: "var(--amber-700)" }}>
            Save your curated question order before locking the pool.
          </p>
        )}
      </div>

      {/* Confirmation Modal for Locking Question Pool */}
      {showLockModal && (
        <Modal
          open={true}
          onClose={() => setShowLockModal(false)}
          title="Lock Question Pool?"
          description="Locking freezes the question set for this requisition so that every candidate receives identical interview evaluation. Once locked, editing requires creating a new version."
        >
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px" }}>
            <Button variant="secondary" onClick={() => setShowLockModal(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowLockModal(false);
                void run(() => api.post(`/api/v1/postings/${posting.id}/question-pool/lock`));
              }}
              loading={busy}
              iconLeft={<LuLock size={13} />}
            >
              Confirm & Lock Pool
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function SandboxPanel({ posting, onChanged }: { posting: Posting; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    type: "coding" | "written";
    difficulty: "easy" | "medium" | "hard";
    time_limit_minutes: number;
  } | null>(null);

  const editable = posting.status === "draft";
  const config = posting.sandbox;

  async function update(fields: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/v1/postings/${posting.id}`, fields);
      setDraft(null);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The sandbox settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="sandbox-heading">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Practical Assessment</p>
          <h2 id="sandbox-heading">Proctored Sandbox</h2>
        </div>
        <div className="panel__actions">
          <Pill tone={posting.sandbox_required ? "brand" : "neutral"}>
            {posting.sandbox_required ? "Required" : "Optional / Disabled"}
          </Pill>
        </div>
      </div>

      <div className="panel-body">
        {error && <p className="form-error" role="alert">{error}</p>}
        {posting.sandbox_required && config && !draft ? (
          <dl className="meta-list">
            <div>
              <dt>Format</dt>
              <dd>{config.type === "coding" ? "Coding problem (syntax-highlighted IDE)" : "Written essay / Q&A"}</dd>
            </div>
            <div>
              <dt>Difficulty</dt>
              <dd style={{ textTransform: "capitalize" }}>{config.difficulty}</dd>
            </div>
            <div>
              <dt>Time Limit</dt>
              <dd>{config.time_limit_minutes} minutes</dd>
            </div>
          </dl>
        ) : !posting.sandbox_required && !draft ? (
          <p className="panel-note">
            When enabled, candidates complete a recorded sandbox assessment after the voice screening.
          </p>
        ) : null}

        {draft && (
          <div className="form-grid">
            <label className="form-field">
              <span className="form-field__label">Format</span>
              <select
                className="select"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as "coding" | "written" })}
              >
                <option value="coding">Coding problem</option>
                <option value="written">Written essay</option>
              </select>
            </label>

            <label className="form-field">
              <span className="form-field__label">Difficulty</span>
              <select
                className="select"
                value={draft.difficulty}
                onChange={(e) =>
                  setDraft({ ...draft, difficulty: e.target.value as "easy" | "medium" | "hard" })
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>

            <label className="form-field">
              <span className="form-field__label">Time limit (minutes)</span>
              <input
                type="number"
                className="input"
                min={5}
                max={120}
                value={draft.time_limit_minutes}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    time_limit_minutes: Math.max(5, Math.min(120, Number(e.target.value) || 30)),
                  })
                }
              />
            </label>
          </div>
        )}

        {editable && (
          <div className="form-actions" style={{ marginTop: "14px" }}>
            {!draft ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  setDraft({
                    type: config?.type ?? "coding",
                    difficulty: config?.difficulty ?? "medium",
                    time_limit_minutes: config?.time_limit_minutes ?? 30,
                  })
                }
              >
                {posting.sandbox_required ? "Configure Sandbox" : "Enable Sandbox"}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  disabled={busy}
                  loading={busy}
                  onClick={() => update({ sandbox_required: true, sandbox: draft })}
                >
                  Save Settings
                </Button>
                {posting.sandbox_required && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onClick={() => update({ sandbox_required: false, sandbox: null })}
                  >
                    Disable Sandbox
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function JobDetailPage({ postingId }: { postingId: string }) {
  const { data, error, loading, reload } = useApi<{ posting: Posting }>(
    `/api/v1/postings/${postingId}`
  );
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    try {
      await api.post(`/api/v1/postings/${postingId}/publish`);
      await reload();
    } catch (cause) {
      setPublishError(cause instanceof ApiError ? cause.message : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  }

  async function closePosting() {
    if (!confirm("Are you sure you want to close this job? New applications will be disabled.")) return;
    setPublishing(true);
    try {
      await api.post(`/api/v1/postings/${postingId}/close`);
      await reload();
    } catch (cause) {
      setPublishError(cause instanceof ApiError ? cause.message : "Closing failed.");
    } finally {
      setPublishing(false);
    }
  }

  const posting = data?.posting;

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs
          items={[
            { label: "Employer Workspace", href: "/" },
            { label: "Job Requisitions", href: "/jobs" },
            { label: posting?.title ?? "Requisition Detail" },
          ]}
        />
      </div>

      {loading ? (
        <LoadingState label="Loading requisition details…" />
      ) : error || !posting ? (
        <ErrorState message={error?.message ?? "Job could not be found."} onRetry={reload} />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">Job Requisition</p>
              <h1>{posting.title}</h1>
              <p style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <LuMapPin size={13} style={{ color: "var(--brand-600)" }} />
                  {posting.location || "Location not set"}
                </span>
                <span style={{ color: "var(--border-strong)" }}>•</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <LuLaptop size={13} style={{ color: "var(--ink-500)" }} />
                  <strong style={{ textTransform: "capitalize", color: "var(--brand-700)" }}>
                    {posting.work_mode || "Hybrid"}
                  </strong>
                </span>
                <span style={{ color: "var(--border-strong)" }}>•</span>
                <Pill tone={STATUS_TONE[posting.status] ?? "neutral"}>{posting.status}</Pill>
              </p>
            </div>

            <div className="panel__actions">
              <Link className="button button--secondary button--sm" href={`/pipeline?posting=${posting.id}`}>
                <LuGitFork size={14} aria-hidden="true" />
                <span>Open Pipeline ({posting.application_count ?? 0})</span>
              </Link>

              {posting.status === "draft" && (
                <Button
                  size="sm"
                  onClick={publish}
                  loading={publishing}
                  disabled={posting.pool_status !== "locked"}
                  title={
                    posting.pool_status !== "locked"
                      ? "Lock the question pool before publishing this requisition"
                      : "Publish job requisition"
                  }
                  iconLeft={<LuCircleCheck size={14} />}
                >
                  Publish Requisition
                </Button>
              )}

              {posting.status === "published" && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={closePosting}
                  loading={publishing}
                >
                  Close Requisition
                </Button>
              )}
            </div>
          </div>

          {publishError && <p className="form-error" role="alert">{publishError}</p>}

          <div className="detail-grid">
            <div className="detail-grid__main">
              <QuestionPoolPanel posting={posting} onChanged={reload} />
              <SandboxPanel posting={posting} onChanged={reload} />
            </div>

            <div className="detail-grid__side">
              <section className="panel" aria-labelledby="side-meta-heading">
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Configuration</p>
                    <h2 id="side-meta-heading">Job Metadata</h2>
                  </div>
                </div>
                <div className="panel-body">
                  <dl className="meta-list">
                    <div>
                      <dt>Requisition ID</dt>
                      <dd>
                        <span className="meta-code">
                          <span>{posting.id}</span>
                          <button
                            type="button"
                            className="meta-code-btn"
                            title="Copy Requisition ID"
                            aria-label="Copy Requisition ID"
                            onClick={() => {
                              navigator.clipboard.writeText(posting.id);
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? (
                              <LuCheck size={11} style={{ color: "var(--green-600)" }} />
                            ) : (
                              <LuCopy size={11} />
                            )}
                          </button>
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>Domain Pack</dt>
                      <dd>
                        {posting.pack_id ? (
                          <PackChip name={posting.pack_id} />
                        ) : (
                          <span style={{ color: "var(--ink-400)" }}>None assigned</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                        <LuMapPin size={13} style={{ color: "var(--brand-600)" }} />
                        <span>{posting.location || "Location not set"}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Work Mode</dt>
                      <dd>
                        <Pill
                          tone={
                            posting.work_mode?.toLowerCase() === "remote"
                              ? "brand"
                              : posting.work_mode?.toLowerCase() === "hybrid"
                              ? "attention"
                              : "neutral"
                          }
                        >
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              textTransform: "capitalize",
                            }}
                          >
                            <LuLaptop size={11} /> {posting.work_mode || "Hybrid"}
                          </span>
                        </Pill>
                      </dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <Pill tone={STATUS_TONE[posting.status] ?? "neutral"}>
                          {posting.status}
                        </Pill>
                      </dd>
                    </div>
                    <div>
                      <dt>Applicants</dt>
                      <dd>
                        <Link
                          href={`/pipeline?posting=${posting.id}`}
                          className="table-action"
                          style={{ fontSize: "12.5px" }}
                        >
                          <LuGitFork size={12} />
                          <span>
                            {posting.application_count ?? 0} candidate
                            {(posting.application_count ?? 0) === 1 ? "" : "s"}
                          </span>
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt>Created</dt>
                      <dd style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--ink-600)" }}>
                        <LuCalendar size={13} />
                        <span>
                          {new Date(posting.created_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              {posting.description && (
                <section className="panel" aria-labelledby="side-desc-heading">
                  <div className="panel__header">
                    <div>
                      <p className="eyebrow">Context</p>
                      <h2 id="side-desc-heading">Job Description</h2>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="prose-desc">
                      {renderJobDescription(posting.description)}
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function renderJobDescription(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);

  return blocks.map((block, pIdx) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return null;

    const firstLine = lines[0];

    if (firstLine.startsWith("### ")) {
      return (
        <div key={pIdx} style={{ marginBottom: "14px" }}>
          <h3>{firstLine.replace(/^###\s+/, "")}</h3>
          {lines.slice(1).map((subLine, sIdx) => (
            <p key={sIdx}>{renderInlineMarkdown(subLine)}</p>
          ))}
        </div>
      );
    }

    if (firstLine.startsWith("## ")) {
      return (
        <div key={pIdx} style={{ marginBottom: "14px" }}>
          <h2>{firstLine.replace(/^##\s+/, "")}</h2>
          {lines.slice(1).map((subLine, sIdx) => (
            <p key={sIdx}>{renderInlineMarkdown(subLine)}</p>
          ))}
        </div>
      );
    }

    if (lines.every((l) => l.startsWith("- ") || l.startsWith("* "))) {
      return (
        <ul key={pIdx} style={{ margin: "6px 0 14px 18px", padding: 0 }}>
          {lines.map((l, lIdx) => (
            <li key={lIdx} style={{ marginBottom: "4px" }}>
              {renderInlineMarkdown(l.replace(/^[-*]\s+/, ""))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div key={pIdx} style={{ marginBottom: "12px" }}>
        {lines.map((line, lIdx) => {
          if (line.startsWith("## ")) {
            return <h2 key={lIdx}>{line.replace(/^##\s+/, "")}</h2>;
          }
          if (line.startsWith("### ")) {
            return <h3 key={lIdx}>{line.replace(/^###\s+/, "")}</h3>;
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <li key={lIdx} style={{ marginLeft: "18px", listStyle: "disc", marginBottom: "4px" }}>
                {renderInlineMarkdown(line.replace(/^[-*]\s+/, ""))}
              </li>
            );
          }
          return <p key={lIdx}>{renderInlineMarkdown(line)}</p>;
        })}
      </div>
    );
  });
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
