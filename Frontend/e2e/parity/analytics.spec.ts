import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";
test("analytics tabs", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/analytics");
  const section = page.getByRole("group", { name: "Section" });
  await expect(page.getByRole("region", { name: "Hiring funnel" })).toBeVisible();
  await section.getByRole("button", { name: "SLA & bottlenecks" }).click();
  await expect(page.getByText(/Healthy|Warning|Critical|within SLA/i).first()).toBeVisible();
  await section.getByRole("button", { name: "Fairness & calibration" }).click();
  await expect(page.getByText(/parity/i).first()).toBeVisible();
});
