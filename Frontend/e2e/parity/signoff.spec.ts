// Parity sign-off: inventory items the per-screen specs don't reach. Read-only; where the seed data lacks
// a state (no automation rules, no draft with a question pool), the GET response is mocked instead.
import { API, apiLogin, expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("auth: login errors and redirect, register and org application fields", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "public");
  await page.goto("/login");
  await expect(page.getByRole("link", { name: /Candidate Registration/i })).toHaveAttribute("href", "/register");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: /^Sign in/i }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await page.getByRole("button", { name: /Candidate/ }).click();
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: /^Sign in/i }).click();
  await expect(page).toHaveURL(/\/candidate$/);

  await page.evaluate(() => window.localStorage.clear());
  await page.goto("/register");
  for (const label of ["Full Legal Name", "Email Address", "Password"]) await expect(page.getByLabel(label)).toBeVisible();
  await expect(page.getByRole("link", { name: /Sign In/i }).first()).toHaveAttribute("href", "/login");

  await page.goto("/register/organization");
  for (const label of [
    "Your Full Name", "Your Work Email", "Password", /Organization \/ Display Name/, "Legal Entity Name", /Company Domain/,
    /Official Contact Email/, /Contact Phone/, "Registration / Tax Number", /Physical \/ Registered Office Address/,
  ])
    await expect(page.getByLabel(label).first()).toBeVisible();
});

test("employer route guard sends candidates to their portal", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/candidate$/);
});

test("signed-out visitors are sent to login", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "public");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login$/);
});

test("jobs table columns and links", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/jobs");
  const table = page.getByRole("table").first();
  for (const col of ["Job Requisition", "Candidates", "Status", "Question Pool", "Pinned Pack"])
    await expect(table.getByRole("columnheader", { name: col })).toBeVisible();
  await expect(table.locator('a[href^="/jobs/pst_"]').first()).toBeVisible();
});

