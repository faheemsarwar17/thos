// Fails if any component/app TSX hard-codes a colour (PRD §12 dark-mode drift guard).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const roots = ["components", "app"];
const bad = /(#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl)\(|["'`]\s*(?:white|black)\s*["'`])/;
const allow = [
  /components[\\/]charts[\\/]/, // charts use var(--viz-*) but keep the door open for documented exceptions
  /components[\\/]sandbox[\\/]sandbox-recorder\.tsx$/, // canvas compositing for the proctoring recording, not themed UI
];
const hits = [];
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (!p.endsWith(".tsx") || allow.some((r) => r.test(p))) return;
  readFileSync(p, "utf8").split("\n").forEach((line, i) => { if (bad.test(line) && !line.includes("color-gate-ignore")) hits.push(`${p}:${i + 1}: ${line.trim()}`); });
});
roots.forEach(walk);
if (hits.length) { console.error("Hard-coded colours found:\n" + hits.join("\n")); process.exit(1); }
console.log("colour gate: ok");
