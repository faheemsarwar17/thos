"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  LuSearch,
  LuSparkles,
  LuFilter,
  LuMail,
} from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Pill } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type TalentResult = {
  candidate_id: string;
  display_name: string;
  email: string | null;
  headline: string;
  skills: string[];
  target_domains: string[];
  best_score: number | null;
  best_pack_id: string | null;
  application_count: number;
  discovery_consent: boolean;
  why: string[];
};

export function TalentDiscoveryPage() {
  const packs = useApi<{ packs: { pack_id: string; display_name: string }[] }>("/api/v1/packs/catalog");
  const [query, setQuery] = useState("");
  const [packId, setPackId] = useState("");
  const [minScore, setMinScore] = useState("");
  const [results, setResults] = useState<TalentResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const packLabel = useMemo(() => {
    const map = new Map((packs.data?.packs ?? []).map((pack) => [pack.pack_id, pack.display_name]));
    return (id: string | null) => (id ? map.get(id) ?? id : "Any Domain Pack");
  }, [packs.data]);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (packId) params.set("pack_id", packId);
      if (minScore.trim()) params.set("min_score", minScore.trim());
      const qs = params.toString();
      const body = await api.get<{ results: TalentResult[] }>(`/api/v1/talent${qs ? `?${qs}` : ""}`);
      setResults(body.results);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Talent search failed.");
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Employer Workspace", href: "/" }, { label: "Talent Discovery" }]} />
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Explainable search</p>
          <h1>Talent Discovery</h1>
          <p>
            Search verified talent who applied to your requisitions or opted into discovery consent.
            All matches remain tenant-scoped and citation-explainable.
          </p>
        </div>
      </div>

      <form className="panel form-panel" onSubmit={(event) => void search(event)} aria-label="Talent search filters">
        <div className="panel__header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LuFilter size={16} style={{ color: "var(--ink-400)" }} />
            <h2 style={{ fontSize: "15px" }}>Search Filters</h2>
          </div>
          <Button type="submit" size="sm" loading={busy} iconLeft={<LuSearch size={14} />}>
            Search Talent
          </Button>
        </div>

        <div className="form-grid">
          <FormField label="Keywords (Name, Skills, Title)">
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Distributed Systems, Python, React…"
            />
          </FormField>

          <FormField label="Domain Pack Scorecard">
            <select
              className="select"
              value={packId}
              onChange={(event) => setPackId(event.target.value)}
            >
              <option value="">Any Domain Pack</option>
              {(packs.data?.packs ?? []).map((pack) => (
                <option key={pack.pack_id} value={pack.pack_id}>
                  {pack.display_name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Minimum Screening Score Floor (0–100)">
            <input
              type="number"
              className="input"
              min={0}
              max={100}
              value={minScore}
              onChange={(event) => setMinScore(event.target.value)}
              placeholder="e.g. 70"
            />
          </FormField>
        </div>
      </form>

      {error && <ErrorState message={error} onRetry={() => void search()} />}

      {busy && !results ? (
        <LoadingState label="Querying talent discovery index…" />
      ) : results && results.length === 0 ? (
        <EmptyState
          icon={<LuSearch size={22} />}
          title="No candidates matched your search criteria"
          description="Try broadening your query keywords or reducing the minimum score floor."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery("");
                setPackId("");
                setMinScore("");
                void search();
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : results ? (
        <section className="panel" aria-label="Talent search results">
          <div className="panel__header">
            <div>
              <p className="eyebrow">Verified pool</p>
              <h2>{results.length} Candidate{results.length === 1 ? "" : "s"} Found</h2>
            </div>
          </div>

          <ul className="pack-list" style={{ padding: "16px 20px" }}>
            {results.map((person) => (
              <li
                key={person.candidate_id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "16px",
                  padding: "16px",
                  borderRadius: "10px",
                  border: "1px solid var(--border)",
                  marginBottom: "12px",
                  background: "white",
                  boxShadow: "var(--shadow-xs)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: "var(--brand-100)",
                        color: "var(--brand-700)",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {person.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <strong style={{ fontSize: "14px", color: "var(--ink-900)" }}>
                        {person.display_name}
                      </strong>
                      <span style={{ marginLeft: "8px", color: "var(--ink-500)", fontSize: "12px" }}>
                        {person.headline || "Verified Talent"}
                      </span>
                    </div>
                  </div>

                  {person.email && (
                    <p style={{ margin: "4px 0 8px", color: "var(--ink-500)", fontSize: "12px" }}>
                      <LuMail size={12} style={{ display: "inline", marginRight: "4px" }} />
                      {person.email}
                    </p>
                  )}

                  {person.skills.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", margin: "8px 0" }}>
                      {person.skills.slice(0, 6).map((skill) => (
                        <Badge key={skill} variant="default">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {person.why.length > 0 && (
                    <div style={{ marginTop: "10px", padding: "8px 12px", background: "var(--surface-sunken)", borderRadius: "6px" }}>
                      <p style={{ margin: 0, fontSize: "11px", fontWeight: 600, color: "var(--ink-700)" }}>
                        Match Explanation:
                      </p>
                      <ul style={{ margin: "4px 0 0", paddingLeft: "16px", fontSize: "11px", color: "var(--ink-600)" }}>
                        {person.why.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
                  <ScoreBadge score={person.best_score} />
                  <Pill tone={person.application_count > 0 ? "brand" : "verified"}>
                    {person.application_count > 0
                      ? `${person.application_count} Requisition${person.application_count === 1 ? "" : "s"}`
                      : "Discovery Opt-in"}
                  </Pill>
                  <Pill tone="neutral">{packLabel(person.best_pack_id)}</Pill>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          icon={<LuSparkles size={24} style={{ color: "var(--brand-500)" }} />}
          title="Explore the Verified Talent Network"
          description="Filter candidates by verified domain skill scores, evaluated rubric dimensions, and technical specialties."
          action={
            <Button size="sm" onClick={() => void search()} iconLeft={<LuSearch size={14} />}>
              Display All Discoverable Talent
            </Button>
          }
        />
      )}
    </div>
  );
}