test("job detail: draft pool curation, lock confirm, publish gate, sandbox panel", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const emp = await apiLogin("employer");
  const list = (await (await fetch(`${API}/api/v1/postings`, { headers: { authorization: `Bearer ${emp.access_token}` } })).json()) as {
    postings: { id: string; pool_status: string }[];
  };
  const postingId = list.postings.find((p) => p.pool_status === "locked")?.id;
  test.skip(!postingId, "no posting with a locked pool");
  await signIn(page, "employer");
  await readOnly(page);
  // Present a published, locked posting as a draft with an editable pool.
  await page.route(`${API}/api/v1/postings/${postingId}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    const body = await res.json();
    const posting = body.posting ?? body;
    posting.status = "draft";
    posting.pool_status = "draft";
    return route.fulfill({ response: res, json: body });
  });
  await page.goto(`/jobs/${postingId}`);
  await expect(page.getByRole("heading", { name: "Interview Question Pool" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Publish/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Move question 1 up" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Remove question 1" })).toBeVisible();
  await page.getByRole("button", { name: "Move question 1 down" }).click();
  await expect(page.getByRole("button", { name: /Save Curation/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lock & Finalize Pool/ })).toBeDisabled();
  await page.getByRole("button", { name: /Discard changes/ }).click();
  await page.getByRole("button", { name: /Lock & Finalize Pool/ }).click();
  await expect(page.getByRole("dialog", { name: "Lock Question Pool?" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Proctored Sandbox" })).toBeVisible();
  await page.getByRole("button", { name: /Configure Sandbox|Enable Sandbox/ }).click();
  await expect(page.getByLabel(/Time limit/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job Description" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Job Metadata" })).toBeVisible();
});

test("pipeline: transition dialog, shortlist and invite modals, bulk reject, drawer tabs", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/pipeline");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Board" }).click();

  const move = page.locator("select").filter({ has: page.locator("option", { hasText: "Move stage…" }) }).first();
  const dest = await move.locator("option").nth(1).getAttribute("value");
  await move.selectOption(dest!);
  const dialog = page.getByRole("dialog", { name: /^Move / });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Reason Code/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Actions" }).click();
  const shortlist = page.getByRole("button", { name: /Auto-shortlist top N|Shortlist selected/ });
  if (await shortlist.isEnabled()) {
    await shortlist.click();
    await expect(page.getByRole("dialog", { name: /Shortlist/ })).toBeVisible();
    await page.keyboard.press("Escape");
  } else await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Actions" }).click();
  const invite = page.getByRole("button", { name: /Invite top N|Invite selected/ });
  if (await invite.isEnabled()) {
    await invite.click();
    await expect(page.getByRole("dialog", { name: /Invite/ })).toBeVisible();
    await page.keyboard.press("Escape");
  } else await page.keyboard.press("Escape");

  await page.locator(".cand-card input[type=checkbox]").first().check();
  const bulk = page.getByRole("region", { name: "Bulk candidate operations" }).or(page.locator('[aria-label="Bulk candidate operations"]'));
  await expect(bulk.first()).toBeVisible();
  await page.getByRole("button", { name: /^Reject…/ }).click();
  await expect(page.getByRole("dialog", { name: /Reject 1 Candidates/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/^pipeline_candidates_export_\d{4}-\d{2}-\d{2}\.csv$/);
  await page.getByRole("button", { name: "Clear" }).click();

  test.skip(!ids.applicationId, "no application");
  await page.goto(`/pipeline?applicationId=${ids.applicationId}`);
  const drawer = page.getByRole("dialog");
  for (const tab of ["Overview & Match", "Job Interview", "Scorecards", "Messages", "Audit Trail"])
    await expect(drawer.getByRole("tab", { name: new RegExp(tab) })).toBeVisible();
  await drawer.getByRole("tab", { name: /Scorecards/ }).click();
  await expect(drawer.getByRole("button", { name: "Save Scorecard" })).toBeVisible();
  await drawer.getByRole("button", { name: "Decide…" }).click();
  for (const d of [/offer email/, /Second-round/, /Onsite interview/]) await expect(page.getByText(d)).toBeVisible();
  await drawer.getByRole("button", { name: "Decide…" }).click();
  await drawer.getByRole("tab", { name: /Audit Trail/ }).click();
  await drawer.getByRole("tab", { name: /Messages/ }).click();
  await expect(drawer.getByRole("tab", { name: /Messages/ })).toHaveAttribute("aria-selected", "true");
});

test("analytics bottleneck inspect links to the drawer", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/analytics");
  for (const kpi of ["Time to hire", "Active pipeline", "Offer acceptance", "Requisitions"]) await expect(page.getByText(kpi).first()).toBeVisible();
  await page.getByRole("group", { name: "Section" }).getByRole("button", { name: "SLA & bottlenecks" }).click();
  const inspect = page.getByRole("link", { name: /Inspect/ });
  if (await inspect.count()) await expect(inspect.first()).toHaveAttribute("href", /\/pipeline\?applicationId=/);
  await expect(page.getByRole("heading", { name: "Stage duration & SLA targets" })).toBeVisible();
});

test("messages: search, thread, View Application deep link", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/messages");
  await page.getByRole("heading", { level: 1, name: "Messages" }).waitFor();
  await page.waitForTimeout(800);
  test.skip((await page.locator(".msg__item").count()) === 0, "no conversations seeded");
  await expect(page.getByRole("link", { name: /View Application/ })).toHaveAttribute("href", /\/pipeline\?applicationId=/);
  await page.getByPlaceholder(/Search/i).fill("zzzz-no-match");
  await expect(page.getByText("No matching conversations found.")).toBeVisible();
});

test("automations: rules table, simulate, run log, rule modal fields", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  const now = new Date().toISOString();
  await page.route(`${API}/api/v1/automations`, (route) =>
    route.request().method() !== "GET"
      ? route.fallback()
      : route.fulfill({
          json: {
            rules: [{
              id: "aut_e2e", tenant_id: "t", name: "Fast-track e2e", description: "mocked", trigger_event: "score_threshold",
              trigger_config: { min_score: 80 }, conditions: [{ field: "score", op: "gte", value: 80 }],
              actions: [{ type: "tag_candidate", config: { tag: "Star" } }], is_active: 1, created_by: "u", created_at: now,
              updated_at: now, run_count: 2, last_run_at: now,
            }],
            runs: [{ id: "run_e2e", tenant_id: "t", rule_id: "aut_e2e", rule_name: "Fast-track e2e", trigger_resource_id: "app_x",
              status: "completed", execution_log: "tagged", executed_at: now }],
          },
        }),
  );
  await page.route(`${API}/api/v1/automations/aut_e2e/test`, (route) =>
    route.fulfill({ json: { matched: true, sample_candidate: "Sample Person",
      condition_evaluations: [{ field: "score", op: "gte", expected: 80, actual: 91, matched: true }],
      simulated_actions: [{ type: "tag_candidate", output: "Would tag Star" }] } }),
  );
  await page.goto("/automations");
  await expect(page.getByRole("rowheader", { name: /Fast-track e2e/ })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Fast-track e2e/ })).toBeChecked();
  await expect(page.getByRole("button", { name: "Delete rule Fast-track e2e" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent run log" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate" }).click();
  const sim = page.getByRole("dialog", { name: "Automation Dry-Run Simulation" });
  await expect(sim.getByText("Sample Person")).toBeVisible();
  await expect(sim.getByText("Would tag Star")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create automation" }).click();
  const modal = page.getByRole("dialog", { name: "Configure Automation Rule" });
  await expect(modal.getByLabel(/Rule Name/)).toBeVisible();
  await expect(modal.getByLabel(/Trigger event/)).toBeVisible();
  await expect(modal.getByLabel(/Action type/)).toBeVisible();
});

test("admin: each section's forms", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/admin#units");
  await expect(page.getByRole("button", { name: /Add unit/ })).toBeVisible();
  await page.goto("/admin#members");
  await expect(page.getByRole("button", { name: /Create staff user/ })).toBeVisible();
  await page.goto("/admin#workflows");
  await expect(page.getByText("Always included", { exact: true })).toBeVisible();
  await expect(page.getByText("Pipeline preview", { exact: true })).toBeVisible();
  await page.goto("/admin#emails");
  await expect(page.getByText(/Customized|Default/).first()).toBeVisible();
  await page.goto("/admin#audit");
  await expect(page.getByRole("heading", { name: /Audit log/i }).first()).toBeVisible();
  await page.goto("/admin#packs");
  await expect(page.getByRole("heading", { name: /Domain packs/i }).first()).toBeVisible();
});

test("candidate applications: scores, timeline and next step", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/applications");
  const card = page.locator(".journey").first();
  await expect(card.getByText("Overall match")).toBeVisible();
  await card.getByRole("button", { name: "Details" }).click();
  await expect(card.locator(".timeline").first()).toBeVisible();
});

test("candidate profile: fields, consents, CV paste", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/profile");
  for (const label of ["Professional Headline", "Executive Summary", /Core Skills/, /Credentials/]) await expect(page.getByLabel(label)).toBeVisible();
  await page.getByRole("button", { name: "Privacy" }).click();
  await expect(page.getByRole("switch", { name: /Process my applications/ })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByLabel(/Or Paste Resume Plain Text/)).toBeVisible();
  await expect(page.getByLabel(/Upload Resume File/)).toBeAttached();
});

test("legacy interview lobby", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "public");
  await readOnly(page);
  await page.goto("/interviews/faculty-panel");
  await expect(page.getByLabel(/Your name/)).toBeVisible();
  await page.getByLabel(/Your name/).fill("E2E Viewer");
  await page.getByRole("button", { name: /Join/ }).click();
  await expect(page.getByText(/Unable to join/)).toBeVisible();
  const res = await page.goto("/interviews/bad%20room!");
  expect(res?.status()).toBe(404);
});

test("candidate API session survives a token refresh", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const s = await apiLogin("candidate");
  await page.addInitScript((sess) => {
    window.localStorage.setItem("thos.access_token", "expired-token");
    window.localStorage.setItem("thos.refresh_token", sess.refresh_token);
    window.localStorage.setItem("thos.session", JSON.stringify(sess));
  }, s);
  await readOnly(page);
  await page.goto("/candidate");
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("thos.access_token"))).not.toBe("expired-token");
});

test("pipeline: posting filter, board drag and drop, table view, blocked move shows an error", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const emp = await apiLogin("employer");
  const list = (await (await fetch(`${API}/api/v1/postings`, { headers: { authorization: `Bearer ${emp.access_token}` } })).json()) as {
    postings: { id: string; status: string }[];
  };
  const postingId = list.postings.find((p) => p.status === "published")!.id;
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto(`/pipeline?posting=${postingId}`);
  await expect(page.getByLabel("Filter by job requisition")).toHaveValue(postingId);
  await expect(page.getByRole("complementary", { name: "Requisitions" }).locator(`a[href="/pipeline?posting=${postingId}"]`)).toBeVisible();

  await page.goto("/pipeline");
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Board" }).click();
  const card = page.locator(".cand-card[draggable=true]").first();
  const dialog = page.getByRole("dialog", { name: /^Move / });
  for (const lane of await page.locator("section.lane").all()) {
    await card.dragTo(lane);
    if (await dialog.isVisible()) break;
  }
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").first().fill("e2e_reason");
  await dialog.getByRole("button", { name: /Confirm/ }).click();
  await expect(dialog.getByRole("alert").or(page.getByRole("alert")).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Table" }).click();
  await page.getByRole("checkbox", { name: "Select all candidates" }).check();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("table").locator("tbody button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("talent filter fields", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/talent");
  const search = page.getByRole("search");
  await expect(search.getByPlaceholder(/Keywords/)).toBeVisible();
  await expect(search.getByPlaceholder("Min score")).toBeVisible();
  await expect(search.locator("select")).toContainText("Any Domain Pack");
});

test("candidate jobs: description expand and process", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/jobs");
  const card = page.locator(".job-card").first();
  await expect(card.getByText(/Process:/)).toBeVisible();
  const more = card.getByRole("button", { name: /Read full description/ });
  if (await more.count()) {
    await more.click();
    await expect(card.getByRole("button", { name: "Show less" })).toBeVisible();
  }
});
