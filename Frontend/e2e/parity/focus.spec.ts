import { expect, onlyProject, readOnly, resolveIds, signIn, test } from "../fixtures";

test("screening uses focus layout (no app rail)", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  await signIn(page, "candidate");
  await readOnly(page); // attempt creation is blocked → launcher shows its error card, still inside the focus layout
  await page.goto("/candidate/interview");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText("Skill screening").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Exit" })).toHaveAttribute("href", "/candidate");
});

test("sandbox lobby", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  test.skip(!ids.attemptId, "no applied interview attempt in seed data");
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto(`/candidate/sandbox/${ids.attemptId}`);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText(/Before you begin|No sandbox required|submitted|Assessment/i).first()).toBeVisible();
});

test("applied interview page renders inside focus layout", async ({ page }, testInfo) => {
  onlyProject(testInfo);
  const ids = await resolveIds();
  test.skip(!ids.attemptId, "no attempt");
  await signIn(page, "candidate");
  await readOnly(page);
  await page.goto(`/candidate/applied/${ids.attemptId}`);
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByText(/Job interview/i).first()).toBeVisible();
});
