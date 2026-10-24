"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LuCheck,
  LuExternalLink,
  LuScale,
  LuShieldCheck,
} from "react-icons/lu";
import { ChartCard, ChartTable } from "@/components/charts";
import { PageHeader } from "@/components/ui/page-header";
import { Pill, type PillTone } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { Table, TableContainer } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { useApi } from "@/lib/use-api";

type OverviewData = {
  total_postings: number;
  active_postings: number;
  total_applications: number;
  hired_count: number;
  rejected_count: number;
  in_flight_count: number;
  avg_time_to_hire_days: number;
  offer_acceptance_rate: number;
};

type FunnelStep = {
  stage_id: string;
  label: string;
  count: number;
  current_active: number;
  overall_conversion_pct: number;
  step_pass_through_pct: number;
  drop_off_count: number;
};

type FunnelData = {
  total_applicants: number;
  steps: FunnelStep[];
};

type VelocityData = {
  stage_slas: {
    stage_id: string;
    label: string;
    avg_days: number;
    target_sla_days: number;
    status: "healthy" | "warning" | "critical";
  }[];
  bottlenecks: {
    application_id: string;
    candidate_name: string;
    posting_title: string;
    stage_id: string;
    days_in_stage: number;
    sla_days: number;
    exceeded_by_days: number;
  }[];
};

type FairnessData = {
  overall_average_score: number;
  parity_index: number;
  disparate_impact_status: string;
  four_fifths_rule_met: boolean;
  domains: {
    domain: string;
    sample_size: number;
    average_score: number;
    parity_ratio: number;
  }[];
};

type CalibrationData = {
  evaluated_pair_count: number;
  average_score_divergence_points: number;
  calibration_health: string;
  human_ai_consensus_rate: number;
};

type Section = "funnel" | "sla" | "fairness";

// Status is always spelled out (never colour alone).
const SLA_DISPLAY: Record<string, { label: string; tone: PillTone }> = {
  healthy: { label: "Healthy", tone: "verified" },
  warning: { label: "Warning", tone: "attention" },
  critical: { label: "Critical", tone: "danger" },
};

const humanize = (s: string) => s.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase());

const dash = "—";
const noData = "Not enough data";

function SectionState({ loading, error, onRetry, label }: { loading: boolean; error: { message: string } | null; onRetry: () => void; label: string }) {
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (loading) return <LoadingState label={label} />;
  return null;
}

