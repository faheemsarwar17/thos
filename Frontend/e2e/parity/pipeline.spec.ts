import { expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("pipeline: views, blind review, actions menu, bulk bar, deep link", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/pipeline");
  await expect(page.getByRole("heading", { level: 1, name: "Pipeline" })).toBeVisible();
  const view = page.getByRole("group", { name: "View" });
  await expect(view.getByRole("button", { name: "Funnel" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Stages" })).toBeVisible();
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("button", { name: /Screen all received/ })).toBeVisible();
  await page.keyboard.press("Escape");
  const firstName = page.locator(".cand-card__name").first();
  const realName = await firstName.textContent();
  await page.getByRole("switch", { name: "Blind review" }).check();
  await expect(page.locator(".cand-card__name").first()).toHaveText(/Candidate #/);
  await page.getByRole("switch", { name: "Blind review" }).uncheck();
  await expect(page.locator(".cand-card__name").first()).toHaveText(realName ?? "");
  await page.locator(".cand-card input[type=checkbox]").first().check();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await view.getByRole("button", { name: "Board" }).click();
  await expect(page.getByRole("region", { name: /Received/ }).first()).toBeVisible();
  await view.getByRole("button", { name: "Table" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  if (ids.applicationId) {
    await page.goto(`/pipeline?applicationId=${ids.applicationId}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/pipeline$/);
  }
});
