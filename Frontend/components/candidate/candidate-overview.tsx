"use client";

import Link from "next/link";
import {
  LuSparkles,
  LuArrowRight,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Pill } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useApi } from "@/lib/use-api";
import type { AttemptSummary, CandidateApplication, CandidateProfile } from "@/lib/types";

export function CandidateOverview() {
  const profile = useApi<{ candidate: CandidateProfile }>("/api/v1/candidates/me/profile");
  const attempts = useApi<{ attempts: AttemptSummary[] }>(
    "/api/v1/candidates/me/profile-interview-attempts"
  );
  const applications = useApi<{ applications: CandidateApplication[] }>(
    "/api/v1/candidates/me/applications"
  );
  const matches = useApi<{
    matches: {
      id: string;
      posting_id: string;
      title: string;
      location: string;
      score: number;
      reasons: string[];
    }[];
  }>("/api/v1/candidates/me/matches");

  const bestScore =
    attempts.data?.attempts.reduce<number | null>(
      (best, attempt) =>
        attempt.overall_score !== null && (best === null || attempt.overall_score > best)
          ? attempt.overall_score
          : best,
      null
    ) ?? null;

  const candidate = profile.data?.candidate;
  const activeApplications = applications.data?.applications.filter(
    (application) => application.status !== "Decision"
  );

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Candidate Portal", href: "/candidate" }, { label: "Overview" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Candidate workspace</p>
          <h1>Skill Profile &amp; Opportunities</h1>
          <p>One reusable verified profile. Domain packs standardize and validate your competencies for top roles.</p>
        </div>
      </div>

      {profile.loading ? (
        <LoadingState label="Loading your profile and matches…" />
      ) : profile.error ? (
        <ErrorState message={profile.error.message} onRetry={profile.reload} />
      ) : (
        <div className="candidate-grid">
          {/* Verified Capability Panel */}
          <section className="panel" aria-labelledby="skill-heading">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Verified capability</p>
                <h2 id="skill-heading">Profile Screening</h2>
              </div>
              <ScoreBadge score={bestScore} label="Top Score" />
            </div>
            <div className="panel-body">
              {attempts.data && attempts.data.attempts.length === 0 ? (
                <div style={{ padding: "14px", background: "var(--surface-sunken)", borderRadius: "8px" }}>
                  <p className="panel-note" style={{ marginBottom: "12px" }}>
                    You have not taken a Profile Screening yet. Complete an interactive AI voice
                    screening to generate a portable, verified skill score that employers trust.
                  </p>
                </div>
              ) : (
                <ul className="attempt-list">
                  {attempts.data?.attempts.map((attempt) => (
                    <li key={attempt.id}>
                      <span>
                        Attempt {attempt.attempt_number} · <strong>{attempt.pack_id}</strong>
                      </span>
                      <Pill tone={attempt.status === "evaluated" ? "verified" : "attention"}>
                        {attempt.status.replace(/_/g, " ")}
                      </Pill>
                      <ScoreBadge score={attempt.overall_score} />
                    </li>
                  ))}
                </ul>
              )}
              <Link className="button button--primary button--sm" href="/candidate/interview" style={{ marginTop: "14px" }}>
                <LuSparkles size={14} aria-hidden="true" />
                <span>
                  {attempts.data?.attempts.some((a) => a.status === "in_progress")
                    ? "Resume Profile Screening"
                    : "Start Profile Screening"}
                </span>
              </Link>
            </div>
          </section>

          {/* Profile Identity Card */}
          <section className="panel" aria-labelledby="profile-heading">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Candidate identity</p>
                <h2 id="profile-heading">Profile Snapshot</h2>
              </div>
              <Link className="table-action" href="/candidate/profile">
                <span>Edit Profile</span>
                <LuArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
            <dl className="meta-list panel-body">
              <div>
                <dt>Headline</dt>
                <dd><strong>{candidate?.profile.headline || "Add a professional headline"}</strong></dd>
              </div>
              <div>
                <dt>Skills</dt>
                <dd>
                  {candidate?.profile.skills && candidate.profile.skills.length > 0 ? (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
                      {candidate.profile.skills.slice(0, 5).map((skill) => (
                        <Badge key={skill}>{skill}</Badge>
                      ))}
                    </div>
                  ) : (
                    "No skills added yet"
                  )}
                </dd>
              </div>
              <div>
                <dt>Discovery status</dt>
                <dd>
                  <Pill tone={candidate?.consents.discovery ? "verified" : "neutral"}>
                    {candidate?.consents.discovery ? "Visible to verified employers" : "Hidden from talent search"}
                  </Pill>
                </dd>
              </div>
            </dl>
          </section>

          {/* Suggested Matching Jobs */}
          <section className="panel candidate-grid__full" aria-labelledby="matches-heading">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Proactive matching</p>
                <h2 id="matches-heading">Suggested Job Matches</h2>
              </div>
              <Link className="table-action" href="/candidate/jobs">
                <span>Browse all jobs</span>
                <LuArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
            <div className="panel-body">
              {matches.loading ? (
                <LoadingState label="Loading matched opportunities…" />
              ) : matches.error ? (
                <ErrorState message={matches.error.message} onRetry={matches.reload} />
              ) : !matches.data || matches.data.matches.length === 0 ? (
                <p className="panel-note">
                  No automatic matches yet. Ensure discovery consent is enabled and complete a Profile Screening
                  to be matched with relevant openings.
                </p>
              ) : (
                <ul className="application-list">
                  {matches.data.matches.map((match) => (
                    <li key={match.id}>
                      <div>
                        <strong>{match.title}</strong>
                        <span style={{ display: "block", color: "var(--ink-500)", fontSize: "12px", marginTop: "2px" }}>
                          {match.location || "Location flexible"} · {match.reasons[0]}
                        </span>
                      </div>
                      <ScoreBadge score={match.score} label="Match Score" />
                      <Link className="button button--secondary button--sm" href="/candidate/jobs">
                        View Role
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Active Applications */}
          <section className="panel candidate-grid__full" aria-labelledby="apps-heading">
            <div className="panel__header">
              <div>
                <p className="eyebrow">Status tracking</p>
                <h2 id="apps-heading">Active Applications</h2>
              </div>
              <Link className="table-action" href="/candidate/applications">
                <span>View all applications</span>
                <LuArrowRight size={12} aria-hidden="true" />
              </Link>
            </div>
            <div className="panel-body">
              {applications.loading ? (
                <LoadingState label="Loading your applications…" />
              ) : applications.error ? (
                <ErrorState message={applications.error.message} onRetry={applications.reload} />
              ) : activeApplications && activeApplications.length === 0 ? (
                <p className="panel-note">
                  No active applications. <Link href="/candidate/jobs" style={{ color: "var(--brand-600)", fontWeight: 600 }}>Explore open jobs</Link> to submit your verified profile.
                </p>
              ) : (
                <ul className="application-list">
                  {activeApplications?.map((application) => (
                    <li key={application.id}>
                      <div>
                        <strong>{application.job_title}</strong>
                        <span style={{ display: "block", color: "var(--ink-500)", fontSize: "12px", marginTop: "2px" }}>
                          {application.organization_name}
                        </span>
                      </div>
                      <Pill tone="brand">{application.status}</Pill>
                      {application.applied_interview &&
                        ["invited", "in_progress"].includes(application.applied_interview.status) && (
                          <Link
                            className="button button--primary button--sm"
                            href={`/candidate/applied/${application.applied_interview.attempt_id}`}
                          >
                            <LuSparkles size={13} aria-hidden="true" />
                            <span>Take Job Interview</span>
                          </Link>
                        )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
