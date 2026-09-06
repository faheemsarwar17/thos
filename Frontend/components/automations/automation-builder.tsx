"use client";

import { useState } from "react";
import {
  LuPlay,
  LuPlus,
  LuTrash2,
  LuToggleLeft,
  LuToggleRight,
  LuSparkles,
  LuMail,
  LuBell,
  LuTag,
  LuClock,
  LuCheck,
  LuX,
  LuArrowRight,
  LuHistory,
  LuFlaskConical,
} from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, type PillTone } from "@/components/ui/pill";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { AutomationAction, AutomationCondition, AutomationRule, AutomationRun } from "@/lib/types";

const RECIPES = [
  {
    name: "Invite to Assessment on Shortlist",
    description: "Automatically invite candidate to applied interview when advanced to Shortlisted stage.",
    trigger_event: "stage_entered",
    trigger_config: { target_stage_id: "shortlisted" },
    conditions: [{ field: "stage_id", op: "eq", value: "shortlisted" }],
    actions: [
      { type: "send_notification", config: { title: "Assessment Invitation", message: "Candidate moved to shortlisted. Automated interview invitation queued." } },
      { type: "tag_candidate", config: { tag: "Shortlist Verified" } },
    ],
  },
  {
    name: "Fast-Track High Match Scores",
    description: "Flag candidates with match score >= 85 for priority hiring manager review.",
    trigger_event: "score_threshold",
    trigger_config: { score_field: "job_match_score", threshold: 85 },
    conditions: [{ field: "job_match_score", op: "gte", value: 85 }],
    actions: [
      { type: "tag_candidate", config: { tag: "High Priority Star" } },
      { type: "send_notification", config: { title: "High-Score Candidate Detected", message: "Candidate matched with score >= 85. Fast-track review recommended." } },
    ],
  },
  {
    name: "Screening Stage SLA Aging Alert",
    description: "Alert recruiter when an applicant has spent more than 5 days in Screened stage.",
    trigger_event: "sla_exceeded",
    trigger_config: { target_stage_id: "screened", max_days: 5 },
    conditions: [{ field: "days_in_stage", op: "gte", value: 5 }],
    actions: [
      { type: "send_notification", config: { title: "SLA Warning", message: "Application in Screened stage has exceeded 5-day SLA target." } },
    ],
  },
];

