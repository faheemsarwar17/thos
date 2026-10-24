"use client";

import Link from "next/link";
import { LuSparkles } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { currentSession } from "@/lib/auth";
import { nextStep } from "@/lib/candidate-next-step";
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

  const inProgress = attempts.data?.attempts.some((a) => a.status === "in_progress") ?? false;
  const first = candidate ? currentSession()?.user.display_name.split(" ")[0] ?? "" : "";
  const stepApp = applications.data?.applications.find((app) => nextStep(app) !== null);
  const step = stepApp ? nextStep(stepApp) : null;

  return (
    <div className="dashboard">
      <PageHeader title={`Welcome back${first ? `, ${first}` : ""}`} meta="Here's where your applications stand" />

      {applications.data && (step && stepApp ? (
        <Link className={`hero hero--${step.tone}`} href={step.href}>
          <span className="hero__eyebrow">Your next step</span>
          <b>{step.label}</b>
          <span className="hero__sub">{stepApp.job_title} · {stepApp.organization_name}</span>
          <span className="button button--primary hero__cta">Start</span>
        </Link>
      ) : (
        <div className="hero">
          <span className="hero__eyebrow">You&apos;re all caught up</span>
          <b>Nothing needs you right now</b>
          <span className="hero__sub">We&apos;ll notify you when an employer moves your application.</span>
        </div>
      ))}

      <div className="stat-grid">
        <StatTile
          label="Profile screening"
          value={bestScore !== null ? Math.round(bestScore) : "—"}
          href="/candidate/interview"
          action={inProgress ? "Resume screening" : bestScore !== null ? "Retake" : "Start screening"}
        />
        <StatTile
          label="Active applications"
          value={activeApplications ? activeApplications.length : "—"}
          href="/candidate/applications"
          action="View all"
        />
        <StatTile label="Open jobs" value="—" href="/candidate/jobs" action="Browse" />
        <StatTile
          label="Discoverable"
          value={candidate ? (candidate.consents.discovery ? "On" : "Off") : "—"}
          href="/candidate/profile#privacy"
          action="Privacy"
        />
      </div>

      {profile.loading ? (
        <LoadingState label="Loading your profile and matches…" />
      ) : profile.error ? (
        <ErrorState message={profile.error.message} onRetry={profile.reload} />
      ) : (
        <>
          <div className="two-col">
            <section className="panel" aria-label="Applications">
              <div className="panel__header">
                <h2>Applications</h2>
                <Link className="link panel__actions" href="/candidate/applications">View all applications</Link>
              </div>
              {applications.loading ? (
                <LoadingState label="Loading your applications…" />
              ) : applications.error ? (
                <ErrorState message={applications.error.message} onRetry={applications.reload} />
              ) : activeApplications && activeApplications.length === 0 ? (
                <p className="panel-body panel-note">
                  No active applications. <Link href="/candidate/jobs" className="link">Explore open jobs</Link> to submit your verified profile.
                </p>
              ) : (
                <div>
                  {activeApplications?.map((application) => (
                    <div key={application.id} className="row-link">
                      <span className="row-link__text">
                        <b>{application.job_title}</b>
                        <small>{application.organization_name}</small>
                      </span>
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
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel" aria-label="Suggested jobs">
              <div className="panel__header">
                <h2>Suggested jobs</h2>
                <Link className="link panel__actions" href="/candidate/jobs">Browse all jobs</Link>
              </div>
              {matches.loading ? (
                <LoadingState label="Loading matched opportunities…" />
              ) : matches.error ? (
                <ErrorState message={matches.error.message} onRetry={matches.reload} />
              ) : !matches.data || matches.data.matches.length === 0 ? (
                <p className="panel-body panel-note">
                  No automatic matches yet. Ensure discovery consent is enabled and complete a Profile Screening
                  to be matched with relevant openings.
                </p>
              ) : (
                <div>
                  {matches.data.matches.map((match) => (
                    <div key={match.id} className="row-link">
                      <span className="row-link__text">
                        <b>{match.title}</b>
                        <small>{match.location || "Location flexible"} · {match.reasons[0]}</small>
                      </span>
                      <ScoreBadge score={match.score} label="Match" />
                      <Link className="button button--secondary button--sm" href="/candidate/jobs">
                        View role
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <details className="panel screening-history">
            <summary>Screening history ({attempts.data?.attempts.length ?? 0})</summary>
            {attempts.data && attempts.data.attempts.length === 0 ? (
              <p className="panel-body panel-note">
                You have not taken a Profile Screening yet. Complete an interactive AI voice
                screening to generate a portable, verified skill score that employers trust.
              </p>
            ) : (
              <div>
                {attempts.data?.attempts.map((attempt) => (
                  <div key={attempt.id} className="row-link">
                    <span className="row-link__text">
                      <b>Attempt {attempt.attempt_number}</b>
                      <small>{attempt.pack_id}</small>
                    </span>
                    <Pill tone={attempt.status === "evaluated" ? "verified" : "attention"}>
                      {attempt.status.replace(/_/g, " ")}
                    </Pill>
                    <ScoreBadge score={attempt.overall_score} />
                  </div>
                ))}
              </div>
            )}
          </details>

          <section className="panel" aria-label="Profile snapshot">
            <div className="panel__header">
              <h2>Profile snapshot</h2>
              <Link className="link panel__actions" href="/candidate/profile">Edit profile</Link>
            </div>
            <div className="panel-body stack-md">
              <strong>{candidate?.profile.headline || "Add a professional headline"}</strong>
              <div className="chip-row">
                {candidate?.profile.skills && candidate.profile.skills.length > 0
                  ? candidate.profile.skills.slice(0, 5).map((skill) => <Badge key={skill}>{skill}</Badge>)
                  : <span className="panel-note">No skills added yet</span>}
              </div>
              <div>
                <Pill tone={candidate?.consents.discovery ? "verified" : "neutral"}>
                  {candidate?.consents.discovery ? "Visible to verified employers" : "Hidden from talent search"}
                </Pill>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
