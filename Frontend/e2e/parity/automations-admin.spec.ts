import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("automations page", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/automations");
  await page.getByRole("button", { name: "Create automation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /Use this recipe/i })).toHaveCount(3);
});

test("admin sections + hash navigation", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Administration sections" });
  for (const s of ["Departments & units", "Staff & roles", "Domain packs", "Hiring workflow", "Email templates", "Audit log", "Organization"])
    await expect(nav.getByRole("button", { name: s })).toBeVisible();
  await page.evaluate(() => { window.location.hash = "#packs"; });
  await expect(nav.getByRole("button", { name: "Domain packs" })).toHaveAttribute("aria-current", "true");
  await nav.getByRole("button", { name: "Organization" }).click();
  await expect(page.getByRole("link", { name: /Register/i })).toHaveAttribute("href", "/register/organization");
});
