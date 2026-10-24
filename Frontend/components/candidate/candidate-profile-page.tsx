"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LuFileUp, LuSave, LuUpload } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { Switch } from "@/components/ui/switch";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { CandidateProfile, ParsedCv } from "@/lib/types";
import { AvatarPanel } from "@/components/candidate/avatar-panel";

const SECTIONS = ["profile", "photo", "resume", "privacy"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABELS: Record<Section, string> = { profile: "Profile", photo: "Photo", resume: "Resume", privacy: "Privacy" };

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
  const [section, setSection] = useState<Section>("profile");

  // Section follows the hash (Home's "Privacy" tile links to #privacy).
  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.replace("#", "");
      if ((SECTIONS as readonly string[]).includes(h)) setSection(h as Section);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

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
      <PageHeader title="Profile & privacy" meta="Control what verified employers see and who can discover you" />

      <div className="settings">
        <nav className="settings__nav" aria-label="Profile sections">
          {SECTIONS.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={section === id ? "true" : undefined}
              onClick={() => {
                setSection(id);
                window.location.hash = id;
              }}
            >
              {SECTION_LABELS[id]}
            </button>
          ))}
        </nav>

        <div className="settings__body">
          {section === "profile" && (
            <form className="panel" onSubmit={save} aria-labelledby="edit-heading">
              <div className="panel__header">
                <h2 id="edit-heading">Profile information</h2>
              </div>
              <div className="form-grid panel-body">
                <div className="form-grid__full">
                  <FormField id="profile-headline" label="Professional Headline" hint="Brief one-line summary displayed on matching cards.">
                    <input
                      id="profile-headline"
                      className="input"
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="e.g. Senior Software Engineer · 6 years distributed systems"
                      maxLength={200}
                    />
                  </FormField>
                </div>

                <div className="form-grid__full">
                  <FormField id="profile-summary" label="Executive Summary">
                    <textarea
                      id="profile-summary"
                      className="textarea"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      rows={4}
                      placeholder="Detailed overview of technical background and accomplishments…"
                      maxLength={4000}
                    />
                  </FormField>
                </div>

                <FormField id="profile-skills" label="Core Skills (comma separated)">
                  <input
                    id="profile-skills"
                    className="input"
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="Python, React, TypeScript, System Design"
                  />
                </FormField>

                <FormField id="profile-credentials" label="Credentials & Certifications (comma separated)">
                  <input
                    id="profile-credentials"
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
          )}

          {section === "photo" && <AvatarPanel />}

          {section === "resume" && (
            <form className="panel" onSubmit={parseCv} aria-labelledby="cv-heading">
              <div className="panel__header">
                <h2 id="cv-heading">Resume</h2>
              </div>
              <div className="panel-body stack-md">
                <p className="panel-note">
                  Upload your resume (PDF, DOCX, or text). We structure it once, embed the competencies, and match
                  against newly published requisitions automatically.
                </p>

                <label className="dropzone">
                  <LuFileUp size={22} aria-hidden="true" />
                  <span><strong>Choose a resume file</strong> (PDF, DOCX, TXT, MD, CSV)</span>
                  {cvFile && (
                    <span className="dropzone__file">
                      Selected file: {cvFile.name} ({(cvFile.size / 1024).toFixed(1)} KB)
                    </span>
                  )}
                  <input
                    type="file"
                    className="file-input-hidden"
                    aria-label="Upload Resume File (PDF or DOCX)"
                    accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    onChange={(event) => onCvFile(event.target.files?.[0] ?? null)}
                  />
                </label>

                <FormField id="cv-text" label="Or Paste Resume Plain Text">
                  <textarea
                    id="cv-text"
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

                {cvError && <p className="form-error" role="alert">{cvError}</p>}
                {cvMessage && <p className="form-success" role="status">{cvMessage}</p>}

                <div className="form-actions">
                  <Button
                    type="submit"
                    loading={cvBusy}
                    disabled={cvBusy || (!cvFile && cvText.trim().length < 40)}
                    iconLeft={<LuUpload size={14} />}
                  >
                    Parse &amp; update profile
                  </Button>
                </div>

                {parsedPreview && parsedPreview.sections.length > 0 && (
                  <div className="stack-md">
                    <h3>Structured resume preview ({parsedPreview.parser})</h3>
                    <ul className="kv-list kv-list--stack">
                      {parsedPreview.sections.map((item, idx) => (
                        <li key={`${item.title}-${idx}`}>
                          <strong>{item.title}</strong>
                          {item.description && <span className="panel-note">{item.description}</span>}
                          <span className="panel-note">{item.content.slice(0, 3).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </form>
          )}

          {section === "privacy" && (
            <section className="panel" aria-labelledby="privacy-heading">
              <div className="panel__header">
                <h2 id="privacy-heading">Privacy</h2>
              </div>
              <div className="panel-body stack-md">
                <Switch
                  label="Let employers discover me"
                  description="Verified employers can find your profile and skill scores in search. Turning this off removes you from discovery; existing applications keep their lawful records."
                  checked={Boolean(consents.discovery)}
                  disabled={consentBusy}
                  onChange={(next) => void toggleConsent("discovery", next)}
                />
                <Switch
                  label="Process my applications"
                  description="Required to apply to open requisitions. Your profile snapshot is shared only with organizations you apply to."
                  checked={Boolean(consents.application_processing)}
                  disabled={consentBusy}
                  onChange={(next) => void toggleConsent("application_processing", next)}
                />
                <p className="note-box panel-note">
                  <strong>Matching vector index:</strong>{" "}
                  {candidate.has_embedding
                    ? `Active (${candidate.embedding_model ?? "vector embedded"})`
                    : "Not generated yet — parse a CV or save profile to activate semantic matching."}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
