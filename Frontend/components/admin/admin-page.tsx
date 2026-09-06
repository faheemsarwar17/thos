"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  LuBuilding2,
  LuUsers,
  LuShieldCheck,
  LuGitFork,
  LuMail,
  LuHistory,
} from "react-icons/lu";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { AuditRecord, WorkflowStage } from "@/lib/types";

type Organization = {
  organization: { id: string; name: string; org_type: string; verification_status: string };
  role: string;
  units: { id: string; name: string; parent_unit_id: string | null }[];
};

type Member = {
  id: string;
  role: string;
  status: string;
  display_name: string;
  email: string;
  identity: string;
};

type Workflow = {
  id: string;
  template_name: string;
  version: number;
  status: string;
  stages: WorkflowStage[];
  candidate_status_mapping: Record<string, string>;
  published_at: string | null;
};

type Pack = {
  pack_id: string;
  pack_version: string;
  display_name: string;
  domain: string;
  skills: string[];
  source?: "builtin" | "custom";
  linked_jobs?: number;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function UnitsPanel({ org, onChanged }: { org: Organization; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a unit name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/organizations/current/units", {
        name: name.trim(),
        parent_unit_id: parent || null,
      });
      setName("");
      setParent("");
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The unit could not be created.");
    } finally {
      setBusy(false);
    }
  }

  const roots = org.units.filter((unit) => !unit.parent_unit_id);
  const childrenOf = (id: string) => org.units.filter((unit) => unit.parent_unit_id === id);

  return (
    <section className="panel" aria-labelledby="units-heading">
      <div className="panel__header">
        <div><p className="eyebrow">Structure</p><h2 id="units-heading">Departments and units</h2></div>
      </div>
      <div className="panel-body">
        {org.units.length === 0 ? (
          <p className="panel-note">No units yet. Add your first department below.</p>
        ) : (
          <ul className="unit-tree">
            {roots.map((root) => (
              <li key={root.id}>
                <strong>{root.name}</strong>
                {childrenOf(root.id).length > 0 && (
                  <ul>
                    {childrenOf(root.id).map((child) => (
                      <li key={child.id}>{child.name}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="inline-form" onSubmit={submit}>
          <label>
            Unit name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Faculty of Sciences" />
          </label>
          <label>
            Parent unit
            <select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">None (top level)</option>
              {org.units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" size="small" disabled={busy}>Add unit</Button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

function MembersPanel() {
  const { data, error, loading, reload } = useApi<{
    members: Member[];
    invitations: { id: string; email: string; role: string; status: string }[];
  }>("/api/v1/organizations/current/members");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("recruiter");
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !displayName.trim()) {
      setFormError("Enter the staff member's name and company email.");
      return;
    }
    setBusy(true);
    setFormError(null);
    setFormSuccess(null);
    try {
      await api.post("/api/v1/organizations/current/members", {
        email: email.trim(),
        display_name: displayName.trim(),
        role,
      });
      setEmail("");
      setDisplayName("");
      setFormSuccess("Staff account created. Credentials were emailed to their company address.");
      await reload();
    } catch (cause) {
      setFormError(cause instanceof ApiError ? cause.message : "The member could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="members-heading">
      <div className="panel__header">
        <div><p className="eyebrow">People</p><h2 id="members-heading">Members and roles</h2></div>
      </div>
      <div className="panel-body">
        {loading ? (
          <LoadingState label="Loading members…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <ul className="member-list">
            {data?.members.map((member) => (
              <li key={member.id}>
                <div className="member-list__info">
                  <strong>{member.display_name}</strong>
                  <span>{member.email}</span>
                </div>
                <Pill tone={member.role === "administrator" ? "approval" : "brand"}>
                  {member.role.replace(/_/g, " ")}
                </Pill>
              </li>
            ))}
          </ul>
        )}
        <form className="inline-form" onSubmit={submit}>
          <label>
            Full name
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Sara Ali" />
          </label>
          <label>
            Company email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="sara.ali@company.com"
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="administrator">Administrator</option>
              <option value="hiring_manager">Hiring manager</option>
              <option value="recruiter">Recruiter</option>
              <option value="reviewer">Reviewer</option>
            </select>
          </label>
          <Button type="submit" size="small" disabled={busy}>Create staff user</Button>
        </form>
        {formError && <p className="form-error" role="alert">{formError}</p>}
        {formSuccess && <p className="form-success" role="status">{formSuccess}</p>}
        {data?.invitations && data.invitations.length > 0 && (
          <p className="panel-note">
            Recent invites: {data.invitations.slice(0, 3).map((i) => i.email).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}

function PlatformPendingPanel() {
  const { data, error, loading, reload } = useApi<{
    organizations: {
      id: string;
      name: string;
      domain: string;
      contact_email: string;
      created_at: string;
    }[];
  }>("/api/v1/admin/organizations/pending");
  const [message, setMessage] = useState<string | null>(null);

  async function verify(orgId: string) {
    setMessage(null);
    try {
      await api.post(`/api/v1/admin/organizations/${orgId}/verify`);
      setMessage("Organization verified.");
      await reload();
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : "Verification failed.");
    }
  }

  async function reject(orgId: string) {
    const reason = window.prompt("Rejection reason");
    if (!reason) return;
    setMessage(null);
    try {
      await api.post(`/api/v1/admin/organizations/${orgId}/reject`, { reason });
      setMessage("Organization rejected.");
      await reload();
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : "Rejection failed.");
    }
  }

  if (error?.status === 403) return null;

  return (
    <section className="panel" aria-labelledby="platform-pending-heading">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Platform</p>
          <h2 id="platform-pending-heading">Pending organization applications</h2>
        </div>
      </div>
      <div className="panel-body">
        {loading ? (
          <LoadingState label="Loading applications…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : data && data.organizations.length === 0 ? (
          <p className="panel-note">No pending applications.</p>
        ) : (
          <ul className="member-list">
            {data?.organizations.map((org) => (
              <li key={org.id}>
                <div className="member-list__info">
                  <strong>{org.name}</strong>
                  <span>{org.domain} · {org.contact_email}</span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  <Button size="small" onClick={() => void verify(org.id)}>Verify</Button>
                  <Button size="small" variant="secondary" onClick={() => void reject(org.id)}>
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="panel-note">{message}</p>}
      </div>
    </section>
  );
}

function PacksPanel() {
  const packs = useApi<{ packs: Pack[] }>("/api/v1/domain-packs");
  const active = useApi<{ activation: { pack_id: string; pack_version: string; display_name: string } | null }>(
    "/api/v1/organizations/current/domain-packs/active",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [packId, setPackId] = useState("");
  const [domain, setDomain] = useState("");
  const [skills, setSkills] = useState("");
  const [profilePrompt, setProfilePrompt] = useState(
    "Describe how you would handle a domain-specific challenge in this role.",
  );
  const [appliedPrompt, setAppliedPrompt] = useState(
    "Using the job context, outline a practical plan for the first 30 days.",
  );

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setDisplayName("");
    setPackId("");
    setDomain("");
    setSkills("");
    setProfilePrompt("Describe how you would handle a domain-specific challenge in this role.");
    setAppliedPrompt("Using the job context, outline a practical plan for the first 30 days.");
  }

  async function activate(packIdValue: string) {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/organizations/current/domain-packs/activations", { pack_id: packIdValue });
      await active.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(pack: Pack) {
    setBusy(true);
    setError(null);
    try {
      const body = await api.get<{
        pack: Pack & {
          manifest: {
            ontology: { skills: string[] };
            profile_interview: { questions: { prompt: string }[] };
            applied_interview: { questions: { prompt: string }[] };
          };
        };
      }>(`/api/v1/domain-packs/${pack.pack_id}`);
      const manifest = body.pack.manifest;
      setEditingId(pack.pack_id);
      setFormOpen(true);
      setDisplayName(body.pack.display_name);
      setPackId(body.pack.pack_id);
      setDomain(body.pack.domain);
      setSkills(manifest.ontology.skills.join(", "));
      setProfilePrompt(manifest.profile_interview.questions[0]?.prompt ?? "");
      setAppliedPrompt(manifest.applied_interview.questions[0]?.prompt ?? "");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not load the pack.");
    } finally {
      setBusy(false);
    }
  }

  async function savePack(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const skillList = skills.split(",").map((item) => item.trim()).filter(Boolean);
    const id = editingId || packId || slugify(displayName);
    const payload = {
      display_name: displayName,
      domain,
      skills: skillList,
      profile_questions: [
        {
          id: `${id}-pi-01`,
          prompt: profilePrompt,
          competency: "domain judgment",
          expected_concepts: skillList.slice(0, 4),
        },
      ],
      applied_questions: [
        {
          id: `${id}-ai-01`,
          prompt: appliedPrompt,
          competency: "practical planning",
          expected_concepts: skillList.slice(0, 4),
        },
      ],
    };
    try {
      if (editingId) {
        await api.patch(`/api/v1/domain-packs/${editingId}`, payload);
      } else {
        await api.post("/api/v1/domain-packs", { pack_id: id, ...payload });
      }
      resetForm();
      await packs.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save the pack.");
    } finally {
      setBusy(false);
    }
  }

  async function removePack(pack: Pack) {
    if (pack.source !== "custom") return;
    if ((pack.linked_jobs ?? 0) > 0) {
      setError(`Cannot delete "${pack.display_name}" — ${pack.linked_jobs} job(s) are linked to it.`);
      return;
    }
    if (!window.confirm(`Delete domain pack "${pack.display_name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/v1/domain-packs/${pack.pack_id}`);
      if (editingId === pack.pack_id) resetForm();
      await packs.reload();
      await active.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete the pack.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="packs-heading">
      <div className="panel__header">
        <div><p className="eyebrow">Domain intelligence</p><h2 id="packs-heading">Domain packs</h2></div>
        <div className="panel__actions">
          {active.data?.activation && (
            <Pill tone="verified">
              Default: {active.data.activation.display_name} {active.data.activation.pack_version}
            </Pill>
          )}
          <Button
            size="small"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              if (formOpen) resetForm();
              else {
                setFormOpen(true);
                setEditingId(null);
              }
            }}
          >
            {formOpen ? "Cancel" : "Create pack"}
          </Button>
        </div>
      </div>
      <div className="panel-body">
        {formOpen && (
          <form className="pack-create" onSubmit={savePack}>
            <div className="pack-create__grid">
              <label>
                Display name
                <input
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (!editingId && !packId) setPackId(slugify(e.target.value));
                  }}
                  required
                  minLength={2}
                  placeholder="Healthcare Pack"
                />
              </label>
              <label>
                Pack id
                <input
                  value={packId}
                  onChange={(e) => setPackId(slugify(e.target.value))}
                  required
                  pattern="^[a-z][a-z0-9_-]*$"
                  placeholder="healthcare"
                  disabled={Boolean(editingId)}
                />
              </label>
              <label>
                Domain
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Clinical hiring" />
              </label>
              <label>
                Skills (comma-separated)
                <input value={skills} onChange={(e) => setSkills(e.target.value)} required placeholder="patient care, triage, documentation" />
              </label>
            </div>
            <label>
              Profile interview prompt
              <textarea value={profilePrompt} onChange={(e) => setProfilePrompt(e.target.value)} rows={3} required minLength={8} />
            </label>
            <label>
              Applied interview prompt
              <textarea value={appliedPrompt} onChange={(e) => setAppliedPrompt(e.target.value)} rows={3} required minLength={8} />
            </label>
            <div className="pack-create__actions">
              <Button type="submit" size="small" disabled={busy}>
                {editingId ? "Update pack" : "Save pack"}
              </Button>
            </div>
          </form>
        )}
        {packs.loading ? (
          <LoadingState label="Loading packs…" />
        ) : packs.error ? (
          <ErrorState message={packs.error.message} onRetry={packs.reload} />
        ) : (
          <ul className="pack-list">
            {packs.data?.packs.map((pack) => (
              <li key={pack.pack_id}>
                <div>
                  <strong>{pack.display_name}</strong>
                  <span>
                    {pack.domain || "Custom domain"} · v{pack.pack_version}
                    {pack.source === "custom" ? " · custom" : " · built-in"}
                    {typeof pack.linked_jobs === "number" ? ` · ${pack.linked_jobs} job(s)` : ""}
                  </span>
                  <p className="panel-note">{pack.skills.slice(0, 6).join(" · ")}</p>
                </div>
                <div className="workflow-list__actions">
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={busy || active.data?.activation?.pack_id === pack.pack_id}
                    onClick={() => activate(pack.pack_id)}
                  >
                    {active.data?.activation?.pack_id === pack.pack_id ? "Default" : "Set default"}
                  </Button>
                  {pack.source === "custom" && (
                    <>
                      <Button size="small" variant="secondary" disabled={busy} onClick={() => void startEdit(pack)}>
                        Edit
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={busy || (pack.linked_jobs ?? 0) > 0}
                        onClick={() => void removePack(pack)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

type WorkflowComponent = {
  id: string;
  label: string;
  description: string;
  stage_id: string;
  category: string;
};

type FixedStage = {
  id: string;
  label: string;
  category: string;
  required?: boolean;
};

const FALLBACK_COMPONENTS: WorkflowComponent[] = [
  {
    id: "screening",
    label: "Screening",
    description: "Initial recruiter or hiring-manager screen of applications.",
    stage_id: "screened",
    category: "review",
  },
  {
    id: "shortlisting",
    label: "Shortlisting",
    description: "Narrow the pool before interviews or assessments.",
    stage_id: "shortlisted",
    category: "review",
  },
  {
    id: "ai_interview",
    label: "AI Interview",
    description: "Job Interview powered by the active domain pack.",
    stage_id: "applied_interview",
    category: "assessment",
  },
  {
    id: "offer",
    label: "Offer",
    description: "Human approval gate before hiring.",
    stage_id: "offer",
    category: "offer",
  },
];

const FALLBACK_FIXED: FixedStage[] = [
  { id: "received", label: "Received", category: "new", required: true },
  { id: "hired", label: "Hired", category: "hired", required: true },
  { id: "rejected", label: "Rejected", category: "rejected", required: true },
  { id: "withdrawn", label: "Withdrawn", category: "withdrawn", required: true },
];

function WorkflowsPanel() {
  const catalog = useApi<{ components: WorkflowComponent[]; fixed_stages: FixedStage[] }>(
    "/api/v1/workflows/components",
  );
  const { data, error, loading, reload } = useApi<{
    workflow: (Workflow & { components?: string[] }) | null;
  }>("/api/v1/workflows/current");
  const [enabled, setEnabled] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const components = catalog.data?.components ?? FALLBACK_COMPONENTS;
  const fixedStages = catalog.data?.fixed_stages ?? FALLBACK_FIXED;

  useEffect(() => {
    if (catalog.loading) return;
    const catalogComponents = catalog.data?.components ?? FALLBACK_COMPONENTS;
    if (data?.workflow?.components) {
      setEnabled(data.workflow.components);
    } else if (data?.workflow?.stages) {
      const stageIds = new Set(data.workflow.stages.map((stage) => stage.id));
      setEnabled(
        catalogComponents.filter((item) => stageIds.has(item.stage_id)).map((item) => item.id),
      );
    } else {
      setEnabled(catalogComponents.map((item) => item.id));
    }
    setReady(true);
  }, [data, catalog.loading, catalog.data]);

  function toggle(componentId: string) {
    setEnabled((current) =>
      current.includes(componentId)
        ? current.filter((id) => id !== componentId)
        : [...current, componentId],
    );
  }

  const previewLabels = [
    fixedStages.find((stage) => stage.id === "received")?.label ?? "Received",
    ...components.filter((item) => enabled.includes(item.id)).map((item) => item.label),
    ...fixedStages.filter((stage) => stage.id !== "received").map((stage) => stage.label),
  ];

  async function save() {
    setBusy(true);
    setActionError(null);
    try {
      await api.put("/api/v1/workflows/current", { components: enabled });
      await reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : "Could not save the workflow.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="workflows-heading">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2 id="workflows-heading">Hiring workflow</h2>
        </div>
        <div className="panel__actions">
          {data?.workflow && (
            <Pill tone="verified">Company workflow · v{data.workflow.version}</Pill>
          )}
          <Button size="small" disabled={busy || !ready} onClick={() => void save()}>
            {busy ? "Saving…" : "Save workflow"}
          </Button>
        </div>
      </div>
      <div className="panel-body">
        {loading || catalog.loading || !ready ? (
          <LoadingState label="Loading workflow…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <div className="stage-editor">
            <p className="panel-note">
              Choose from THOS workflow components. Received, Hired, Rejected, and Withdrawn are always included.
              Changes apply to new jobs only.
            </p>

            <div className="workflow-fixed">
              <p className="search-panel__label">Always included</p>
              <ul className="workflow-chip-row">
                {fixedStages.map((stage) => (
                  <li key={stage.id} className="workflow-chip workflow-chip--fixed">{stage.label}</li>
                ))}
              </ul>
            </div>

            <div className="workflow-components">
              <p className="search-panel__label">Optional components</p>
              <ul className="component-list">
                {components.map((component) => {
                  const on = enabled.includes(component.id);
                  return (
                    <li key={component.id}>
                      <label className="component-toggle">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={busy}
                          onChange={() => toggle(component.id)}
                        />
                        <span>
                          <strong>{component.label}</strong>
                          <small>{component.description}</small>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="workflow-preview">
              <p className="search-panel__label">Pipeline preview</p>
              <p className="workflow-preview__path">{previewLabels.join(" → ")}</p>
            </div>
          </div>
        )}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
      </div>
    </section>
  );
}

type EmailTemplate = {
  template_key: string;
  label: string;
  subject: string;
  body: string;
  is_custom: boolean;
  default_subject: string;
  default_body: string;
  updated_at: string | null;
};

function EmailTemplateEditor({
  template,
  placeholders,
  onChanged,
}: {
  template: EmailTemplate;
  placeholders: string[];
  onChanged: () => void;
}) {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSubject(template.subject);
    setBody(template.body);
  }, [template.subject, template.body]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/api/v1/organizations/current/email-templates/${template.template_key}`, {
        subject: subject.trim(),
        body,
      });
      setSaved(true);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The template could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefault() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.delete(`/api/v1/organizations/current/email-templates/${template.template_key}`);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The template could not be reset.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="email-template">
      <div className="email-template__row">
        <div>
          <strong>{template.label}</strong>
          <span className="panel-note" style={{ display: "block" }}>{template.subject}</span>
        </div>
        <div className="workflow-list__actions">
          <Pill tone={template.is_custom ? "approval" : "brand"}>
            {template.is_custom ? "Customized" : "Default"}
          </Pill>
          <Button size="small" variant="secondary" onClick={() => setOpen((value) => !value)}>
            {open ? "Close" : "Edit"}
          </Button>
        </div>
      </div>
      {open && (
        <form className="email-template__editor" onSubmit={save}>
          <p className="panel-note">
            Placeholders: {placeholders.join(" ")}
          </p>
          <label>
            Subject
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              minLength={3}
              maxLength={300}
            />
          </label>
          <label>
            Body
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              required
              minLength={10}
              maxLength={8000}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p className="form-success" role="status">Template saved.</p>}
          <div className="form-actions">
            <Button type="submit" size="small" disabled={busy}>
              {busy ? "Saving…" : "Save template"}
            </Button>
            {template.is_custom && (
              <Button
                type="button"
                size="small"
                variant="ghost"
                disabled={busy}
                onClick={() => void resetToDefault()}
              >
                Reset to default
              </Button>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

function EmailTemplatesPanel() {
  const { data, error, loading, reload } = useApi<{
    templates: EmailTemplate[];
    placeholders: string[];
  }>("/api/v1/organizations/current/email-templates");

  return (
    <section className="panel" aria-labelledby="email-templates-heading">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Candidate communication</p>
          <h2 id="email-templates-heading">Email templates</h2>
        </div>
      </div>
      <div className="panel-body">
        <p className="panel-note">
          Candidates are emailed at every stage progression, including acceptance and
          rejection. Edit the predefined messages here; placeholders in braces are
          filled in automatically.
        </p>
        {loading ? (
          <LoadingState label="Loading email templates…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : (
          <ul className="email-template-list">
            {data?.templates.map((template) => (
              <EmailTemplateEditor
                key={template.template_key}
                template={template}
                placeholders={data.placeholders}
                onChanged={() => void reload()}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AuditPanel() {
  const { data, error, loading, reload } = useApi<{ audit_records: AuditRecord[] }>(
    "/api/v1/organizations/current/audit",
  );
  return (
    <section className="panel" id="audit" aria-labelledby="audit-heading">
      <div className="panel__header">
        <div><p className="eyebrow">Governance</p><h2 id="audit-heading">Audit log</h2></div>
      </div>
      <div className="panel-body">
        {loading ? (
          <LoadingState label="Loading audit records…" />
        ) : error ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : data && data.audit_records.length === 0 ? (
          <p className="panel-note">No audit records yet. Configuration and decisions appear here.</p>
        ) : (
          <ol className="history-list">
            {data?.audit_records.slice(0, 30).map((record) => (
              <li key={record.id}>
                <strong>{record.action}</strong>
                <span>
                  {record.actor_name ?? record.actor_user_id} · {record.resource_type} ·{" "}
                  {new Date(record.occurred_at).toLocaleString()}
                </span>
                {record.reason && <p className="panel-note">Reason: {record.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

export function AdminPage() {
  const { data, error, loading, reload } = useApi<Organization>("/api/v1/organizations/current");
  const [activeTab, setActiveTab] = useState<"units" | "members" | "packs" | "workflows" | "emails" | "audit">("units");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash.replace("#", "");
      if (["units", "members", "packs", "workflows", "emails", "audit"].includes(hash)) {
        setActiveTab(hash as typeof activeTab);
      }
    }
  }, []);

  const tabs: TabItem<"units" | "members" | "packs" | "workflows" | "emails" | "audit">[] = [
    { id: "units", label: "Departments & Units", icon: <LuBuilding2 size={14} /> },
    { id: "members", label: "Staff & Roles", icon: <LuUsers size={14} /> },
    { id: "packs", label: "Domain Packs", icon: <LuShieldCheck size={14} /> },
    { id: "workflows", label: "Hiring Workflow", icon: <LuGitFork size={14} /> },
    { id: "emails", label: "Email Templates", icon: <LuMail size={14} /> },
    { id: "audit", label: "Audit Log", icon: <LuHistory size={14} /> },
  ];

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Employer Workspace", href: "/" }, { label: "Administration" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Organization governance</p>
          <h1>{data?.organization.name ?? "Administration Console"}</h1>
          <p>
            {data
              ? `Your role: ${data.role.replace(/_/g, " ")} · All mutations and configuration changes are recorded in the immutable audit log.`
              : "Manage organization departments, staff RBAC, domain packs, and verification."}
          </p>
        </div>
      </div>

      <PlatformPendingPanel />

      {loading ? (
        <LoadingState label="Loading organization configuration…" />
      ) : error || !data ? (
        <ErrorState
          message={error?.message ?? "You do not have access to organization administration."}
          onRetry={reload}
        />
      ) : (
        <div>
          <div className="admin-tabs-nav">
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(tab) => {
                setActiveTab(tab);
                window.location.hash = tab;
              }}
            />
          </div>

          <div style={{ marginTop: "-1px" }}>
            {activeTab === "units" && <UnitsPanel org={data} onChanged={reload} />}
            {activeTab === "members" && <MembersPanel />}
            {activeTab === "packs" && <PacksPanel />}
            {activeTab === "workflows" && <WorkflowsPanel />}
            {activeTab === "emails" && <EmailTemplatesPanel />}
            {activeTab === "audit" && <AuditPanel />}
          </div>
        </div>
      )}
    </div>
  );
}
