import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("home: KPIs, charts, agenda and links", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  for (const label of ["In flight", "New", "To score", "Hired", "Live jobs"]) await expect(page.locator(".stat-grid").getByText(label, { exact: true })).toBeVisible();
  for (const chart of ["Pipeline funnel", "Requisitions by stage", "Applications received", "Screening scores"])
    await expect(page.getByRole("region", { name: chart })).toBeVisible();
  await expect(page.getByRole("link", { name: "View all jobs" })).toHaveAttribute("href", "/jobs");
  await expect(page.getByRole("link", { name: "New requisition" }).first()).toHaveAttribute("href", "/jobs?create=1");
  await expect(page.getByRole("link", { name: /Join/ })).toHaveAttribute("href", "/interviews/faculty-panel");
  await page.getByRole("region", { name: "Pipeline funnel" }).getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("region", { name: "Pipeline funnel" }).getByRole("table")).toBeVisible();
});
