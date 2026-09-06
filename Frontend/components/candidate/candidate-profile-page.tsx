"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  LuSave,
  LuUpload,
} from "react-icons/lu";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { CandidateProfile, ParsedCv } from "@/lib/types";
import { AvatarPanel } from "@/components/candidate/avatar-panel";

export function CandidateProfilePage() {
  const { data, error, loading, reload } = useApi<{ candidate: CandidateProfile }>(
    "/api/v1/candidates/me/profile"
  );
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [credentials, setCredentials] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);
  const [cvText, setCvText] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvMessage, setCvMessage] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParsedCv | null>(null);

  useEffect(() => {
    const candidate = data?.candidate;
    if (candidate) {
      setHeadline(candidate.profile.headline);
      setSummary(candidate.profile.summary);
      setSkills(candidate.profile.skills.join(", "));
      setCredentials(candidate.profile.credentials.join(", "));
      setParsedPreview(candidate.parsed_cv ?? null);
    }
  }, [data]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.patch("/api/v1/candidates/me/profile", {
        headline: headline.trim(),
        summary: summary.trim(),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        credentials: credentials.split(",").map((s) => s.trim()).filter(Boolean),
      });
      setSaved(true);
      await reload();
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : "Your profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleConsent(purpose: string, granted: boolean) {
    setConsentBusy(true);
    try {
      await api.put(`/api/v1/candidates/me/consents/${purpose}`, { granted });
      await reload();
    } finally {
      setConsentBusy(false);
    }
  }

  async function parseCv(event: FormEvent) {
    event.preventDefault();
    setCvBusy(true);
    setCvError(null);
    setCvMessage(null);
    try {
      type ParseResult = {
        candidate: CandidateProfile;
        parsed_cv: ParsedCv;
        embedding: { has_embedding: boolean; embedding_model: string };
        source_format?: string;
      };
      let result: ParseResult;
      if (cvFile) {
        const form = new FormData();
        form.append("file", cvFile);
        form.append("apply_to_profile", "true");
        result = await api.postForm<ParseResult>("/api/v1/candidates/me/cv/upload", form);
      } else {
        result = await api.post<ParseResult>("/api/v1/candidates/me/cv/parse", {
          text: cvText.trim(),
          source_filename: "pasted-cv.txt",
          apply_to_profile: true,
        });
      }
      setParsedPreview(result.parsed_cv);
      const formatNote = result.source_format ? ` from ${result.source_format.toUpperCase()}` : "";
      setCvMessage(
        result.embedding.has_embedding
          ? `CV parsed${formatNote} (${result.parsed_cv.parser}) and embedded for job matching.`
          : "CV parsed. Embedding was not stored."
      );
      setCvText("");
      setCvFile(null);
      await reload();
    } catch (cause) {
      setCvError(cause instanceof ApiError ? cause.message : "CV could not be parsed.");
    } finally {
      setCvBusy(false);
    }
  }

  function onCvFile(file: File | null) {
    setCvFile(file);
    setCvError(null);
    setCvMessage(null);
    if (file && /\.(txt|md|csv)$/i.test(file.name)) {
      void file.text().then(setCvText);
    } else if (file) {
      setCvText("");
    }
  }

  if (loading) {
    return (
      <div className="dashboard">
        <LoadingState label="Loading candidate profile details…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dashboard">
        <ErrorState
          message={error?.message ?? "Your profile could not be loaded."}
          onRetry={reload}
        />
      </div>
    );
  }

  const consents = data.candidate.consents;
  const candidate = data.candidate;

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Candidate Portal", href: "/candidate" }, { label: "Profile & Privacy" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Identity &amp; Governance</p>
          <h1>Profile &amp; Privacy Settings</h1>
          <p>Control what verified employers see, and manage who is allowed to discover your talent profile.</p>
        </div>
      </div>

      <div className="candidate-grid">
        {/* Profile Details Form */}
        <form className="panel" onSubmit={save} aria-labelledby="edit-heading">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Verified Profile</p>
              <h2 id="edit-heading">Edit Profile Information</h2>
            </div>
          </div>
          <div className="form-grid panel-body">
            <div className="form-grid__full">
              <FormField label="Professional Headline" hint="Brief one-line summary displayed on matching cards.">
                <input
                  className="input"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  placeholder="e.g. Senior Software Engineer · 6 years distributed systems"
                  maxLength={200}
                />
              </FormField>
            </div>

            <div className="form-grid__full">
              <FormField label="Executive Summary">
                <textarea
                  className="textarea"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={4}
                  placeholder="Detailed overview of technical background and accomplishments…"
                  maxLength={4000}
                />
              </FormField>
            </div>

            <FormField label="Core Skills (comma separated)">
              <input
                className="input"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Python, React, TypeScript, System Design"
              />
            </FormField>

            <FormField label="Credentials & Certifications (comma separated)">
              <input
                className="input"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                placeholder="BS Computer Science, AWS Solutions Architect"
              />
            </FormField>

            {saveError && <p className="form-error form-grid__full" role="alert">{saveError}</p>}
            {saved && <p className="form-success form-grid__full" role="status">Profile saved successfully.</p>}

            <div className="form-actions form-grid__full">
              <Button type="submit" loading={busy} iconLeft={<LuSave size={14} />}>
                Save Profile Changes
              </Button>
            </div>
          </div>
        </form>

        {/* Privacy & Discovery Consent Controls */}
        <section className="panel" aria-labelledby="privacy-heading">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Consent &amp; Discovery</p>
              <h2 id="privacy-heading">Privacy Controls</h2>
            </div>
          </div>
          <div className="panel-body consent-list">
            <div className="consent-row">
              <div>
                <strong>Proactive Talent Discovery</strong>
                <p className="panel-note">
                  Allow verified employers to find your profile and skill scores in search.
                  Disabling removes you from discovery results; existing applications preserve their lawful records.
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(consents.discovery)}
                  disabled={consentBusy}
                  onChange={(event) => toggleConsent("discovery", event.target.checked)}
                />
                <span style={{ fontWeight: 600, color: consents.discovery ? "var(--teal-700)" : "var(--ink-400)" }}>
                  {consents.discovery ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>

            <div className="consent-row">
              <div>
                <strong>Application Processing</strong>
                <p className="panel-note">
                  Required to apply to open requisitions. Your profile snapshot is shared only with
                  organizations you explicitly apply to.
                </p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(consents.application_processing)}
                  disabled={consentBusy}
                  onChange={(event) => toggleConsent("application_processing", event.target.checked)}
                />
                <span style={{ fontWeight: 600, color: consents.application_processing ? "var(--green-700)" : "var(--ink-400)" }}>
                  {consents.application_processing ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>

            <div style={{ marginTop: "10px", padding: "10px 14px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
              <p className="panel-note" style={{ fontSize: "12px" }}>
                <strong>Matching Vector Index:</strong>{" "}
                {candidate.has_embedding
                  ? `Active (${candidate.embedding_model ?? "vector embedded"})`
                  : "Not generated yet — parse a CV or save profile to activate semantic matching."}
              </p>
            </div>
          </div>
        </section>

        {/* Reference Photo Verification Avatar */}
        <AvatarPanel />

        {/* CV Parser & Embedding Panel */}
        <form className="panel candidate-grid__full" onSubmit={parseCv} aria-labelledby="cv-heading">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Semantic resume parsing</p>
              <h2 id="cv-heading">Parse CV for Semantic Matching</h2>
            </div>
          </div>
          <div className="form-grid panel-body">
            <p className="panel-note form-grid__full">
              Upload your resume (PDF, DOCX, or text). We structure it once, embed the competencies, and match
              against newly published requisitions automatically.
            </p>

            <div className="form-grid__full">
              <FormField label="Upload Resume File (PDF or DOCX)">
                <input
                  type="file"
                  className="input"
                  style={{ padding: "8px" }}
                  accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={(event) => onCvFile(event.target.files?.[0] ?? null)}
                />
              </FormField>
              {cvFile && (
                <p className="panel-note" style={{ marginTop: "4px", color: "var(--brand-600)", fontWeight: 500 }}>
                  Selected file: {cvFile.name} ({(cvFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            <div className="form-grid__full">
              <FormField label="Or Paste Resume Plain Text">
                <textarea
                  className="textarea"
                  value={cvText}
                  onChange={(event) => {
                    setCvText(event.target.value);
                    if (event.target.value.trim()) setCvFile(null);
                  }}
                  rows={8}
                  placeholder="Paste raw resume text here if not uploading a file…"
                  maxLength={100000}
                />
              </FormField>
            </div>

            {cvError && <p className="form-error form-grid__full" role="alert">{cvError}</p>}
            {cvMessage && <p className="form-success form-grid__full" role="status">{cvMessage}</p>}

            <div className="form-actions form-grid__full">
              <Button
                type="submit"
                loading={cvBusy}
                disabled={cvBusy || (!cvFile && cvText.trim().length < 40)}
                iconLeft={<LuUpload size={14} />}
              >
                Parse &amp; Embed Resume
              </Button>
            </div>

            {parsedPreview && parsedPreview.sections.length > 0 && (
              <div className="form-grid__full" style={{ marginTop: "12px" }}>
                <p className="eyebrow">Structured Resume Preview ({parsedPreview.parser})</p>
                <ul className="consent-list" style={{ marginTop: "8px" }}>
                  {parsedPreview.sections.map((section, idx) => (
                    <li key={`${section.title}-${idx}`} style={{ padding: "10px 14px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
                      <strong>{section.title}</strong>
                      {section.description && <p className="panel-note">{section.description}</p>}
                      <p className="panel-note" style={{ color: "var(--ink-700)" }}>
                        {section.content.slice(0, 3).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
