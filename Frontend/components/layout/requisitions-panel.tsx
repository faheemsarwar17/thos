"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LuPlus } from "react-icons/lu";
import { useApi } from "@/lib/use-api";
import type { PipelineColumn, Posting } from "@/lib/types";
import { StageMixChart } from "@/components/charts";

export function RequisitionsPanel({ orgName }: { orgName: string }) {
  const params = useSearchParams();
  const current = params.get("posting");
  const postings = useApi<{ postings: Posting[] }>("/api/v1/postings");
  const pipeline = useApi<{ columns: PipelineColumn[] }>("/api/v1/pipeline");
  const columns = pipeline.data?.columns ?? [];
  const count = (id: string) => columns.reduce((s, c) => s + c.cards.filter((x) => x.posting_id === id).length, 0);
  const total = columns.reduce((s, c) => s + c.cards.length, 0);
  return (
    <aside className="req-panel" aria-label="Requisitions">
      <h2 className="req-panel__org">{orgName}</h2>
      <Link href="/pipeline" className={`req-panel__item${!current ? " is-active" : ""}`}><b>All requisitions</b><span className="tabular-nums">{total}</span></Link>
      {postings.loading && <p className="req-panel__state">Loading…</p>}
      {postings.error && <p className="req-panel__state">Couldn&apos;t load requisitions.</p>}
      {(postings.data?.postings ?? []).map((p) => (
        <Link key={p.id} href={`/pipeline?posting=${encodeURIComponent(p.id)}`} className={`req-panel__item${current === p.id ? " is-active" : ""}`}>
          <b>{p.title}</b><span className="tabular-nums">{count(p.id)}</span>
          <small>{p.status === "draft" ? "Draft · finish setup" : p.location}</small>
          <span className="req-panel__bar"><StageMixChart columns={columns} postings={[p]} compact /></span>
        </Link>
      ))}
      <Link href="/jobs?create=1" className="req-panel__new"><LuPlus size={13} aria-hidden="true" /> New requisition</Link>
    </aside>
  );
}
