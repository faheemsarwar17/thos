"use client";

import Link from "next/link";
import { LuActivity } from "react-icons/lu";
import { FunnelChart, ScoreHistogram, StageMixChart, TrendColumns } from "@/components/charts";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { allCards } from "@/lib/pipeline-phases";
import { relTime } from "@/lib/rel-time";
import { useApi } from "@/lib/use-api";
import type { Analytics, Notification, PipelineColumn, Posting } from "@/lib/types";

const dash = "—";

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function EmployerDashboard() {
  const analytics = useApi<{ analytics: Analytics }>("/api/v1/analytics/pipeline");
  const postings = useApi<{ postings: Posting[] }>("/api/v1/postings");
  const pipeline = useApi<{ columns: PipelineColumn[] }>("/api/v1/pipeline");
  const notifications = useApi<{ notifications: Notification[] }>("/api/v1/notifications");

  const columns = pipeline.data?.columns ?? [];
  const cards = allCards(columns);
  const newCards = columns.filter((column) => column.category === "new").flatMap((column) => column.cards);
  const newCount = newCards.length;
  const interviewsToScore = cards.filter((card) => card.applied_interview_status === "evaluated").length;
  const stats = analytics.data?.analytics;
  const pipelineReady = !!pipeline.data;
  const drafts = (postings.data?.postings ?? []).filter((p) => p.status === "draft");
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="dashboard">
      <PageHeader title="Today" meta={today} />

      {analytics.error ? (
        <ErrorState message={analytics.error.message} onRetry={analytics.reload} />
      ) : (
        <div className="stat-grid">
          <StatTile label="In flight" value={stats ? stats.in_flight : dash} />
          <StatTile label="New" value={pipelineReady ? newCount : dash} />
          <StatTile label="To score" value={pipelineReady ? interviewsToScore : dash} />
          <StatTile label="Hired" value={stats ? stats.hired : dash} />
          <StatTile label="Live jobs" value={stats ? stats.published_postings : dash} />
        </div>
      )}

      {pipeline.error ? (
        <ErrorState message={pipeline.error.message} onRetry={pipeline.reload} />
      ) : pipeline.loading || postings.loading ? (
        <div className="chart-grid" aria-busy="true">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : (
        <div className="chart-grid">
          <FunnelChart columns={columns} />
          {postings.error ? (
            <ErrorState message={postings.error.message} onRetry={postings.reload} />
          ) : (
            <StageMixChart
              columns={columns}
              postings={postings.data?.postings ?? []}
              actions={
                <>
                  <Link className="link" href="/jobs">View all jobs</Link>
                  <Link className="button button--primary button--sm" href="/jobs?create=1">New requisition</Link>
                </>
              }
            />
          )}
          <TrendColumns cards={cards} />
          <ScoreHistogram cards={cards} />
        </div>
      )}

      <div className="agenda">
        <section className="agenda__col" aria-labelledby="agenda-now">
          <h2 id="agenda-now">Now</h2>
          {newCount > 0 && (
            <article className="task task--amber">
              <h3>{newCount} new application{newCount === 1 ? "" : "s"}</h3>
              <p>Screen and decide who moves on</p>
              <div className="task__foot">
                <span className="task__people" aria-hidden="true">
                  {newCards.slice(0, 4).map((c) => <span key={c.id} className="avatar">{initials(c.candidate_name)}</span>)}
                </span>
                <Link className="button button--secondary button--sm" href="/pipeline">Review</Link>
              </div>
            </article>
          )}
          {interviewsToScore > 0 && (
            <article className="task task--violet">
              <h3>{interviewsToScore} interview{interviewsToScore === 1 ? "" : "s"} to score</h3>
              <p>Submitted job interviews are ready for scorecards</p>
              <div className="task__foot">
                <span className="task__people" />
                <Link className="button button--secondary button--sm" href="/pipeline">Score</Link>
              </div>
            </article>
          )}
          {newCount === 0 && interviewsToScore === 0 && <p className="panel-note">Nothing needs you right now</p>}
        </section>

        <section className="agenda__col" aria-labelledby="agenda-today">
          <h2 id="agenda-today">Today</h2>
          {drafts.map((p) => (
            <article key={p.id} className="task task--brand">
              <h3>Finish &ldquo;{p.title}&rdquo;</h3>
              <p>Draft requisition · lock its question pool to publish</p>
              <div className="task__foot">
                <span className="task__people" />
                <Link className="button button--secondary button--sm" href={`/jobs/${p.id}`}>Set up</Link>
              </div>
            </article>
          ))}
          <article className="task">
            <h3>Live interview room</h3>
            <p>Join the active LiveKit video session</p>
            <div className="task__foot">
              <span className="task__people" />
              <Link className="button button--secondary button--sm" href="/interviews/faculty-panel">Join</Link>
            </div>
          </article>
        </section>

        <section className="agenda__col" aria-labelledby="agenda-recent">
          <h2 id="agenda-recent">Recent</h2>
          <div className="panel">
            {notifications.loading ? (
              <LoadingState label="Loading activity…" />
            ) : notifications.error ? (
              <ErrorState message={notifications.error.message} onRetry={notifications.reload} />
            ) : (notifications.data?.notifications.length ?? 0) === 0 ? (
              <EmptyState icon={<LuActivity size={20} />} title="No recent activity" />
            ) : (
              <ol className="feed">
                {notifications.data?.notifications.slice(0, 6).map((item) => (
                  <li key={item.id} className="feed__item">
                    <span className="feed__text">
                      <b>{item.title}</b>
                      <small>{item.body}</small>
                    </span>
                    <span className="feed__side">
                      <time dateTime={item.created_at}>{relTime(item.created_at)}</time>
                      {item.link && <Link className="link" href={item.link}>View</Link>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
