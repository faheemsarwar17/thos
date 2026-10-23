import type { PipelineCard, PipelineColumn } from "@/lib/types";

export type PhaseId = "received" | "shortlisted" | "interview" | "results";

export const PHASES = [
  { id: "received", label: "Received", stages: ["received", "screened"] },
  { id: "shortlisted", label: "Shortlisted", stages: ["shortlisted"] },
  { id: "interview", label: "Interview", stages: ["applied_interview", "offer"] },
  { id: "results", label: "Results", stages: ["hired", "rejected", "withdrawn"] },
] as const satisfies readonly { id: PhaseId; label: string; stages: readonly string[] }[];

/**
 * Macro phase for a workflow column. Same rules the pipeline board has always used, so custom
 * stages (by category or label) land in the same lane everywhere.
 */
export function phaseOf(column: Pick<PipelineColumn, "stage_id" | "category" | "label">): PhaseId {
  const id = column.stage_id.toLowerCase();
  const cat = column.category.toLowerCase();
  const lbl = column.label.toLowerCase();
  if (id === "received" || id === "screened" || cat === "new") return "received";
  if (id === "shortlisted" || lbl.includes("shortlist")) return "shortlisted";
  if (id === "applied_interview" || id === "offer" || cat === "assessment" || cat === "offer" || lbl.includes("interview")) return "interview";
  if (["hired", "rejected", "withdrawn"].includes(id) || ["hired", "rejected", "withdrawn"].includes(cat)) return "results";
  if (cat === "review") return "received";
  return "results";
}

export function allCards(columns: PipelineColumn[]): PipelineCard[] {
  return columns.flatMap((c) => c.cards);
}

export function phaseCards(columns: PipelineColumn[], stages: readonly string[]): PipelineCard[] {
  return columns.filter((c) => stages.includes(c.stage_id)).flatMap((c) => c.cards);
}
