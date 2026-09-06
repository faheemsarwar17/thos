"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Evaluation, InterviewAttempt } from "@/lib/types";

export function InterviewSession({
  title,
  intro,
  attempt,
  saveResponses,
  submitAttempt,
  doneHref,
  doneLabel,
}: {
  title: string;
  intro: string;
  attempt: InterviewAttempt;
  saveResponses: (responses: Record<string, string>) => Promise<void>;
  submitAttempt: () => Promise<Evaluation | null>;
  doneHref: string;
  doneLabel: string;
}) {
  const [responses, setResponses] = useState<Record<string, string>>(attempt.responses);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(attempt.evaluation ?? null);
  const [submitted, setSubmitted] = useState(
    attempt.status !== "in_progress" && attempt.status !== "invited",
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(responses);
  latest.current = responses;

  const flushSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await saveResponses(latest.current);
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  }, [saveResponses]);

  function onChange(questionId: string, value: string) {
    setResponses((previous) => ({ ...previous, [questionId]: value }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushSave(), 1200);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function submit() {
    if (timer.current) clearTimeout(timer.current);
    setSubmitting(true);
    setSubmitError(null);
    try {
      await saveResponses(latest.current);
      const result = await submitAttempt();
      setEvaluation(result);
      setSubmitted(true);
    } catch (cause) {
      setSubmitError(
        cause instanceof ApiError ? cause.message : "Submission failed. Your answers are saved — retry.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const answered = attempt.questions.filter((q) => (responses[q.id] ?? "").trim().length > 0).length;

  if (submitted) {
    return (
      <div className="candidate-main">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Submitted</p>
            <h1>{title} submitted</h1>
            <p>Your responses are locked and cannot be edited.</p>
          </div>
        </div>
        {evaluation && (
          <section className="panel" aria-labelledby="result-heading">
            <div className="panel__header">
              <div><p className="eyebrow">Versioned result</p><h2 id="result-heading">Your evaluation</h2></div>
              <ScoreBadge score={evaluation.overall_score} />
            </div>
            <div className="panel-body">
              <p className="panel-note">
                Evaluated by {evaluation.evaluator_version} against pack {evaluation.pack_id}{" "}
                {evaluation.pack_version}. Scores inform — a human always makes hiring decisions.
              </p>
              <ul className="dimension-list">
                {evaluation.dimension_scores.map((dimension) => (
                  <li key={dimension.dimension_id}>
                    <span>{dimension.label}</span>
                    <strong>{dimension.score}</strong>
                  </li>
                ))}
              </ul>
              {evaluation.strengths.length > 0 && (
                <p><strong>Strengths:</strong> {evaluation.strengths.join(", ")}</p>
              )}
              {evaluation.gaps.length > 0 && (
                <p><strong>Growth areas:</strong> {evaluation.gaps.join(", ")}</p>
              )}
            </div>
          </section>
        )}
        <Link className="button button--primary" href={doneHref}>{doneLabel}</Link>
      </div>
    );
  }

  return (
    <div className="candidate-main">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Scenario interview</p>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>
        <div className="page-heading__meta">
          <span aria-live="polite" className="autosave-status">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && "All changes saved"}
            {saveState === "failed" && "Autosave failed — answers kept locally, retry below"}
          </span>
          <Pill tone="brand">{answered} of {attempt.questions.length} answered</Pill>
        </div>
      </div>

      <ol className="interview-questions">
        {attempt.questions.map((question, index) => (
          <li key={question.id} className="panel">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Question {index + 1} · {question.competency}</p>
                <h2>{question.prompt}</h2>
              </div>
            </div>
            <div className="panel-body">
              <label>
                <span className="sr-only">Your answer to question {index + 1}</span>
                <textarea
                  rows={6}
                  value={responses[question.id] ?? ""}
                  onChange={(event) => onChange(question.id, event.target.value)}
                  placeholder="Describe your approach in your own words. Specific steps and reasoning score better than generalities."
                />
              </label>
            </div>
          </li>
        ))}
      </ol>

      {submitError && <p className="form-error" role="alert">{submitError}</p>}
      <div className="form-actions">
        <Button variant="secondary" onClick={() => void flushSave()} disabled={submitting}>
          Save draft
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Submitting…" : "Submit interview"}
        </Button>
      </div>
      <p className="panel-note">
        Submitting is final. Your answers autosave as you type, so a lost connection never
        loses accepted responses.
      </p>
    </div>
  );
}

export function ProfileInterviewLoader() {
  const packs = useApi<{ packs: { pack_id: string; display_name: string; domain: string }[] }>(
    "/api/v1/packs/catalog",
  );
  const [packId, setPackId] = useState("");
  const [attempt, setAttempt] = useState<InterviewAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!packId && packs.data?.packs[0]) {
      setPackId(packs.data.packs[0].pack_id);
    }
  }, [packs.data, packId]);

  const start = useCallback(async () => {
    if (!packId) {
      setError("Choose a domain pack for this Profile Interview.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const body = await api.post<{ attempt: InterviewAttempt }>(
        "/api/v1/candidates/me/profile-interview-attempts",
        { pack_id: packId },
      );
      setAttempt(body.attempt);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The interview could not start.");
    } finally {
      setStarting(false);
    }
  }, [packId]);

  if (attempt) {
    const packLabel =
      packs.data?.packs.find((pack) => pack.pack_id === packId)?.display_name ?? "selected domain pack";
    return (
      <InterviewSession
        title="Profile Interview"
        intro={`Scenario questions from the ${packLabel}. Take your time — answers autosave.`}
        attempt={attempt}
        saveResponses={async (responses) => {
          await api.patch(`/api/v1/profile-interview-attempts/${attempt.id}/responses`, { responses });
        }}
        submitAttempt={async () => {
          const body = await api.post<{ evaluation: Evaluation }>(
            `/api/v1/profile-interview-attempts/${attempt.id}/submit`,
            { idempotency_key: idempotencyKey() },
          );
          return body.evaluation;
        }}
        doneHref="/candidate"
        doneLabel="Back to your Skill Profile"
      />
    );
  }

  return (
    <div className="candidate-main">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Skill profile</p>
          <h1>Profile Interview</h1>
          <p>Pick a domain pack to focus the interview. THOS is general — packs specialize the questions.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-body form-grid">
          <label className="form-grid__full">
            Domain pack
            <select
              value={packId}
              onChange={(event) => setPackId(event.target.value)}
              disabled={packs.loading || starting}
            >
              {(packs.data?.packs ?? []).map((pack) => (
                <option key={pack.pack_id} value={pack.pack_id}>
                  {pack.display_name}{pack.domain ? ` · ${pack.domain}` : ""}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="form-actions form-grid__full">
            <Button onClick={() => void start()} disabled={starting || !packId}>
              {starting ? "Starting…" : "Start interview"}
            </Button>
            <Link className="button button--secondary" href="/candidate">Back</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function AppliedInterviewLoader({ attemptId }: { attemptId: string }) {
  const [attempt, setAttempt] = useState<InterviewAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const body = await api.get<{ attempt: InterviewAttempt }>(
        `/api/v1/candidates/me/applied-interviews/${attemptId}`,
      );
      setAttempt(body.attempt);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The interview could not be loaded.");
    }
  }, [attemptId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main id="main-content" className="candidate-main">
        <ErrorState message={error} onRetry={load} />
        <Link className="button button--secondary" href="/candidate/applications">Back to applications</Link>
      </main>
    );
  }
  if (!attempt) {
    return <main id="main-content" className="candidate-main"><LoadingState label="Loading your interview…" /></main>;
  }

  return (
    <InterviewSession
      title="Applied Interview"
      intro="This interview is specific to the job you applied for. You have one attempt; submitting is final."
      attempt={attempt}
      saveResponses={async (responses) => {
        await api.patch(`/api/v1/candidates/me/applied-interviews/${attempt.id}/responses`, { responses });
      }}
      submitAttempt={async () => {
        await api.post(`/api/v1/candidates/me/applied-interviews/${attempt.id}/submit`, {
          idempotency_key: idempotencyKey(),
        });
        return null;
      }}
      doneHref="/candidate/applications"
      doneLabel="Back to your applications"
    />
  );
}