export function AnalyticsDashboard() {
  const [section, setSection] = useState<Section>("funnel");

  const overview = useApi<OverviewData>("/api/v1/analytics/overview");
  const funnel = useApi<FunnelData>("/api/v1/analytics/funnel");
  const velocity = useApi<VelocityData>("/api/v1/analytics/velocity");
  const fairness = useApi<FairnessData>("/api/v1/analytics/fairness");
  const calibration = useApi<CalibrationData>("/api/v1/analytics/calibration");

  const o = overview.data;
  // Rates over zero hires are not meaningful; show "—" instead of a number that looks real.
  const hasHires = !!o && o.hired_count > 0;
  const steps = funnel.data?.steps ?? [];
  const maxCount = Math.max(1, ...steps.map((s) => s.count));
  const f = fairness.data;
  const c = calibration.data;

  return (
    <div className="dashboard">
      <PageHeader
        title="Analytics"
        actions={
          <SegmentedControl
            label="Section"
            value={section}
            onChange={setSection}
            options={[
              { value: "funnel", label: "Funnel" },
              { value: "sla", label: "SLA & bottlenecks" },
              { value: "fairness", label: "Fairness & calibration" },
            ]}
          />
        }
      />

      {overview.error ? (
        <ErrorState message={overview.error.message} onRetry={overview.reload} />
      ) : (
        <div className="stat-grid" aria-busy={overview.loading}>
          <StatTile
            label="Time to hire"
            value={hasHires && o?.avg_time_to_hire_days != null ? `${o.avg_time_to_hire_days} days` : dash}
            hint={hasHires && o?.avg_time_to_hire_days != null ? (o.avg_time_to_hire_days <= 21 ? "Within 21-day target" : "Above 21-day target") : noData}
          />
          <StatTile
            label="Active pipeline"
            value={o ? `${o.in_flight_count} candidates` : dash}
            hint={o ? `${o.hired_count} hired · ${o.rejected_count} rejected` : noData}
          />
          <StatTile
            label="Offer acceptance"
            value={hasHires && o?.offer_acceptance_rate != null ? `${o.offer_acceptance_rate}%` : dash}
            hint={hasHires ? "Accepted offers / offers made" : noData}
          />
          <StatTile
            label="Requisitions"
            value={o ? `${o.active_postings} open` : dash}
            hint={o ? `${o.total_postings} total created` : noData}
          />
        </div>
      )}

      {section === "funnel" && (
        <>
          <SectionState loading={funnel.loading} error={funnel.error} onRetry={funnel.reload} label="Computing funnel…" />
          {funnel.data && (
            <ChartCard
              title="Hiring funnel"
              sub={`${funnel.data.total_applicants} applicants · pass-through and drop-off from application to hire`}
              table={
                <ChartTable
                  head={["Stage", "Reached", "Active now", "Pass-through", "% of total", "Dropped"]}
                  rows={steps.map((s, i) => [s.label, s.count, s.current_active, i > 0 ? `${s.step_pass_through_pct}%` : "—", `${s.overall_conversion_pct}%`, s.drop_off_count])}
                />
              }
            >
              {steps.length === 0 ? (
                <EmptyState title="No funnel data yet" description="Applications will appear here once candidates apply." />
              ) : (
                <ol className="waterfall">
                  {steps.map((step, idx) => (
                    <li key={step.stage_id} className="waterfall__step">
                      <div className="waterfall__head">
                        <span className="waterfall__index" aria-hidden="true">{idx + 1}</span>
                        <strong>{step.label}</strong>
                        <span className="waterfall__sub">{step.count} reached · {step.current_active} active</span>
                        <span className="waterfall__stats">
                          {idx > 0 && <span>Pass-through <strong>{step.step_pass_through_pct}%</strong></span>}
                          <Pill tone={idx === steps.length - 1 ? "verified" : "brand"}>{step.overall_conversion_pct}% of total</Pill>
                        </span>
                      </div>
                      <span className="chart-funnel__track waterfall__track">
                        <span className="chart-funnel__bar" style={{ width: `${(step.count / maxCount) * 100}%` }} />
                      </span>
                      {idx < steps.length - 1 && step.drop_off_count > 0 && (
                        <span className="waterfall__drop">↓ {step.drop_off_count} candidates discontinued or rejected</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </ChartCard>
          )}
        </>
      )}

      {section === "sla" && (
        <div className="stack-lg">
          <section className="panel" aria-labelledby="sla-heading">
            <div className="panel__header"><h2 id="sla-heading">Stage duration & SLA targets</h2></div>
            <div className="panel-body">
              <SectionState loading={velocity.loading} error={velocity.error} onRetry={velocity.reload} label="Measuring stage velocity…" />
              {velocity.data && (velocity.data.stage_slas.length === 0 ? (
                <p className="panel-note">No stage timing data yet.</p>
              ) : (
                <div className="sla-grid">
                  {velocity.data.stage_slas.map((sla) => {
                    const d = SLA_DISPLAY[sla.status] ?? { label: sla.status, tone: "neutral" as PillTone };
                    return (
                      <div key={sla.stage_id} className="sla-card">
                        <div className="sla-card__head">
                          <strong>{sla.label}</strong>
                          <Pill tone={d.tone}>{d.label}</Pill>
                        </div>
                        <div className="sla-card__value tabular-nums">{sla.avg_days} <small>avg days</small></div>
                        <div className="sla-card__target">Target SLA: {sla.target_sla_days} days</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="bottleneck-heading">
            <div className="panel__header">
              <div className="panel__titles">
                <h2 id="bottleneck-heading">Active SLA bottlenecks</h2>
                <p className="panel-note">In-flight candidates currently exceeding stage target duration</p>
              </div>
              <div className="panel__actions">
                <Link href="/pipeline" className="button button--secondary button--sm">Open Pipeline</Link>
              </div>
            </div>
            <SectionState loading={velocity.loading} error={velocity.error} onRetry={velocity.reload} label="Checking bottlenecks…" />
            {velocity.data && (velocity.data.bottlenecks.length === 0 ? (
              <EmptyState
                icon={<LuCheck size={22} />}
                title="All candidates are within SLA targets"
                description="No aging bottleneck detected across active requisitions."
              />
            ) : (
              <TableContainer>
                <Table className="table--stack">
                  <thead>
                    <tr>
                      <th scope="col">Candidate</th>
                      <th scope="col">Requisition</th>
                      <th scope="col">Current stage</th>
                      <th scope="col">Time in stage</th>
                      <th scope="col">Exceeded by</th>
                      <th scope="col" className="is-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {velocity.data.bottlenecks.map((item) => (
                      <tr key={item.application_id}>
                        <th scope="row">{item.candidate_name}</th>
                        <td data-label="Requisition">{item.posting_title}</td>
                        <td data-label="Stage"><Pill tone="neutral">{item.stage_id.replace(/_/g, " ")}</Pill></td>
                        <td data-label="In stage" className="tabular-nums">{item.days_in_stage} days</td>
                        <td data-label="Exceeded"><Pill tone="danger">+{item.exceeded_by_days}d over SLA</Pill></td>
                        <td className="is-end">
                          <Link href={`/pipeline?applicationId=${item.application_id}`} className="button button--secondary button--sm">
                            <span>Inspect</span>
                            <LuExternalLink size={12} aria-hidden="true" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableContainer>
            ))}
          </section>
        </div>
      )}

      {section === "fairness" && (
        <div className="two-up">
          <section className="panel" aria-labelledby="fairness-heading">
            <div className="panel__header">
              <span className="panel__icon panel__icon--green" aria-hidden="true"><LuShieldCheck size={18} /></span>
              <div className="panel__titles">
                <h2 id="fairness-heading">Algorithmic fairness audit</h2>
                <p className="panel-note">Disparate impact monitoring (four-fifths rule)</p>
              </div>
            </div>
            <div className="panel-body stack-md">
              <SectionState loading={fairness.loading} error={fairness.error} onRetry={fairness.reload} label="Auditing score parity…" />
              {f && (
                <>
                  <div className="note-box">
                    <div className="app-row app-row--between">
                      <span className="note-box__title">Parity compliance index</span>
                      {typeof f.four_fifths_rule_met === "boolean" && (
                        <Pill tone={f.four_fifths_rule_met ? "verified" : "attention"}>
                          {f.four_fifths_rule_met ? "Within threshold" : "Review needed"}
                        </Pill>
                      )}
                    </div>
                    <div className="big-number tabular-nums">
                      {f.parity_index ?? dash} <small>threshold ≥ 0.80</small>
                    </div>
                    {f.disparate_impact_status && <p className="panel-note">{f.disparate_impact_status}</p>}
                  </div>
                  <h3>Domain rubric parity</h3>
                  {f.domains.length === 0 ? (
                    <p className="panel-note">{noData}</p>
                  ) : (
                    <ul className="kv-list">
                      {f.domains.map((dom) => (
                        <li key={dom.domain}>
                          <span>{dom.domain} <small>· n={dom.sample_size}</small></span>
                          <span className="kv-list__end">
                            Avg <strong>{dom.average_score}/100</strong>
                            <Pill tone="neutral">Ratio {dom.parity_ratio}</Pill>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="panel" aria-labelledby="calibration-heading">
            <div className="panel__header">
              <span className="panel__icon" aria-hidden="true"><LuScale size={18} /></span>
              <div className="panel__titles">
                <h2 id="calibration-heading">Human & AI calibration</h2>
                <p className="panel-note">Consensus between human scorecards and AI evaluations</p>
              </div>
            </div>
            <div className="panel-body stack-md">
              <SectionState loading={calibration.loading} error={calibration.error} onRetry={calibration.reload} label="Comparing scorecards…" />
              {c && (
                <>
                  <div className="note-box">
                    <div className="app-row app-row--between">
                      <span className="note-box__title">Avg score divergence</span>
                      {c.calibration_health && <Pill tone="brand">{humanize(c.calibration_health)}</Pill>}
                    </div>
                    <div className="big-number tabular-nums">
                      {c.evaluated_pair_count > 0 ? `±${c.average_score_divergence_points}` : dash} <small>{c.evaluated_pair_count > 0 ? "points difference" : noData}</small>
                    </div>
                  </div>
                  <ul className="kv-list">
                    <li><span>Inter-rater consensus rate</span><strong>{c.evaluated_pair_count > 0 ? `${c.human_ai_consensus_rate}%` : dash}</strong></li>
                    <li><span>Calibrated review pairs</span><strong>{c.evaluated_pair_count} candidates</strong></li>
                  </ul>
                  <p className="panel-note">
                    Interviews with a score discrepancy exceeding 20 points are flagged in the pipeline drawer for calibration committee review.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
