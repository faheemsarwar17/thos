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
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
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
    <article className="panel job-card" style={{ marginBottom: "16px" }}>
      <div className="panel__header">
        <div>
          <p className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <LuBuilding2 size={12} />
            <span>{job.organization_name}</span>
          </p>
          <h2>{job.title}</h2>
          <p className="panel-note" style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
            <LuMapPin size={13} style={{ color: "var(--ink-400)" }} />
            <span>{job.location || "Location flexible"} · {job.employment_type.replace(/_/g, " ")}</span>
          </p>
        </div>
        <div className="panel__actions">
          {job.requires_applied_interview && (
            <Pill tone="brand">
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <LuSparkles size={11} /> Screening Required
              </span>
            </Pill>
          )}
          {job.already_applied ? (
            <Pill tone="verified">
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <LuCircleCheck size={12} /> Applied
              </span>
            </Pill>
          ) : (
            <Button
              size="sm"
              onClick={apply}
              loading={busy}
              iconLeft={<LuSend size={13} />}
            >
              Apply Now
            </Button>
          )}
        </div>
      </div>
      <div className="panel-body">
        <p style={{ color: "var(--ink-800)", fontSize: "13px" }}>
          {expanded
            ? job.description
            : `${job.description.slice(0, 240)}${job.description.length > 240 ? "…" : ""}`}
        </p>
        {job.description.length > 240 && (
          <button
            type="button"
            className="table-action"
            style={{ border: 0, background: "none", cursor: "pointer", padding: 0, marginTop: "6px" }}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Show less" : "Read full description →"}
          </button>
        )}

        <div style={{ marginTop: "14px", padding: "10px 14px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
          <p className="panel-note" style={{ fontSize: "12px" }}>
            <strong>Process:</strong> {job.candidate_process.join(" → ")}. Applying automatically attaches
            your verified Profile Screening score with {job.organization_name}.
          </p>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </article>
  );
}

export function CandidateJobsPage() {
  const { data, error, loading, reload } = useApi<{ jobs: Job[] }>("/api/v1/jobs");

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Candidate Portal", href: "/candidate" }, { label: "Find Jobs" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Career opportunities</p>
          <h1>Explore Job Opportunities</h1>
          <p>Verified requisitions across verified organizations on THOS. 1-click apply with your verified Skill Profile.</p>
        </div>
      </div>

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
