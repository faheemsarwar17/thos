import { readOnly, resolveIds, signIn, test, type Theme } from "./fixtures";
import { ROUTES, resolvePath, type Ids } from "./routes";

let ids: Ids;
test.beforeAll(async () => { ids = await resolveIds(); });

for (const theme of ["light", "dark"] as Theme[]) {
  for (const route of ROUTES) {
    test(`@capture ${theme} ${route.name}`, async ({ page }, testInfo) => {
      const path = resolvePath(route, ids);
      test.skip(!path, "no data");
      await signIn(page, route.persona, theme);
      await readOnly(page);
      await page.goto(path!);
      await page.getByRole("heading").first().waitFor({ state: "visible" });
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `e2e/__screens__/${testInfo.project.name}/${theme}/${route.name}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}
