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
  LuGitFork,
  LuCircleCheck,
  LuMapPin,
  LuLaptop,
  LuCalendar,
  LuCopy,
  LuCheck,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PackChip } from "@/components/ui/pack-chip";
import { PageHeader } from "@/components/ui/page-header";
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
        <h2 id="pool-heading">Interview Question Pool</h2>
        <div className="panel__actions">
          <Pill tone={locked ? "verified" : "attention"}>
            {locked ? (
              <>
                <LuLock size={12} aria-hidden="true" /> Locked & Ready
              </>
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
          <div className="note-box app-stack">
            <p className="panel-note">
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
          <ol className="pool-list">
            {questions.map((question, index) => (
              <li key={question.id} className="pool-row">
                <span className="pool-row__index">{index + 1}.</span>
                <div className="pool-row__body">
                  <p>{question.prompt}</p>
                  <Pill tone="brand">{question.competency}</Pill>
                </div>
                {!locked && (
                  <div className="pool-row__controls">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move question ${index + 1} up`}
                      disabled={index === 0 || busy}
                      onClick={() => moveQuestion(index, -1)}
                      title="Move up"
                    >
                      <LuArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Move question ${index + 1} down`}
                      disabled={index === questions.length - 1 || busy}
                      onClick={() => moveQuestion(index, 1)}
                      title="Move down"
                    >
                      <LuArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      aria-label={`Remove question ${index + 1}`}
                      disabled={busy}
                      onClick={() => removeQuestion(index)}
                      title="Remove question"
                    >
                      <LuTrash2 size={13} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        {pool && !locked && (
          <div className="form-actions panel-gap">
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
          <p className="panel-note panel-note--warn">
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
          <div className="modal-actions">
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
        <h2 id="sandbox-heading">Proctored Sandbox</h2>
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
              <dd className="capitalize">{config.difficulty}</dd>
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
          <div className="form-grid form-grid--3">
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
          <div className="form-actions panel-gap">
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
      {loading ? (
        <LoadingState label="Loading requisition details…" />
      ) : error || !posting ? (
        <ErrorState message={error?.message ?? "Job could not be found."} onRetry={reload} />
      ) : (
        <>
          <PageHeader
            title={posting.title}
            meta={
              <span className="meta-line">
                <span><LuMapPin size={13} aria-hidden="true" /> {posting.location || "Location not set"}</span>
                <span aria-hidden="true">·</span>
                <span className="capitalize"><LuLaptop size={13} aria-hidden="true" /> {posting.work_mode || "Hybrid"}</span>
                <span aria-hidden="true">·</span>
                <Pill tone={STATUS_TONE[posting.status] ?? "neutral"}>{posting.status}</Pill>
              </span>
            }
            actions={
              <>
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
              </>
            }
          />

          {publishError && <p className="form-error" role="alert">{publishError}</p>}

          <div className="detail-grid">
            <div className="detail-grid__main">
              <QuestionPoolPanel posting={posting} onChanged={reload} />
              <SandboxPanel posting={posting} onChanged={reload} />
              {posting.description && (
                <section className="panel" aria-labelledby="side-desc-heading">
                  <div className="panel__header">
                    <h2 id="side-desc-heading">Job Description</h2>
                  </div>
                  <div className="panel-body">
                    <div className="jd">
                      {renderJobDescription(posting.description)}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <div className="detail-grid__aside">
              <section className="panel" aria-labelledby="side-meta-heading">
                <div className="panel__header">
                  <h2 id="side-meta-heading">Job Metadata</h2>
                </div>
                <dl className="meta-list">
                  <div>
                    <dt>Requisition ID</dt>
                    <dd>
                      <span className="meta-code">
                        <span className="mono">{posting.id}</span>
                        <button
                          type="button"
                          className="icon-button icon-button--xs"
                          title="Copy Requisition ID"
                          aria-label="Copy Requisition ID"
                          onClick={() => {
                            navigator.clipboard.writeText(posting.id);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? <LuCheck size={12} className="text-green" /> : <LuCopy size={12} />}
                        </button>
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Domain Pack</dt>
                    <dd>
                      {posting.pack_id ? <PackChip name={posting.pack_id} /> : <span className="muted">None assigned</span>}
                    </dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{posting.location || "Location not set"}</dd>
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
                        <span className="capitalize">{posting.work_mode || "Hybrid"}</span>
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
                      <Link href={`/pipeline?posting=${posting.id}`} className="link">
                        {posting.application_count ?? 0} candidate
                        {(posting.application_count ?? 0) === 1 ? "" : "s"}
                      </Link>
                    </dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>
                      <LuCalendar size={13} aria-hidden="true" />{" "}
                      {new Date(posting.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </dd>
                  </div>
                </dl>
              </section>
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
        <div key={pIdx}>
          <h3>{firstLine.replace(/^###\s+/, "")}</h3>
          {lines.slice(1).map((subLine, sIdx) => (
            <p key={sIdx}>{renderInlineMarkdown(subLine)}</p>
          ))}
        </div>
      );
    }

    if (firstLine.startsWith("## ")) {
      return (
        <div key={pIdx}>
          <h2>{firstLine.replace(/^##\s+/, "")}</h2>
          {lines.slice(1).map((subLine, sIdx) => (
            <p key={sIdx}>{renderInlineMarkdown(subLine)}</p>
          ))}
        </div>
      );
    }

    if (lines.every((l) => l.startsWith("- ") || l.startsWith("* "))) {
      return (
        <ul key={pIdx}>
          {lines.map((l, lIdx) => (
            <li key={lIdx}>
              {renderInlineMarkdown(l.replace(/^[-*]\s+/, ""))}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <div key={pIdx}>
        {lines.map((line, lIdx) => {
          if (line.startsWith("## ")) {
            return <h2 key={lIdx}>{line.replace(/^##\s+/, "")}</h2>;
          }
          if (line.startsWith("### ")) {
            return <h3 key={lIdx}>{line.replace(/^###\s+/, "")}</h3>;
          }
          if (line.startsWith("- ") || line.startsWith("* ")) {
            return (
              <li key={lIdx} className="jd__li">
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
