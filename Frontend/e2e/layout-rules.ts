export type LayoutIssue = { kind: string; detail: string };

/** Runs inside the page via page.evaluate. Must stay self-contained (no imports, no closures). */
export function detectLayoutIssues(): LayoutIssue[] {
  const vw = window.innerWidth;
  const issues: LayoutIssue[] = [];
  const de = document.documentElement;
  if (de.scrollWidth > vw + 1) issues.push({ kind: "page-horizontal-scroll", detail: `scrollWidth ${de.scrollWidth} > ${vw}` });

  const describe = (el: Element) => {
    const h = el as HTMLElement;
    const t = (h.innerText || el.getAttribute("aria-label") || (h as HTMLInputElement).value || "").trim().replace(/\s+/g, " ").slice(0, 50);
    const cls = typeof h.className === "string" ? h.className.split(" ").slice(0, 2).join(".") : "";
    return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} "${t}"`;
  };
  const visible = (el: Element) => {
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  };
  const ignored = (el: Element) => !!el.closest("[data-layout-ignore]");
  const inScroller = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const clippedBy = (el: Element, r: DOMRect) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.left < pr.left - 2) return p;
      }
    }
    return null;
  };
  const bordered = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRightWidth) > 0) return p;
    }
    return null;
  };

  const controls = Array.from(document.querySelectorAll(
    "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]",
  )).filter((el) => visible(el) && !ignored(el));
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) issues.push({ kind: "control-offscreen", detail: describe(el) });
    const clip = clippedBy(el, r);
    if (clip && !inScroller(el)) issues.push({ kind: "control-clipped", detail: `${describe(el)} by ${describe(clip).slice(0, 40)}` });
  }

  const texty = Array.from(document.querySelectorAll("button, a[href], select, input, h1, h2, h3, h4, span, strong, p"))
    .filter((el) => visible(el) && !ignored(el))
    .slice(0, 1200);
  for (const el of texty) {
    const box = bordered(el);
    if (!box || inScroller(el)) continue;
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (r.right > b.right + 2 || r.left < b.left - 2)
      issues.push({ kind: "escapes-container", detail: `${describe(el)} out of ${describe(box).slice(0, 40)}` });
  }
  // de-duplicate
  const seen = new Set<string>();
  return issues.filter((i) => { const k = i.kind + i.detail; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
}
