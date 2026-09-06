"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuSearch, LuBriefcase, LuUser } from "react-icons/lu";
import { api } from "@/lib/api";

type SearchResult = {
  query: string;
  postings: { id: string; title: string; status: string; location: string }[];
  applications: {
    id: string;
    posting_id: string;
    job_title: string;
    candidate_name: string;
    candidate_email: string;
    stage_id: string;
  }[];
};

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
    }
  }, []);

  const runSearch = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const body = await api.get<SearchResult>(
        `/api/v1/search?q=${encodeURIComponent(trimmed)}`
      );
      setResults(body);
    } catch {
      setResults({ query: trimmed, postings: [], applications: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void runSearch(query);
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, runSearch]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const hasResults =
    (results?.postings.length ?? 0) > 0 || (results?.applications.length ?? 0) > 0;
  const showPanel = open && query.trim().length >= 2;

  return (
    <div className="global-search-wrap" ref={wrapRef}>
      <label className="global-search">
        <LuSearch size={15} style={{ flexShrink: 0, color: "var(--ink-400)" }} aria-hidden="true" />
        <span className="sr-only">Search candidates, jobs, and applications</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search candidates, jobs, applications…"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        <kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd>
      </label>

      {showPanel && (
        <div className="search-panel" role="listbox" aria-label="Search results">
          {loading && <p className="search-panel__empty">Searching…</p>}
          {!loading && !hasResults && (
            <p className="search-panel__empty">No matches for “{query.trim()}”.</p>
          )}
          {!loading && hasResults && (
            <>
              {(results?.postings.length ?? 0) > 0 && (
                <div className="search-panel__group">
                  <p className="search-panel__label">Jobs & Requisitions</p>
                  <ul>
                    {results?.postings.map((posting) => (
                      <li key={posting.id}>
                        <Link
                          href={`/jobs/${posting.id}`}
                          onClick={() => setOpen(false)}
                          style={{ display: "flex", alignItems: "center", gap: "10px" }}
                        >
                          <LuBriefcase size={15} style={{ color: "var(--brand-500)", flexShrink: 0 }} />
                          <div>
                            <strong>{posting.title}</strong>
                            <span>
                              {posting.status}
                              {posting.location ? ` · ${posting.location}` : ""}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(results?.applications.length ?? 0) > 0 && (
                <div className="search-panel__group">
                  <p className="search-panel__label">Candidates & Applications</p>
                  <ul>
                    {results?.applications.map((application) => (
                      <li key={application.id}>
                        <Link
                          href={`/pipeline?posting=${application.posting_id}`}
                          onClick={() => setOpen(false)}
                          style={{ display: "flex", alignItems: "center", gap: "10px" }}
                        >
                          <LuUser size={15} style={{ color: "var(--teal-600)", flexShrink: 0 }} />
                          <div>
                            <strong>{application.candidate_name}</strong>
                            <span>
                              {application.job_title} · {application.stage_id}
                            </span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
