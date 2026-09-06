"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LuPlus, LuBriefcase, LuShieldCheck, LuX, LuSparkles, LuMapPin, LuLaptop, LuCheck } from "react-icons/lu";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Table, TableContainer, TableEmpty } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { Posting } from "@/lib/types";

const STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  published: "brand",
  closed: "danger",
};

function CreateJobForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const packs = useApi<{
    packs: { pack_id: string; display_name: string; pack_version: string; domain: string }[];
  }>("/api/v1/domain-packs");
  const active = useApi<{ activation: { pack_id: string } | null }>(
    "/api/v1/organizations/current/domain-packs/active"
  );
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [workMode, setWorkMode] = useState<"remote" | "hybrid" | "onsite">("hybrid");
  const [description, setDescription] = useState("");
  const [packId, setPackId] = useState("");
  const [sandboxRequired, setSandboxRequired] = useState(false);
  const [sandboxType, setSandboxType] = useState<"coding" | "written">("coding");
  const [sandboxDifficulty, setSandboxDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [sandboxMinutes, setSandboxMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);

  const selectedPack =
    packId || active.data?.activation?.pack_id || packs.data?.packs[0]?.pack_id || "";

  function toggleSandbox(required: boolean) {
    setSandboxRequired(required);
    if (required) {
      const hint = selectedPack.toLowerCase();
      const technical = ["software", "engineer", "dev", "tech", "cs"].some((t) =>
        hint.includes(t)
      );
      setSandboxType(technical ? "coding" : "written");
    }
  }

  async function handleGenerateAIDescription() {
    if (title.trim().length < 2) {
      setError("Please enter a Job Title first so AI has sufficient context to generate the description.");
      return;
    }
    setGeneratingAI(true);
    setError(null);
    try {
      const res = await api.post<{ description: string }>("/api/v1/postings/generate-description", {
        title: title.trim(),
        location: location.trim() || undefined,
        work_mode: workMode,
        pack_id: selectedPack || undefined,
        employment_type: "full_time",
      });
      if (res.description) {
        setDescription(res.description);
        setAiGenerated(true);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Failed to generate job description with AI.");
    } finally {
      setGeneratingAI(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3) {
      setError("Enter a job title of at least 3 characters.");
      return;
    }
    if (!selectedPack) {
      setError("Select a domain pack for this job.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = await api.post<{ posting: Posting }>("/api/v1/postings", {
        title: title.trim(),
        location: location.trim(),
        work_mode: workMode,
        description: description.trim(),
        pack_id: selectedPack,
        sandbox_required: sandboxRequired,
        sandbox: sandboxRequired
          ? {
              type: sandboxType,
              difficulty: sandboxDifficulty,
              time_limit_minutes: sandboxMinutes,
            }
          : null,
        idempotency_key: idempotencyKey(),
      });
      onCreated(body.posting.id);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The job could not be created.");
      setSaving(false);
    }
  }

  return (
    <form className="panel form-panel" onSubmit={submit} aria-label="Create new job requisition">
      <div className="panel__header">
        <div>
          <p className="eyebrow">New Requisition</p>
          <h2>Create Job Requisition</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          style={{ width: "32px", height: "32px" }}
          aria-label="Cancel job creation"
          onClick={onCancel}
        >
          <LuX size={16} />
        </button>
      </div>

      <div className="form-grid">
        <div className="form-grid__full">
          <FormField label="Job Title" required hint="Specific position title for this requisition">
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Backend Engineer"
              required
              minLength={3}
            />
          </FormField>
        </div>

        {/* Distinct Section: Location */}
        <FormField
          label="Location"
          hint="Primary office, campus, city, or geographic hub"
        >
          <div style={{ position: "relative" }}>
            <input
              className="input"
              style={{ paddingLeft: "34px" }}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. San Francisco, CA or London, UK"
            />
            <LuMapPin
              size={15}
              style={{
                position: "absolute",
                left: "11px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--ink-400)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
          </div>
        </FormField>

        {/* Distinct Section: Work Mode (Dropdown) */}
        <FormField
          label="Work Mode"
          required
          hint="Workplace flexibility arrangement"
        >
          <div style={{ position: "relative" }}>
            <select
              className="select"
              style={{ paddingLeft: "34px" }}
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value as "remote" | "hybrid" | "onsite")}
              required
            >
              <option value="remote">Remote (100% remote flexibility)</option>
              <option value="hybrid">Hybrid (Blended office &amp; remote days)</option>
              <option value="onsite">On-site (Physical office / campus)</option>
            </select>
            <LuLaptop
              size={15}
              style={{
                position: "absolute",
                left: "11px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--ink-400)",
                pointerEvents: "none",
              }}
              aria-hidden="true"
            />
          </div>
        </FormField>

        <div className="form-grid__full">
          <FormField
            label="Domain Pack (Standardized Ontology & Question Pool)"
            required
            hint="Defines the interview rubric dimensions, question pool generation, and evaluation rules."
          >
            <select
              className="select"
              value={selectedPack}
              onChange={(e) => setPackId(e.target.value)}
              required
              disabled={packs.loading}
            >
              {!selectedPack && <option value="">Select a domain pack…</option>}
              {packs.data?.packs.map((pack) => (
                <option key={pack.pack_id} value={pack.pack_id}>
                  {pack.display_name} (v{pack.pack_version})
                  {pack.domain ? ` · ${pack.domain}` : ""}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Job Description with AI Auto-Generation Button */}
        <div className="form-grid__full">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "8px" }}>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-800)" }}>
              Job Description &amp; Requirements
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleGenerateAIDescription}
              loading={generatingAI}
              disabled={generatingAI}
              style={{
                height: "30px",
                fontSize: "12px",
                padding: "0 10px",
                fontWeight: 600,
                color: "var(--brand-700)",
                borderColor: "var(--brand-300)",
                background: "var(--brand-50)",
              }}
              title="AI reads the job title, location, work mode, and domain pack to draft a complete description"
            >
              <LuSparkles size={13} style={{ marginRight: "5px", color: "var(--brand-600)" }} />
              <span>Auto-generate with AI</span>
            </Button>
          </div>

          <p style={{ fontSize: "12px", color: "var(--ink-500)", margin: "0 0 8px" }}>
            Parsed alongside the Domain Pack to generate targeted interview questions.
            {aiGenerated && (
              <span style={{ marginLeft: "10px", color: "var(--teal-700)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                <LuCheck size={13} /> Generated by AI — review and edit as needed
              </span>
            )}
          </p>

          <textarea
            className="textarea"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              if (aiGenerated) setAiGenerated(false);
            }}
            rows={7}
            placeholder="Detailed responsibilities, required qualifications, and role context… Or click 'Auto-generate with AI' above to draft automatically."
          />
        </div>

        <div className="form-grid__full" style={{ padding: "12px 16px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={sandboxRequired}
              onChange={(e) => toggleSandbox(e.target.checked)}
              style={{ width: "16px", height: "16px", accentColor: "var(--brand-600)" }}
            />
            <span>Require Proctored Practical Assessment Sandbox</span>
          </label>

          {sandboxRequired && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "14px" }}>
              <FormField label="Sandbox Type">
                <select
                  className="select"
                  value={sandboxType}
                  onChange={(e) => setSandboxType(e.target.value as "coding" | "written")}
                >
                  <option value="coding">Coding problem (IDE)</option>
                  <option value="written">Written essay / Q&amp;A</option>
                </select>
              </FormField>

              <FormField label="Difficulty">
                <select
                  className="select"
                  value={sandboxDifficulty}
                  onChange={(e) => setSandboxDifficulty(e.target.value as "easy" | "medium" | "hard")}
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </FormField>

              <FormField label="Time Limit (Minutes)">
                <input
                  type="number"
                  className="input"
                  min={5}
                  max={120}
                  value={sandboxMinutes}
                  onChange={(e) =>
                    setSandboxMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 30)))
                  }
                />
              </FormField>
            </div>
          )}
        </div>

        {error && (
          <div className="form-grid__full">
            <p className="form-error" role="alert">
              {error}
            </p>
          </div>
        )}

        <div className="form-actions form-grid__full">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" loading={saving || packs.loading}>
            Create Draft Requisition
          </Button>
        </div>
      </div>
    </form>
  );
}

