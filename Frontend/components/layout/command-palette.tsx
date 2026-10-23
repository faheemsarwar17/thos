"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LuCornerDownLeft, LuSearch } from "react-icons/lu";
import { api } from "@/lib/api";

type SearchResult = {
  postings: { id: string; title: string; status: string; location: string }[];
  applications: { id: string; posting_id: string; candidate_name: string; job_title: string; stage_id: string }[];
};
type Item = { group: string; label: string; hint?: string; run: () => void };

function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  try { window.localStorage.setItem("thos-theme", next); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event("thos-theme-change"));
}

export function CommandPalette({ persona, destinations }: { persona: "employer" | "candidate"; destinations: { label: string; href: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [isMac, setIsMac] = useState(false);
  useEffect(() => { setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)); }, []);

  const close = useCallback(() => { setOpen(false); setQ(""); setResults(null); trigger.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get<SearchResult>(`/api/v1/search?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults({ postings: [], applications: [] }))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const match = (s: string) => !needle || s.toLowerCase().includes(needle);
    const go = (href: string) => () => { router.push(href); close(); };
    const list: Item[] = destinations.filter((d) => match(d.label)).map((d) => ({ group: "Go to", label: d.label, run: go(d.href) }));
    const actions: Item[] = [
      ...(persona === "employer" ? [{ group: "Actions", label: "Create job", run: go("/jobs?create=1") }] : []),
      { group: "Actions", label: "Toggle theme", run: () => { toggleTheme(); close(); } },
    ];
    list.push(...actions.filter((a) => match(a.label)));
    for (const p of results?.postings ?? []) list.push({ group: "Jobs & Requisitions", label: p.title, hint: p.location, run: go(`/jobs/${p.id}`) });
    for (const a of results?.applications ?? [])
      list.push({ group: "Candidates & Applications", label: a.candidate_name, hint: a.job_title, run: go(`/pipeline?posting=${encodeURIComponent(a.posting_id)}&applicationId=${encodeURIComponent(a.id)}`) });
    return list;
  }, [q, results, destinations, persona, router, close]);

  useEffect(() => { setActive(0); }, [items.length]);

  return (
    <>
      <button ref={trigger} type="button" className="search-trigger" onClick={() => setOpen(true)} aria-label="Search or jump to">
        <LuSearch size={15} aria-hidden="true" />
        <span className="search-trigger__text">Search or jump to…</span>
        <kbd className="search-trigger__kbd">{isMac ? "⌘ K" : "Ctrl K"}</kbd>
      </button>
      {open && (
        <div className="palette-scrim" onMouseDown={close}>
          <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
            <div className="palette__input">
              <LuSearch size={16} aria-hidden="true" />
              <input autoFocus role="combobox" aria-expanded="true" aria-controls="palette-list" aria-label="Search candidates, jobs, applications"
                value={q} placeholder="Search candidates, jobs, applications…" onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); close(); }
                  if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                  if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
                }} />
              <kbd>Esc</kbd>
            </div>
            <ul id="palette-list" className="palette__list" role="listbox" aria-label="Results">
              {searching && <li className="palette__state" role="presentation">Searching…</li>}
              {!searching && q.trim().length >= 2 && items.length === 0 && <li className="palette__state" role="presentation">No matches for &ldquo;{q.trim()}&rdquo;</li>}
              {items.map((it, i) => (
                <li key={`${it.group}-${it.label}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined}
                  onMouseEnter={() => setActive(i)} onClick={() => it.run()}>
                  <span className="palette__group">{it.group}</span>
                  <span className="palette__label">{it.label}{it.hint && <small> · {it.hint}</small>}</span>
                  {i === active && <LuCornerDownLeft size={14} aria-hidden="true" />}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
