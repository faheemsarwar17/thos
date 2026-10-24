import { expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("jobs list and create drawer", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { level: 1, name: "Jobs" })).toBeVisible();
  await page.getByRole("link", { name: "New job" }).first().click();
  await expect(page).toHaveURL(/create=1/);
  const drawer = page.getByRole("dialog", { name: "New requisition" });
  for (const label of ["Job Title", "Location", "Work Mode", /Domain Pack/, /Job Description/]) await expect(drawer.getByLabel(label).first()).toBeVisible();
  await expect(drawer.getByRole("button", { name: /Auto-generate with AI/ })).toBeVisible();
  await drawer.getByLabel(/Proctored Practical Assessment Sandbox/).check();
  await expect(drawer.getByLabel(/Time Limit/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/jobs$/);
});

test("job detail controls", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto(`/jobs/${ids.postingId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open Pipeline/i })).toHaveAttribute("href", new RegExp(`posting=${ids.postingId}`));
  await expect(page.getByText(/Question Pool/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /copy/i })).toBeVisible();
});
