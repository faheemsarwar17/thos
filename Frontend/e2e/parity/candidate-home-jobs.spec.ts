import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";
test("candidate home", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate");
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText(/Your next step|You're all caught up/)).toBeVisible();
  for (const t of ["Profile screening", "Active applications", "Discoverable"]) await expect(page.getByText(t, { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Suggested jobs" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Edit profile/i })).toHaveAttribute("href", "/candidate/profile");
});
test("candidate jobs", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/jobs");
  await expect(page.locator(".job-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply now/i }).or(page.getByText("Applied")).first()).toBeVisible();
});
