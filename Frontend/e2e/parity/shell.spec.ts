import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("employer rail, palette, notifications, sign-out", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/");
  const rail = page.getByRole("navigation", { name: "Primary", exact: true });
  for (const name of ["Home", "Jobs", "Pipeline", "Talent", "Messages", "Analytics", "Interviews", "Automations", "Administration"])
    await expect(rail.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Requisitions" })).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(page.getByRole("link", { name: "Open audit log" })).toHaveAttribute("href", "/admin#audit");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("mobile bottom tabs and More sheet", async ({ page }, testInfo) => {
  onlyProject(testInfo, "w390");
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Primary (mobile)" });
  await expect(tabs.getByRole("link", { name: "Pipeline" })).toBeVisible();
  await tabs.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("dialog", { name: "More navigation" }).getByRole("link", { name: "Administration" })).toBeVisible();
});

test("candidate shell", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate");
  const rail = page.getByRole("navigation", { name: "Primary", exact: true });
  for (const name of ["Home", "Jobs", "Applications", "Messages", "Screening", "Profile"]) await expect(rail.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse jobs" })).toBeVisible();
});
