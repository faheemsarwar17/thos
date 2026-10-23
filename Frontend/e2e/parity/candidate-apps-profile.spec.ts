import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";
test("applications journey", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/applications");
  const card = page.locator(".journey").first();
  await expect(card.getByRole("list", { name: "Progress" })).toBeVisible();
  await card.getByRole("button", { name: "Details" }).click();
  await expect(card.getByRole("button", { name: "Details" })).toHaveAttribute("aria-expanded", "true");
  const withdraw = card.getByRole("button", { name: "Withdraw" });
  if (await withdraw.count()) {
    await withdraw.click();
    await expect(page.getByRole("dialog", { name: /Withdraw application/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
test("profile settings sections", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto("/candidate/profile#privacy");
  await expect(page.getByRole("switch", { name: /Let employers discover me/ })).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: /Parse/ })).toBeVisible();
  await page.getByRole("button", { name: "Photo" }).click();
  await expect(page.getByText(/Upload photo/)).toBeVisible();
});