export function AutomationBuilder() {
  const [isCreating, setIsCreating] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Form State
  const [ruleName, setRuleName] = useState("");
  const [ruleDesc, setRuleDesc] = useState("");
  const [triggerEvent, setTriggerEvent] = useState("stage_entered");
  const [targetStage, setTargetStage] = useState("shortlisted");
  const [scoreThreshold, setScoreThreshold] = useState("80");
  const [actionType, setActionType] = useState("send_notification");
  const [actionMessage, setActionMessage] = useState("");
  const [actionTag, setActionTag] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, loading, reload } = useApi<{
    rules: AutomationRule[];
    runs: AutomationRun[];
  }>("/api/v1/automations");

  const rules = data?.rules ?? [];
  const runs = data?.runs ?? [];

  function loadRecipe(recipe: typeof RECIPES[0]) {
    setRuleName(recipe.name);
    setRuleDesc(recipe.description);
    setTriggerEvent(recipe.trigger_event);
    if (recipe.trigger_config.target_stage_id) setTargetStage(recipe.trigger_config.target_stage_id);
    if (recipe.trigger_config.threshold) setScoreThreshold(String(recipe.trigger_config.threshold));
    const firstAction = recipe.actions[0];
    setActionType(firstAction.type);
    const cfg = firstAction.config as Record<string, string | undefined>;
    if (cfg.message) setActionMessage(cfg.message);
    if (cfg.tag) setActionTag(cfg.tag);
    setIsCreating(true);
  }

  async function handleCreateRule(e: React.FormEvent) {
    e.preventDefault();
    if (!ruleName.trim()) {
      setFormError("Rule name is required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const conditions: AutomationCondition[] = [];
    const trigger_config: Record<string, any> = {};

    if (triggerEvent === "stage_entered") {
      trigger_config.target_stage_id = targetStage;
      conditions.push({ field: "stage_id", op: "eq", value: targetStage });
    } else if (triggerEvent === "score_threshold") {
      trigger_config.threshold = Number(scoreThreshold);
      conditions.push({ field: "job_match_score", op: "gte", value: Number(scoreThreshold) });
    } else if (triggerEvent === "sla_exceeded") {
      trigger_config.target_stage_id = targetStage;
      trigger_config.max_days = 5;
      conditions.push({ field: "days_in_stage", op: "gte", value: 5 });
    }

    const actions: AutomationAction[] = [];
    if (actionType === "send_notification") {
      actions.push({
        type: "send_notification",
        config: { title: ruleName, message: actionMessage || "Automated notification triggered." },
      });
    } else if (actionType === "tag_candidate") {
      actions.push({
        type: "tag_candidate",
        config: { tag: actionTag || "Automated Tag" },
      });
    }

    try {
      await api.post("/api/v1/automations", {
        name: ruleName.trim(),
        description: ruleDesc.trim(),
        trigger_event: triggerEvent,
        trigger_config,
        conditions,
        actions,
      });
      setIsCreating(false);
      resetForm();
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Failed to create automation rule.";
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setRuleName("");
    setRuleDesc("");
    setTriggerEvent("stage_entered");
    setTargetStage("shortlisted");
    setScoreThreshold("80");
    setActionType("send_notification");
    setActionMessage("");
    setActionTag("");
    setFormError(null);
  }

  async function toggleRule(ruleId: string) {
    try {
      await api.post(`/api/v1/automations/${ruleId}/toggle`, {});
      await reload();
    } catch (err: unknown) {
      console.error("Failed to toggle rule:", err);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm("Are you sure you want to delete this automation rule?")) return;
    try {
      await api.delete(`/api/v1/automations/${ruleId}`);
      await reload();
    } catch (err: unknown) {
      console.error("Failed to delete rule:", err);
    }
  }

  async function runDryTest(ruleId: string) {
    setTestingRuleId(ruleId);
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<any>(`/api/v1/automations/${ruleId}/test`, {});
      setTestResult(res);
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Failed to run simulation.";
      setTestResult({ error: msg });
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header with Create Action */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>Hiring Workflow Automations</h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-500)" }}>
            WHEN / IF / THEN deterministic workflows with zero silent rejections and full audit logs
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            resetForm();
            setIsCreating(true);
          }}
          iconLeft={<LuPlus size={15} />}
        >
          Create Automation
        </Button>
      </div>

      {/* Pre-built Recipes Gallery */}
      <div className="panel" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <LuSparkles size={18} style={{ color: "var(--brand-600)" }} />
          <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Quick Start Automation Recipes</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
          {RECIPES.map((recipe) => (
            <div
              key={recipe.name}
              style={{
                padding: "16px",
                borderRadius: "10px",
                background: "var(--surface-sunken)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong style={{ fontSize: "14px", color: "var(--ink-900)" }}>{recipe.name}</strong>
                <p style={{ margin: "6px 0 12px", fontSize: "12px", color: "var(--ink-600)", lineHeight: 1.4 }}>
                  {recipe.description}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => loadRecipe(recipe)}>
                Use This Recipe
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Rules List Panel */}
      <div className="panel" style={{ padding: "24px" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 700 }}>Active Automation Rules</h3>

        {loading && !data ? (
          <LoadingState label="Loading automations…" />
        ) : error && !data ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : rules.length === 0 ? (
          <EmptyState
            title="No automation rules defined"
            description="Create your first rule or pick a quick-start recipe above to automate stage notifications and task assignments."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--ink-500)" }}>
                  <th style={{ padding: "10px 12px" }}>Rule Name</th>
                  <th style={{ padding: "10px 12px" }}>Trigger (WHEN)</th>
                  <th style={{ padding: "10px 12px" }}>Condition (IF)</th>
                  <th style={{ padding: "10px 12px" }}>Action (THEN)</th>
                  <th style={{ padding: "10px 12px" }}>Executions</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px" }}>
                      <strong style={{ display: "block", color: "var(--ink-900)" }}>{rule.name}</strong>
                      {rule.description && (
                        <span style={{ fontSize: "11px", color: "var(--ink-400)" }}>{rule.description}</span>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <Pill tone="brand">{rule.trigger_event.replace(/_/g, " ")}</Pill>
                    </td>
                    <td style={{ padding: "12px" }}>
                      {rule.conditions.map((c, i) => (
                        <span key={i} style={{ fontSize: "12px", background: "var(--surface-sunken)", padding: "2px 6px", borderRadius: "4px", margin: "2px" }}>
                          {c.field} {c.op} {String(c.value)}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: "12px" }}>
                      {rule.actions.map((a, i) => (
                        <span key={i} style={{ fontSize: "12px", background: "var(--surface-sunken)", padding: "2px 6px", borderRadius: "4px", margin: "2px" }}>
                          {a.type.replace(/_/g, " ")}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: "12px", fontVariantNumeric: "tabular-nums" }}>
                      <strong>{rule.run_count ?? 0}</strong> runs
                      {rule.last_run_at && (
                        <span style={{ display: "block", fontSize: "11px", color: "var(--ink-400)" }}>
                          {new Date(rule.last_run_at).toLocaleDateString()}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <button
                        type="button"
                        onClick={() => toggleRule(rule.id)}
                        style={{ background: "none", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                      >
                        <Pill tone={rule.is_active ? "verified" : "neutral"}>
                          {rule.is_active ? "Active" : "Paused"}
                        </Pill>
                      </button>
                    </td>
                    <td style={{ padding: "12px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => runDryTest(rule.id)}
                          loading={isTesting && testingRuleId === rule.id}
                          iconLeft={<LuFlaskConical size={13} />}
                        >
                          Simulate
                        </Button>
                        <button
                          type="button"
                          onClick={() => deleteRule(rule.id)}
                          style={{
                            background: "none",
                            border: 0,
                            cursor: "pointer",
                            padding: "6px",
                            color: "var(--danger-700, #b91c1c)",
                          }}
                          aria-label="Delete rule"
                        >
                          <LuTrash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Run Logs Panel */}
      <div className="panel" style={{ padding: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          <LuHistory size={18} style={{ color: "var(--ink-500)" }} />
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Recent Automation Run Log</h3>
        </div>

        {runs.length === 0 ? (
          <p style={{ margin: 0, color: "var(--ink-400)", fontSize: "13px" }}>
            No automations have run yet. Trigger a stage move or click "Simulate" to test.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--ink-500)" }}>
                  <th style={{ padding: "8px 10px" }}>Executed At</th>
                  <th style={{ padding: "8px 10px" }}>Rule</th>
                  <th style={{ padding: "8px 10px" }}>Trigger Resource</th>
                  <th style={{ padding: "8px 10px" }}>Status</th>
                  <th style={{ padding: "8px 10px" }}>Output Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px", color: "var(--ink-400)" }}>
                      {new Date(run.executed_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{run.rule_name || "Rule"}</td>
                    <td style={{ padding: "10px", fontFamily: "monospace" }}>{run.trigger_resource_id.slice(-8)}</td>
                    <td style={{ padding: "10px" }}>
                      <Pill tone={run.status === "completed" ? "verified" : run.status === "skipped" ? "neutral" : "danger"}>
                        {run.status}
                      </Pill>
                    </td>
                    <td style={{ padding: "10px", color: "var(--ink-600)" }}>
                      {run.execution_log || run.error_message || "Done"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create/Edit Automation Rule */}
      {isCreating && (
        <Modal
          open={isCreating}
          onClose={() => setIsCreating(false)}
          title="Configure Automation Rule"
          description="Establish a reliable, trigger-based workflow for applicant stage transitions."
        >
          <form onSubmit={handleCreateRule} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {formError && (
              <div style={{ padding: "10px 12px", background: "#fee2e2", color: "#991b1b", borderRadius: "8px", fontSize: "13px" }}>
                {formError}
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                Rule Name
              </label>
              <input
                type="text"
                required
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. Invite to Interview on Shortlist"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink-800)",
                  fontSize: "13px",
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                Description (Optional)
              </label>
              <input
                type="text"
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="Explain the intent of this automation"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--ink-800)",
                  fontSize: "13px",
                }}
              />
            </div>

            {/* WHEN Trigger */}
            <div style={{ padding: "14px", borderRadius: "8px", background: "var(--surface-sunken)", border: "1px solid var(--border)" }}>
              <strong style={{ fontSize: "13px", color: "var(--brand-700)", textTransform: "uppercase" }}>
                WHEN (Trigger Event)
              </strong>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "8px" }}>
                <div>
                  <select
                    value={triggerEvent}
                    onChange={(e) => setTriggerEvent(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--ink-800)",
                      fontSize: "13px",
                    }}
                  >
                    <option value="stage_entered">Candidate Enters Stage</option>
                    <option value="score_threshold">Match Score Threshold</option>
                    <option value="sla_exceeded">Stage SLA Duration Exceeded</option>
                  </select>
                </div>

                {triggerEvent === "stage_entered" && (
                  <div>
                    <select
                      value={targetStage}
                      onChange={(e) => setTargetStage(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--ink-800)",
                        fontSize: "13px",
                      }}
                    >
                      <option value="received">Received</option>
                      <option value="screened">Screened</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="applied_interview">Applied Interview</option>
                      <option value="offer">Offer</option>
                    </select>
                  </div>
                )}

                {triggerEvent === "score_threshold" && (
                  <div>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(e.target.value)}
                      placeholder="Min score (e.g. 80)"
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--ink-800)",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* THEN Actions */}
            <div style={{ padding: "14px", borderRadius: "8px", background: "var(--surface-sunken)", border: "1px solid var(--border)" }}>
              <strong style={{ fontSize: "13px", color: "var(--brand-700)", textTransform: "uppercase" }}>
                THEN (Dispatched Action)
              </strong>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "var(--ink-800)",
                    fontSize: "13px",
                  }}
                >
                  <option value="send_notification">Send In-App Notification</option>
                  <option value="tag_candidate">Tag Candidate Profile</option>
                </select>

                {actionType === "send_notification" && (
                  <input
                    type="text"
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    placeholder="Custom notification message text"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--ink-800)",
                      fontSize: "13px",
                    }}
                  />
                )}

                {actionType === "tag_candidate" && (
                  <input
                    type="text"
                    value={actionTag}
                    onChange={(e) => setActionTag(e.target.value)}
                    placeholder="Tag name (e.g. Star Candidate)"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--ink-800)",
                      fontSize: "13px",
                    }}
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
              <Button variant="secondary" onClick={() => setIsCreating(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={isSubmitting}>
                Save Automation Rule
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Simulation / Dry-Run Result */}
      {testResult && (
        <Modal
          open={!!testResult}
          onClose={() => setTestResult(null)}
          title="Automation Dry-Run Simulation"
          description="Simulated execution against sample application data without executing side effects."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div
              style={{
                padding: "14px",
                borderRadius: "8px",
                background: testResult.matched ? "#dcfce7" : "var(--surface-sunken)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "14px", color: testResult.matched ? "#166534" : "var(--ink-800)" }}>
                  Overall Evaluation: {testResult.matched ? "Matched & Triggered" : "Conditions Not Met"}
                </strong>
                <Pill tone={testResult.matched ? "verified" : "neutral"}>
                  {testResult.matched ? "Success" : "Skipped"}
                </Pill>
              </div>
              {testResult.sample_candidate && (
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--ink-600)" }}>
                  Evaluated with: <strong>{testResult.sample_candidate}</strong>
                </p>
              )}
            </div>

            <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>Condition Evaluations:</h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {(testResult.condition_evaluations ?? []).map((c: any, i: number) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--surface-sunken)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  <span>
                    {c.field} ({c.actual ?? "null"}) {c.op} {c.expected}
                  </span>
                  <Pill tone={c.matched ? "verified" : "danger"}>
                    {c.matched ? "Pass" : "Fail"}
                  </Pill>
                </div>
              ))}
            </div>

            {testResult.simulated_actions && testResult.simulated_actions.length > 0 && (
              <>
                <h4 style={{ margin: "10px 0 0", fontSize: "13px", fontWeight: 600 }}>Simulated Actions:</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {testResult.simulated_actions.map((act: any, i: number) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px 12px",
                        background: "var(--surface-sunken)",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                    >
                      <strong>{act.type}:</strong> {act.output}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
              <Button variant="secondary" onClick={() => setTestResult(null)}>
                Close Simulator
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
