"use client";

import { useMemo, useState, type FormEvent } from "react";
import { LuSearch, LuSparkles, LuMail } from "react-icons/lu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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

  function clearFilters() {
    setQuery("");
    setPackId("");
    setMinScore("");
  }

  return (
    <div className="dashboard">
      <PageHeader title="Talent" meta="Verified candidates who applied or opted into discovery" />

      <form className="filter-bar" role="search" aria-label="Talent search filters" onSubmit={(event) => void search(event)}>
        <label className="filter-bar__field filter-bar__field--grow">
          <span className="sr-only">Keywords (Name, Skills, Title)</span>
          <span className="input-icon">
            <input
              className="input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Keywords: name, skills, title…"
            />
            <LuSearch size={15} aria-hidden="true" />
          </span>
        </label>
        <label className="filter-bar__field">
          <span className="sr-only">Domain Pack Scorecard</span>
          <select className="select" value={packId} onChange={(event) => setPackId(event.target.value)}>
            <option value="">Any Domain Pack</option>
            {(packs.data?.packs ?? []).map((pack) => (
              <option key={pack.pack_id} value={pack.pack_id}>
                {pack.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-bar__field filter-bar__field--sm">
          <span className="sr-only">Minimum Screening Score Floor (0–100)</span>
          <input
            type="number"
            className="input"
            min={0}
            max={100}
            value={minScore}
            onChange={(event) => setMinScore(event.target.value)}
            placeholder="Min score"
          />
        </label>
        <Button type="submit" size="sm" loading={busy} iconLeft={<LuSearch size={14} />}>
          Search
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
          Clear
        </Button>
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
        <section aria-label="Talent search results">
          <p className="results-count">{results.length} candidate{results.length === 1 ? "" : "s"} found</p>
          <ul className="talent-grid">
            {results.map((person) => (
              <li key={person.candidate_id} className="talent-card">
                <div className="talent-card__head">
                  <span className="avatar" aria-hidden="true">{person.display_name.slice(0, 2).toUpperCase()}</span>
                  <span className="talent-card__who">
                    <strong>{person.display_name}</strong>
                    <small>{person.headline || "Verified Talent"}</small>
                  </span>
                  <ScoreBadge score={person.best_score} />
                </div>

                {person.email && (
                  <p className="talent-card__email">
                    <LuMail size={12} aria-hidden="true" /> {person.email}
                  </p>
                )}

                {person.skills.length > 0 && (
                  <div className="talent-card__skills">
                    {person.skills.slice(0, 6).map((skill) => (
                      <Badge key={skill} variant="default">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}

                {person.why.length > 0 && (
                  <div className="talent-card__why">
                    <p>Why this match</p>
                    <ul>
                      {person.why.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="talent-card__foot">
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
          icon={<LuSparkles size={24} />}
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
