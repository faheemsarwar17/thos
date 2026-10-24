import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "../styles/theme.css"), "utf8");
const globals = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const typography = readFileSync(join(__dirname, "../styles/typography.css"), "utf8");

const REQUIRED = ["--bg", "--surface", "--surface-2", "--surface-3", "--border", "--border-strong", "--ink", "--ink-2", "--ink-3",
  "--brand", "--brand-ink", "--brand-soft", "--brand-line", "--teal", "--teal-soft", "--amber", "--amber-soft", "--red", "--red-soft",
  "--green", "--green-soft", "--violet", "--violet-soft", "--viz-1", "--viz-2", "--viz-3", "--viz-4", "--viz-mag"];

describe("theme tokens", () => {
  it("defines every semantic token for light and dark", () => {
    const [light, dark] = [css.split('[data-theme="dark"]')[0], css.split('[data-theme="dark"]')[1] ?? ""];
    for (const t of REQUIRED) {
      expect(light).toContain(`${t}:`);
      expect(dark).toContain(`${t}:`);
    }
  });
  it("uses the approved brand values", () => {
    expect(css).toContain("--brand: #2f5bea");
    expect(css).toContain("--brand: #7090ff");
  });
  it("is imported right after tokens.css", () => {
    expect(globals.indexOf('@import "../styles/theme.css"')).toBeGreaterThan(globals.indexOf('@import "../styles/tokens.css"'));
  });
  it("drops Poppins", () => {
    expect(typography).not.toMatch(/Poppins/);
  });
});
