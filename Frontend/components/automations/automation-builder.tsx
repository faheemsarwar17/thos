"use client";

import { useState } from "react";
import { LuPlus, LuTrash2, LuFlaskConical } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { Switch } from "@/components/ui/switch";
import { Table, TableContainer } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { useToast } from "@/components/ui/toast-provider";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationRule,
  AutomationRun,
  AutomationTestResult,
  AutomationValue,
} from "@/lib/types";

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
  const toast = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [testResult, setTestResult] = useState<AutomationTestResult | null>(null);
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
    const trigger_config: Record<string, AutomationValue> = {};

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
      toast.error(err instanceof ApiError ? err.message : "Failed to toggle the automation rule.");
    }
  }

  async function deleteRule(ruleId: string) {
    if (!confirm("Are you sure you want to delete this automation rule?")) return;
    try {
      await api.delete(`/api/v1/automations/${ruleId}`);
      await reload();
    } catch (err: unknown) {
      console.error("Failed to delete rule:", err);
      toast.error(err instanceof ApiError ? err.message : "Failed to delete the automation rule.");
    }
  }

  async function runDryTest(ruleId: string) {
    setTestingRuleId(ruleId);
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.post<AutomationTestResult>(`/api/v1/automations/${ruleId}/test`, {});
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
    <div className="dashboard">
      <PageHeader
        title="Automations"
        meta="WHEN / IF / THEN workflows with full audit logs"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              resetForm();
              setIsCreating(true);
            }}
            iconLeft={<LuPlus size={15} />}
          >
            Create automation
          </Button>
        }
      />

      <section aria-labelledby="recipes-heading" className="section">
        <h2 id="recipes-heading" className="section__title">Quick-start recipes</h2>
        <div className="recipe-grid">
          {RECIPES.map((recipe) => (
            <article key={recipe.name} className="recipe-card">
              <h3>{recipe.name}</h3>
              <p>{recipe.description}</p>
              <Button size="sm" variant="secondary" onClick={() => loadRecipe(recipe)}>
                Use this recipe
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel section" aria-labelledby="rules-heading">
        <div className="panel__header">
          <h2 id="rules-heading">Automation rules</h2>
        </div>
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
          <TableContainer>
            <Table className="table--stack">
              <thead>
                <tr>
                  <th scope="col">Rule Name</th>
                  <th scope="col">Trigger (WHEN)</th>
                  <th scope="col">Condition (IF)</th>
                  <th scope="col">Action (THEN)</th>
                  <th scope="col">Executions</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="is-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <th scope="row">
                      <strong className="cell-title">{rule.name}</strong>
                      {rule.description && <span className="cell-sub">{rule.description}</span>}
                    </th>
                    <td data-label="When">
                      <Pill tone="brand">{rule.trigger_event.replace(/_/g, " ")}</Pill>
                    </td>
                    <td data-label="If">
                      <span className="chip-row">
                        {rule.conditions.map((c, i) => (
                          <code key={i} className="chip-code">
                            {c.field} {c.op} {String(c.value)}
                          </code>
                        ))}
                      </span>
                    </td>
                    <td data-label="Then">
                      <span className="chip-row">
                        {rule.actions.map((a, i) => (
                          <code key={i} className="chip-code">{a.type.replace(/_/g, " ")}</code>
                        ))}
                      </span>
                    </td>
                    <td data-label="Runs" className="tabular-nums">
                      <strong>{rule.run_count ?? 0}</strong> runs
                      {rule.last_run_at && <span className="cell-sub">{new Date(rule.last_run_at).toLocaleDateString()}</span>}
                    </td>
                    <td data-label="Status">
                      <Switch
                        checked={!!rule.is_active}
                        onChange={() => void toggleRule(rule.id)}
                        label={<><span className="sr-only">{rule.name}: </span>{rule.is_active ? "Active" : "Paused"}</>}
                      />
                    </td>
                    <td className="is-end">
                      <span className="row-actions">
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
                          className="icon-button icon-button--danger"
                          onClick={() => deleteRule(rule.id)}
                          aria-label={`Delete rule ${rule.name}`}
                        >
                          <LuTrash2 size={16} aria-hidden="true" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </section>

      <section className="panel section" aria-labelledby="runs-heading">
        <div className="panel__header">
          <h2 id="runs-heading">Recent run log</h2>
        </div>
        {runs.length === 0 ? (
          <p className="panel-body panel-note">
            No automations have run yet. Trigger a stage move or click &ldquo;Simulate&rdquo; to test.
          </p>
        ) : (
          <TableContainer>
            <Table className="table--stack">
              <thead>
                <tr>
                  <th scope="col">Executed At</th>
                  <th scope="col">Rule</th>
                  <th scope="col">Trigger Resource</th>
                  <th scope="col">Status</th>
                  <th scope="col">Output Summary</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td data-label="At" className="muted">{new Date(run.executed_at).toLocaleString()}</td>
                    <td data-label="Rule"><strong>{run.rule_name || "Rule"}</strong></td>
                    <td data-label="Resource" className="mono">{run.trigger_resource_id.slice(-8)}</td>
                    <td data-label="Status">
                      <Pill tone={run.status === "completed" ? "verified" : run.status === "skipped" ? "neutral" : "danger"}>
                        {run.status}
                      </Pill>
                    </td>
                    <td data-label="Output" className="muted">{run.execution_log || run.error_message || "Done"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableContainer>
        )}
      </section>

      {isCreating && (
        <Modal
          open={isCreating}
          onClose={() => setIsCreating(false)}
          title="Configure Automation Rule"
          description="Establish a reliable, trigger-based workflow for applicant stage transitions."
        >
          <form onSubmit={handleCreateRule} className="modal-stack">
            {formError && <p className="thread__error" role="alert">{formError}</p>}

            <label className="form-field">
              <span className="form-field__label">Rule Name</span>
              <input
                type="text"
                className="input"
                required
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g. Invite to Interview on Shortlist"
              />
            </label>

            <label className="form-field">
              <span className="form-field__label">Description (Optional)</span>
              <input
                type="text"
                className="input"
                value={ruleDesc}
                onChange={(e) => setRuleDesc(e.target.value)}
                placeholder="Explain the intent of this automation"
              />
            </label>

            <fieldset className="opt-box rule-block">
              <legend className="rule-block__title">WHEN (Trigger Event)</legend>
              <div className="form-grid form-grid--2">
                <label className="form-field">
                  <span className="sr-only">Trigger event</span>
                  <select className="select" value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}>
                    <option value="stage_entered">Candidate Enters Stage</option>
                    <option value="score_threshold">Match Score Threshold</option>
                    <option value="sla_exceeded">Stage SLA Duration Exceeded</option>
                  </select>
                </label>

                {triggerEvent === "stage_entered" && (
                  <label className="form-field">
                    <span className="sr-only">Target stage</span>
                    <select className="select" value={targetStage} onChange={(e) => setTargetStage(e.target.value)}>
                      <option value="received">Received</option>
                      <option value="screened">Screened</option>
                      <option value="shortlisted">Shortlisted</option>
                      <option value="applied_interview">Applied Interview</option>
                      <option value="offer">Offer</option>
                    </select>
                  </label>
                )}

                {triggerEvent === "score_threshold" && (
                  <label className="form-field">
                    <span className="sr-only">Minimum score</span>
                    <input
                      type="number"
                      className="input"
                      min="0"
                      max="100"
                      value={scoreThreshold}
                      onChange={(e) => setScoreThreshold(e.target.value)}
                      placeholder="Min score (e.g. 80)"
                    />
                  </label>
                )}
              </div>
            </fieldset>

            <fieldset className="opt-box rule-block">
              <legend className="rule-block__title">THEN (Dispatched Action)</legend>
              <label className="form-field">
                <span className="sr-only">Action type</span>
                <select className="select" value={actionType} onChange={(e) => setActionType(e.target.value)}>
                  <option value="send_notification">Send In-App Notification</option>
                  <option value="tag_candidate">Tag Candidate Profile</option>
                </select>
              </label>

              {actionType === "send_notification" && (
                <label className="form-field">
                  <span className="sr-only">Notification message</span>
                  <input
                    type="text"
                    className="input"
                    value={actionMessage}
                    onChange={(e) => setActionMessage(e.target.value)}
                    placeholder="Custom notification message text"
                  />
                </label>
              )}

              {actionType === "tag_candidate" && (
                <label className="form-field">
                  <span className="sr-only">Tag name</span>
                  <input
                    type="text"
                    className="input"
                    value={actionTag}
                    onChange={(e) => setActionTag(e.target.value)}
                    placeholder="Tag name (e.g. Star Candidate)"
                  />
                </label>
              )}
            </fieldset>

            <div className="modal-actions">
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

      {testResult && (
        <Modal
          open={!!testResult}
          onClose={() => setTestResult(null)}
          title="Automation Dry-Run Simulation"
          description="Simulated execution against sample application data without executing side effects."
        >
          <div className="modal-stack">
            <div className={testResult.matched ? "note-box note-box--ok" : "note-box"}>
              <div className="app-row app-row--between">
                <strong>
                  Overall Evaluation: {testResult.matched ? "Matched & Triggered" : "Conditions Not Met"}
                </strong>
                <Pill tone={testResult.matched ? "verified" : "neutral"}>
                  {testResult.matched ? "Success" : "Skipped"}
                </Pill>
              </div>
              {testResult.error && <p className="form-error" role="alert">{testResult.error}</p>}
              {testResult.sample_candidate && (
                <p className="panel-note">
                  Evaluated with: <strong>{testResult.sample_candidate}</strong>
                </p>
              )}
            </div>

            <h4>Condition Evaluations:</h4>
            <ul className="kv-list">
              {(testResult.condition_evaluations ?? []).map((c, i) => (
                <li key={i}>
                  <span>
                    {c.field} ({c.actual ?? "null"}) {c.op} {c.expected}
                  </span>
                  <Pill tone={c.matched ? "verified" : "danger"}>
                    {c.matched ? "Pass" : "Fail"}
                  </Pill>
                </li>
              ))}
            </ul>

            {testResult.simulated_actions && testResult.simulated_actions.length > 0 && (
              <>
                <h4>Simulated Actions:</h4>
                <ul className="kv-list">
                  {testResult.simulated_actions.map((act, i) => (
                    <li key={i}>
                      <span><strong>{act.type}:</strong> {act.output}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="modal-actions">
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
