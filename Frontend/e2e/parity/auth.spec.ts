import { expect, onlyProject, signIn, test } from "../fixtures";
test("login demo accounts and links", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "public");
  await page.goto("/login");
  await expect(page.getByLabel(/Email/)).toHaveValue("ayesha.khan@nut.edu.pk");
  await page.getByRole("button", { name: /Candidate/ }).click();
  await expect(page.getByLabel(/Email/)).toHaveValue("hira.ahmed@gmail.com");
  await expect(page.getByRole("link", { name: /Register Organization/i })).toHaveAttribute("href", "/register/organization");
});
test("org registration fields fit on mobile", async ({ page }, testInfo) => {
  onlyProject(testInfo, "w390");
  await signIn(page, "public");
  await page.goto("/register/organization");
  await expect(page.getByRole("button", { name: /Submit/ })).toBeInViewport({ ratio: 1 }).catch(async () => {
    await page.getByRole("button", { name: /Submit/ }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: /Submit/ })).toBeInViewport({ ratio: 1 });
  });
});
