import { expect, readOnly, resolveIds, signIn, test, type Theme } from "./fixtures";
import { detectLayoutIssues } from "./layout-rules";
import { ROUTES, resolvePath, type Ids } from "./routes";

let ids: Ids;
test.beforeAll(async () => { ids = await resolveIds(); });

for (const theme of ["light", "dark"] as Theme[]) {
  test.describe(`layout rules · ${theme}`, () => {
    for (const route of ROUTES) {
      test(`${route.name}`, async ({ page }) => {
        const path = resolvePath(route, ids);
        test.skip(!path, "no data for this dynamic route");
        await signIn(page, route.persona, theme);
        await readOnly(page);
        await page.goto(path!);
        await page.getByRole("heading").first().waitFor({ state: "visible" });
        await page.waitForTimeout(800); // let data-driven sections render
        const issues = await page.evaluate(detectLayoutIssues);
        expect(issues, JSON.stringify(issues, null, 1)).toEqual([]);
      });
    }
  });
}
