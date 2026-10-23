"use client";

import { useState } from "react";
import {
  LuBriefcase,
  LuBuilding2,
  LuMapPin,
  LuCircleCheck,
  LuSend,
  LuSparkles,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Job } from "@/lib/types";

function JobCard({ job, onApplied }: { job: Job; onApplied: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/applications", {
        posting_id: job.id,
        idempotency_key: idempotencyKey(),
      });
      onApplied();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The application failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="panel job-card">
      <div className="job-card__head">
        <div className="job-card__title">
          <span className="job-card__org">
            <LuBuilding2 size={12} aria-hidden="true" /> {job.organization_name}
          </span>
          <h2>{job.title}</h2>
          <span className="job-card__meta">
            <LuMapPin size={13} aria-hidden="true" /> {job.location || "Location flexible"} · {job.employment_type.replace(/_/g, " ")}
          </span>
        </div>
        <div className="job-card__actions">
          {job.requires_applied_interview && (
            <Pill tone="brand">
              <LuSparkles size={11} aria-hidden="true" /> Screening Required
            </Pill>
          )}
          {job.already_applied ? (
            <Pill tone="verified">
              <LuCircleCheck size={12} aria-hidden="true" /> Applied
            </Pill>
          ) : (
            <Button size="sm" onClick={apply} loading={busy} iconLeft={<LuSend size={13} />}>
              Apply Now
            </Button>
          )}
        </div>
      </div>
      <div className="job-card__body">
        <p>
          {expanded
            ? job.description
            : `${job.description.slice(0, 240)}${job.description.length > 240 ? "…" : ""}`}
        </p>
        {job.description.length > 240 && (
          <button type="button" className="link job-card__more" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show less" : "Read full description →"}
          </button>
        )}

        <p className="job-card__process">
          <strong>Process:</strong> {job.candidate_process.join(" → ")}. Applying automatically attaches
          your verified Profile Screening score with {job.organization_name}.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

export function CandidateJobsPage() {
  const { data, error, loading, reload } = useApi<{ jobs: Job[] }>("/api/v1/jobs");

  return (
    <div className="dashboard">
      <PageHeader title="Find jobs" meta={data ? `${data.jobs.length} open role${data.jobs.length === 1 ? "" : "s"}` : undefined} />

      {loading ? (
        <LoadingState label="Loading available job requisitions…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data && data.jobs.length === 0 ? (
        <EmptyState
          icon={<LuBriefcase size={24} />}
          title="No open jobs currently available"
          description="Check back regularly or enable discovery consent in your profile so employers can reach out directly."
        />
      ) : (
        <div className="job-list">
          {data?.jobs.map((job) => (
            <JobCard key={job.id} job={job} onApplied={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
