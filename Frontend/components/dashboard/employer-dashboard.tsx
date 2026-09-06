"use client";

import Link from "next/link";
import {
  LuCircleCheck,
  LuClock,
  LuTrendingUp,
  LuBriefcase,
  LuArrowRight,
  LuActivity,
  LuPlus,
} from "react-icons/lu";
import { AttentionQueueCard } from "@/components/ui/attention-queue-card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Table, TableContainer, TableEmpty, TableSkeletonRows } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { useApi } from "@/lib/use-api";
import type { Analytics, Notification, PipelineColumn, Posting } from "@/lib/types";

const STATUS_TONE: Record<string, PillTone> = {
  draft: "neutral",
  published: "brand",
  closed: "danger",
};

export function EmployerDashboard() {
  const analytics = useApi<{ analytics: Analytics }>("/api/v1/analytics/pipeline");
  const postings = useApi<{ postings: Posting[] }>("/api/v1/postings");
  const pipeline = useApi<{ columns: PipelineColumn[] }>("/api/v1/pipeline");
  const notifications = useApi<{ notifications: Notification[] }>("/api/v1/notifications");

  const columns = pipeline.data?.columns ?? [];
  const newCount = columns
    .filter((column) => column.category === "new")
    .reduce((sum, column) => sum + column.cards.length, 0);
  const interviewsToScore = columns
    .flatMap((column) => column.cards)
    .filter((card) => card.applied_interview_status === "evaluated").length;
  const stats = analytics.data?.analytics;

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Employer Workspace", href: "/" }, { label: "Hiring Overview" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Employer operations</p>
          <h1>Hiring Overview</h1>
          <p>Real-time pipeline movement, priority attention queue, and requisition status.</p>
        </div>
        <div className="page-heading__meta">
          <span className="system-status">
            <span aria-hidden="true">●</span> System operational
          </span>
        </div>
      </div>

      {/* Priority Work: Attention Queue */}
      <section aria-labelledby="attention-heading" style={{ marginBottom: "28px" }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Priority work</p>
            <h2 id="attention-heading">Attention queue</h2>
          </div>
          <Link href="/pipeline">
            <span>Open pipeline</span>
            <LuArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>

        {analytics.error ? (
          <ErrorState message={analytics.error.message} onRetry={analytics.reload} />
        ) : (
          <div className="attention-grid">
            <AttentionQueueCard
              count={newCount}
              title="New applications to review"
              detail="Candidates in your entry stage waiting for screening and evaluation."
              action="Open review queue"
              tone="attention"
              icon={<LuCircleCheck size={17} style={{ color: "var(--amber-700)" }} />}
              href="/pipeline"
            />
            <AttentionQueueCard
              count={interviewsToScore}
              title="Interviews ready for scorecards"
              detail="Submitted Job Interviews are ready for reviewer evaluation."
              action="Review interviews"
              tone="brand"
              icon={<LuClock size={17} style={{ color: "var(--brand-600)" }} />}
              href="/pipeline"
            />
            <AttentionQueueCard
              count={stats?.in_flight ?? 0}
              title="Active candidates in flight"
              detail={`${stats?.hired ?? 0} hired and ${stats?.rejected ?? 0} rejected across ${stats?.total_applications ?? 0} applications.`}
              action="View analytics"
              tone="neutral"
              icon={<LuTrendingUp size={17} style={{ color: "var(--teal-600)" }} />}
              href="/pipeline"
            />
          </div>
        )}
      </section>

      {/* Active Requisitions Table */}
      <section id="active-requisitions" className="panel requisitions-panel" aria-labelledby="requisitions-heading" style={{ marginBottom: "24px" }}>
        <div className="panel__header">
          <div>
            <p className="eyebrow">Hiring portfolio</p>
            <h2 id="requisitions-heading">Active Requisitions</h2>
          </div>
          <div className="panel__actions">
            <Link href="/jobs" className="button button--secondary button--sm">
              <LuBriefcase size={14} aria-hidden="true" />
              <span>View all jobs</span>
            </Link>
            <Link href="/jobs?create=1" className="button button--primary button--sm">
              <LuPlus size={14} aria-hidden="true" />
              <span>New requisition</span>
            </Link>
          </div>
        </div>

        {postings.error ? (
          <ErrorState message={postings.error.message} onRetry={postings.reload} />
        ) : (
          <TableContainer>
            <Table>
              <caption className="sr-only">Active job requisitions and their next actions</caption>
              <thead>
                <tr>
                  <th scope="col">Requisition</th>
                  <th scope="col" style={{ width: "130px" }}>Candidates</th>
                  <th scope="col" style={{ width: "120px" }}>Status</th>
                  <th scope="col" style={{ width: "160px" }}>Question Pool</th>
                  <th scope="col" style={{ width: "140px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {postings.loading ? (
                  <TableSkeletonRows rows={4} cols={5} />
                ) : postings.data && postings.data.postings.length === 0 ? (
                  <TableEmpty colSpan={5}>
                    <div style={{ padding: "16px", textAlign: "center" }}>
                      <p style={{ color: "var(--ink-600)", marginBottom: "12px" }}>
                        No requisitions found. Create your first job posting to start receiving verified applicants.
                      </p>
                      <Link className="button button--primary button--sm" href="/jobs?create=1">
                        <LuPlus size={14} aria-hidden="true" />
                        <span>Create first job</span>
                      </Link>
                    </div>
                  </TableEmpty>
                ) : (
                  postings.data?.postings.map((posting) => (
                    <tr key={posting.id}>
                      <th scope="row">
                        <Link className="role-link" href={`/jobs/${posting.id}`}>
                          <strong>{posting.title}</strong>
                          <span>{posting.location || "Location not set"}</span>
                        </Link>
                      </th>
                      <td>
                        <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: "13px" }}>
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
                      <td style={{ textAlign: "right" }}>
                        <Link className="table-action" href={`/jobs/${posting.id}`}>
                          <span>{posting.status === "draft" ? "Finish setup" : "Manage"}</span>
                          <span aria-hidden="true"> →</span>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </section>

      {/* Lower Grid: Activity Feed & Next Actions */}
      <div className="lower-grid">
        <section className="panel" aria-labelledby="activity-heading">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Live updates</p>
              <h2 id="activity-heading">Recent Activity</h2>
            </div>
          </div>
          {notifications.loading ? (
            <LoadingState label="Loading activity stream…" />
          ) : notifications.error ? (
            <ErrorState message={notifications.error.message} onRetry={notifications.reload} />
          ) : notifications.data && notifications.data.notifications.length === 0 ? (
            <EmptyState
              icon={<LuActivity size={20} />}
              title="No recent activity"
              description="Candidate movements, interview completions, and scorecard notifications will appear here."
            />
          ) : (
            <ol className="activity-list">
              {notifications.data?.notifications.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <span className="activity-avatar" aria-hidden="true">
                    <LuActivity size={14} />
                  </span>
                  <div>
                    <p><strong>{item.title}</strong></p>
                    <span>{item.body}</span>
                  </div>
                  {item.link && (
                    <Link href={item.link} className="button button--ghost button--sm">
                      View
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="panel next-actions" aria-labelledby="next-actions-heading">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Your day</p>
              <h2 id="next-actions-heading">Next actions</h2>
            </div>
          </div>
          <ol>
            <li>
              <span className="next-actions__time">Now</span>
              <div>
                <strong>Review new applications</strong>
                <span>{newCount} waiting in your entry stage</span>
              </div>
              <Link href="/pipeline" aria-label="Open the pipeline to review new applications">
                <LuArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <span className="next-actions__time">Today</span>
              <div>
                <strong>Score submitted interviews</strong>
                <span>{interviewsToScore} ready for scorecards</span>
              </div>
              <Link href="/pipeline" aria-label="Open the pipeline to score interviews">
                <LuArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
            <li>
              <span className="next-actions__time">Today</span>
              <div>
                <strong>Live interview room</strong>
                <span>Join active LiveKit video session</span>
              </div>
              <Link href="/interviews/faculty-panel" aria-label="Join the faculty panel interview room">
                <LuArrowRight size={14} aria-hidden="true" />
              </Link>
            </li>
          </ol>
        </aside>
      </div>
    </div>
  );
}
