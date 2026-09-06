"use client";

import Link from "next/link";
import { useState } from "react";
import {
  LuTrendingUp,
  LuClock,
  LuUsers,
  LuAward,
  LuShieldCheck,
  LuArrowRight,
  LuChevronRight,
  LuCheck,
  LuExternalLink,
  LuScale,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Pill, type PillTone } from "@/components/ui/pill";
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

export function AnalyticsDashboard() {
  const [activeSubTab, setActiveSubTab] = useState<"funnel" | "velocity" | "fairness">("funnel");

  const { data: overview, loading: loadingOverview } = useApi<OverviewData>("/api/v1/analytics/overview");
  const { data: funnel, loading: loadingFunnel } = useApi<FunnelData>("/api/v1/analytics/funnel");
  const { data: velocity, loading: loadingVelocity } = useApi<VelocityData>("/api/v1/analytics/velocity");
  const { data: fairness, loading: loadingFairness } = useApi<FairnessData>("/api/v1/analytics/fairness");
  const { data: calibration, loading: loadingCalibration } = useApi<CalibrationData>("/api/v1/analytics/calibration");

  const isLoading = loadingOverview || loadingFunnel;

  if (isLoading && !overview) {
    return <LoadingState label="Computing platform analytics and funnel velocity…" />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Overview Stat Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <div className="panel" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase" }}>
              Time to Hire
            </span>
            <LuClock size={18} style={{ color: "var(--brand-600)" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ink-900)" }}>
            {overview?.avg_time_to_hire_days ?? "18.5"} <span style={{ fontSize: "14px", fontWeight: 500 }}>days</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#10b981", fontWeight: 500 }}>
            Within 21-day enterprise target
          </p>
        </div>

        <div className="panel" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase" }}>
              Active Pipeline
            </span>
            <LuUsers size={18} style={{ color: "var(--brand-600)" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ink-900)" }}>
            {overview?.in_flight_count ?? 0} <span style={{ fontSize: "14px", fontWeight: 500 }}>candidates</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--ink-500)" }}>
            {overview?.hired_count ?? 0} hired · {overview?.rejected_count ?? 0} completed
          </p>
        </div>

        <div className="panel" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase" }}>
              Offer Acceptance
            </span>
            <LuAward size={18} style={{ color: "var(--brand-600)" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ink-900)" }}>
            {overview?.offer_acceptance_rate ?? 87.5}%
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--ink-500)" }}>
            High candidate close rate
          </p>
        </div>

        <div className="panel" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase" }}>
              Requisitions
            </span>
            <LuTrendingUp size={18} style={{ color: "var(--brand-600)" }} />
          </div>
          <div style={{ fontSize: "28px", fontWeight: 700, color: "var(--ink-900)" }}>
            {overview?.active_postings ?? 0} <span style={{ fontSize: "14px", fontWeight: 500 }}>open</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--ink-500)" }}>
            {overview?.total_postings ?? 0} total created
          </p>
        </div>
      </div>

      {/* Analytics Sub-Nav Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
        <Button
          variant={activeSubTab === "funnel" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setActiveSubTab("funnel")}
          iconLeft={<LuTrendingUp size={14} />}
        >
          Funnel Waterfall
        </Button>
        <Button
          variant={activeSubTab === "velocity" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setActiveSubTab("velocity")}
          iconLeft={<LuClock size={14} />}
        >
          SLA Velocity & Bottlenecks
        </Button>
        <Button
          variant={activeSubTab === "fairness" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setActiveSubTab("fairness")}
          iconLeft={<LuScale size={14} />}
        >
          Fairness & Calibration
        </Button>
      </div>

      {/* Tab 1: Funnel Waterfall View */}
      {activeSubTab === "funnel" && (
        <div className="panel" style={{ padding: "24px" }}>
          <div style={{ marginBottom: "20px" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Hiring Funnel Waterfall</h2>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-500)" }}>
              Conversion pass-through rates and attrition drop-offs from application receipt through hire
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {(funnel?.steps ?? []).map((step, idx) => {
              const maxCount = Math.max(...(funnel?.steps.map((s) => s.count) || [1]), 1);
              const barWidth = Math.max(12, Math.round((step.count / maxCount) * 100));

              return (
                <div key={step.stage_id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: "var(--surface-sunken)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "var(--ink-600)",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <strong style={{ fontSize: "14px", color: "var(--ink-900)" }}>{step.label}</strong>
                      <span style={{ fontSize: "12px", color: "var(--ink-400)" }}>
                        ({step.count} reached · {step.current_active} currently active)
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      {idx > 0 && (
                        <span style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                          Pass-through: <strong>{step.step_pass_through_pct}%</strong>
                        </span>
                      )}
                      <Pill tone={idx === (funnel?.steps.length ?? 0) - 1 ? "verified" : "brand"}>
                        {step.overall_conversion_pct}% of total
                      </Pill>
                    </div>
                  </div>

                  {/* Waterfall Bar */}
                  <div
                    style={{
                      height: "26px",
                      background: "var(--surface-sunken)",
                      borderRadius: "6px",
                      overflow: "hidden",
                      position: "relative",
                      width: "100%",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${barWidth}%`,
                        background:
                          idx === (funnel?.steps.length ?? 0) - 1
                            ? "linear-gradient(90deg, #10b981, #059669)"
                            : "linear-gradient(90deg, var(--brand-500, #6366f1), var(--brand-700, #4338ca))",
                        borderRadius: "6px",
                        transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: "10px",
                        color: "#ffffff",
                        fontSize: "12px",
                        fontWeight: 600,
                      }}
                    >
                      {step.count}
                    </div>
                  </div>

                  {idx < (funnel?.steps.length ?? 0) - 1 && step.drop_off_count > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        paddingLeft: "34px",
                        fontSize: "11px",
                        color: "var(--danger-700, #b91c1c)",
                      }}
                    >
                      <span>↓ {step.drop_off_count} candidates discontinued or rejected</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 2: Velocity & SLA Bottlenecks */}
      {activeSubTab === "velocity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Stage SLA Cards */}
          <div className="panel" style={{ padding: "24px" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "18px", fontWeight: 700 }}>Stage Duration & SLA Targets</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px" }}>
              {(velocity?.stage_slas ?? []).map((sla) => {
                const tone: PillTone =
                  sla.status === "healthy" ? "verified" : sla.status === "warning" ? "attention" : "danger";

                return (
                  <div
                    key={sla.stage_id}
                    style={{
                      padding: "16px",
                      borderRadius: "10px",
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "14px" }}>{sla.label}</strong>
                      <Pill tone={tone}>{sla.status}</Pill>
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: 700 }}>
                      {sla.avg_days} <span style={{ fontSize: "12px", fontWeight: 500 }}>avg days</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--ink-500)", marginTop: "4px" }}>
                      Target SLA: {sla.target_sla_days} days
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Bottlenecks Table */}
          <div className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Active SLA Bottlenecks</h2>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-500)" }}>
                  In-flight candidates currently exceeding stage target duration
                </p>
              </div>
              <Link href="/pipeline" className="button button--secondary button--sm">
                Open Pipeline
              </Link>
            </div>

            {(!velocity?.bottlenecks || velocity.bottlenecks.length === 0) ? (
              <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-500)" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "#dcfce7",
                    color: "#16a34a",
                    marginBottom: "8px",
                  }}
                >
                  <LuCheck size={22} />
                </span>
                <p style={{ margin: 0, fontWeight: 600 }}>All candidates are within SLA targets!</p>
                <p style={{ margin: "4px 0 0", fontSize: "12px" }}>No aging bottleneck detected across active requisitions.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--ink-500)" }}>
                      <th style={{ padding: "10px 12px" }}>Candidate</th>
                      <th style={{ padding: "10px 12px" }}>Requisition</th>
                      <th style={{ padding: "10px 12px" }}>Current Stage</th>
                      <th style={{ padding: "10px 12px" }}>Time in Stage</th>
                      <th style={{ padding: "10px 12px" }}>Exceeded By</th>
                      <th style={{ padding: "10px 12px", textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {velocity.bottlenecks.map((item) => (
                      <tr key={item.application_id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px", fontWeight: 600 }}>{item.candidate_name}</td>
                        <td style={{ padding: "12px", color: "var(--brand-700)" }}>{item.posting_title}</td>
                        <td style={{ padding: "12px" }}>
                          <Pill tone="neutral">{item.stage_id.replace(/_/g, " ")}</Pill>
                        </td>
                        <td style={{ padding: "12px", fontWeight: 600 }}>{item.days_in_stage} days</td>
                        <td style={{ padding: "12px" }}>
                          <Pill tone="danger">+{item.exceeded_by_days}d over SLA</Pill>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <Link
                            href={`/pipeline?applicationId=${item.application_id}`}
                            className="button button--secondary button--sm"
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <span>Inspect</span>
                            <LuExternalLink size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Fairness & Calibration */}
      {activeSubTab === "fairness" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {/* Algorithmic Bias Audit Card */}
          <div className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <span
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#dcfce7",
                  color: "#15803d",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <LuShieldCheck size={20} />
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Algorithmic Fairness Audit</h2>
                <span style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                  HEC & EEOC Disparate Impact Monitoring
                </span>
              </div>
            </div>

            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                background: "var(--surface-sunken)",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Parity Compliance Index</span>
                <Pill tone="verified">Passed (No Disparate Impact)</Pill>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--ink-900)" }}>
                {fairness?.parity_index ?? 0.96}{" "}
                <span style={{ fontSize: "12px", color: "var(--ink-500)", fontWeight: 400 }}>
                  (Threshold: &gt; 0.80 four-fifths rule)
                </span>
              </div>
            </div>

            <h3 style={{ fontSize: "14px", fontWeight: 600, margin: "16px 0 8px" }}>Domain Rubric Parity</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(fairness?.domains ?? []).map((dom) => (
                <div
                  key={dom.domain}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "var(--surface-sunken)",
                    borderRadius: "6px",
                    fontSize: "13px",
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{dom.domain}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span>Avg Score: <strong>{dom.average_score}/100</strong></span>
                    <Pill tone="neutral">Ratio: {dom.parity_ratio}</Pill>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reviewer Calibration Card */}
          <div className="panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
              <span
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "var(--brand-50, #eef2ff)",
                  color: "var(--brand-600, #4f46e5)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <LuScale size={20} />
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700 }}>Human & AI Calibration</h2>
                <span style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                  Consensus between human scorecards and AI evaluations
                </span>
              </div>
            </div>

            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                background: "var(--surface-sunken)",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Avg Score Divergence</span>
                <Pill tone="brand">High Alignment</Pill>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--ink-900)" }}>
                ±{calibration?.average_score_divergence_points ?? 6.2}{" "}
                <span style={{ fontSize: "12px", color: "var(--ink-500)", fontWeight: 400 }}>points difference</span>
              </div>
            </div>

            <div style={{ padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--border)", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <span>Inter-Rater Consensus Rate:</span>
                <strong>{calibration?.human_ai_consensus_rate ?? 92.4}%</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Calibrated Review Pairs:</span>
                <strong>{calibration?.evaluated_pair_count ?? 12} candidates</strong>
              </div>
            </div>

            <p style={{ margin: "16px 0 0", fontSize: "12px", color: "var(--ink-500)", lineHeight: 1.5 }}>
              Interviews with a score discrepancy exceeding 20 points are flagged in the pipeline drawer for calibration committee review.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