export function JobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showCreate = searchParams.get("create") === "1";
  const { data, error, loading, reload } = useApi<{ postings: Posting[] }>("/api/v1/postings");

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Employer Workspace", href: "/" }, { label: "Job Requisitions" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Hiring portfolio</p>
          <h1>Job Requisitions</h1>
          <p>Create requisitions, curate AI question pools, and publish to start receiving verified candidates.</p>
        </div>
        {!showCreate && (
          <Link className="button button--primary" href="/jobs?create=1">
            <LuPlus size={15} aria-hidden="true" />
            <span>Create job</span>
          </Link>
        )}
      </div>

      {showCreate && (
        <CreateJobForm
          onCreated={(id) => router.push(`/jobs/${id}`)}
          onCancel={() => router.push("/jobs")}
        />
      )}

      {loading ? (
        <LoadingState label="Loading job requisitions…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : data && data.postings.length === 0 && !showCreate ? (
        <EmptyState
          icon={<LuBriefcase size={22} />}
          title="No job requisitions created yet"
          description="Create your first job posting to assign a Domain Pack and configure question pools."
          action={
            <Link className="button button--primary" href="/jobs?create=1">
              <LuPlus size={15} aria-hidden="true" />
              <span>Create first job</span>
            </Link>
          }
        />
      ) : (
        <section className="panel" aria-label="All job requisitions">
          <TableContainer>
            <Table>
              <caption className="sr-only">All job requisitions across your organization</caption>
              <thead>
                <tr>
                  <th scope="col">Job Requisition</th>
                  <th scope="col" style={{ width: "130px" }}>Candidates</th>
                  <th scope="col" style={{ width: "130px" }}>Status</th>
                  <th scope="col" style={{ width: "160px" }}>Question Pool</th>
                  <th scope="col">Pinned Pack</th>
                  <th scope="col" style={{ width: "130px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.postings.length === 0 && (
                  <TableEmpty colSpan={6}>No jobs match the current filter.</TableEmpty>
                )}
                {data?.postings.map((posting) => (
                  <tr key={posting.id}>
                    <th scope="row">
                      <Link className="role-link" href={`/jobs/${posting.id}`}>
                        <strong>{posting.title}</strong>
                        <span>
                          {posting.location || "Location not set"}
                          {posting.work_mode && (
                            <span style={{ marginLeft: "8px", textTransform: "capitalize", color: "var(--brand-700)", fontWeight: 600 }}>
                              · {posting.work_mode}
                            </span>
                          )}
                        </span>
                      </Link>
                    </th>
                    <td>
                      <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                        {posting.application_count ?? 0}
                      </strong>
                      <span style={{ color: "var(--ink-400)", fontSize: "11px", marginLeft: "4px" }}>
                        applicants
                      </span>
                    </td>
                    <td>
                      <Pill tone={STATUS_TONE[posting.status] ?? "neutral"}>
                        {posting.status}
                      </Pill>
                    </td>
                    <td>
                      <Pill tone={posting.pool_status === "locked" ? "verified" : "attention"}>
                        {posting.pool_status === "locked" ? "Locked & Ready" : "Draft Pool"}
                      </Pill>
                    </td>
                    <td>
                      {posting.pack_id ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <LuShieldCheck size={14} style={{ color: "var(--teal-600)" }} />
                          <span>{posting.pack_id}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link className="table-action" href={`/jobs/${posting.id}`}>
                        <span>Manage</span>
                        <span aria-hidden="true"> →</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        </section>
      )}
    </div>
  );
}
