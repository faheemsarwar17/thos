import { expect, onlyProject, readOnly, signIn, test } from "../fixtures";

test("talent filters and results", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "employer");
  await readOnly(page);
  await page.goto("/talent");
  await expect(page.getByRole("search")).toBeVisible();
  await page.getByRole("button", { name: /Display all discoverable talent/i }).click();
  await expect(page.locator(".talent-card").first()).toBeVisible();
});

for (const [persona, path] of [["employer", "/messages"], ["candidate", "/candidate/messages"]] as const) {
  test(`${persona} messages: desktop two panes, composer visible`, async ({ page }, testInfo) => {
    onlyProject(testInfo);
    await signIn(page, persona);
    await readOnly(page);
    await page.goto(path);
    await page.getByRole("heading", { level: 1, name: "Messages" }).waitFor();
    await page.waitForTimeout(800);
    test.skip((await page.locator(".msg__item").count()) === 0, "no conversations seeded");
    await expect(page.getByRole("textbox").last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });
  test(`${persona} messages: mobile list → thread → back`, async ({ page }, testInfo) => {
    onlyProject(testInfo, "w390");
    await signIn(page, persona);
    await readOnly(page);
    await page.goto(path);
    const first = page.locator(".msg__item").first();
    test.skip((await first.count()) === 0, "no conversations seeded");
    await first.click();
    await expect(page.getByRole("button", { name: "Send" })).toBeInViewport();
    await page.getByRole("button", { name: "Back to conversations" }).click();
    await expect(first).toBeVisible();
  });
}
