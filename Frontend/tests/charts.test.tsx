import { fireEvent, render, screen } from "@testing-library/react";
import { FunnelChart, ScoreHistogram, StageMixChart, TrendColumns } from "@/components/charts";
import type { PipelineCard, PipelineColumn, Posting } from "@/lib/types";

const card = (id: string, stage: string, posting: string, score: number | null, applied = new Date().toISOString()) => ({
  id, candidate_name: id, posting_id: posting, job_title: "Job", stage_id: stage, stage_label: stage, stage_category: "new",
  stage_position: null, stage_version: 1, profile_interview_score: score, applied_interview_status: null,
  applied_at: applied, updated_at: applied, valid_destinations: [],
}) as PipelineCard;
const columns: PipelineColumn[] = [
  { stage_id: "received", label: "Received", category: "new", cards: [card("a", "received", "p1", 71), card("b", "received", "p1", 13)] },
  { stage_id: "shortlisted", label: "Shortlisted", category: "review", cards: [] },
  { stage_id: "applied_interview", label: "AI Interview", category: "assessment", cards: [card("c", "applied_interview", "p2", 85)] },
  { stage_id: "rejected", label: "Rejected", category: "rejected", cards: [] },
];
const postings = [{ id: "p1", title: "Lecturer", status: "published" }, { id: "p2", title: "Professor", status: "published" }, { id: "p3", title: "Visiting", status: "draft" }] as Posting[];

describe("charts", () => {
  it("funnel lists stages with counts and hides rejected", () => {
    render(<FunnelChart columns={columns} />);
    expect(screen.getByText("Received")).toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Received: 2 candidates")).toBeInTheDocument();
  });
  it("funnel has a table view", () => {
    render(<FunnelChart columns={columns} />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
  it("stage mix shows per-requisition segments and an empty draft row", () => {
    render(<StageMixChart columns={columns} postings={postings} />);
    expect(screen.getByLabelText("Lecturer · Received: 2 candidates")).toBeInTheDocument();
    expect(screen.getByText(/Draft — finish setup/)).toBeInTheDocument();
  });
  it("compact stage mix renders no links", () => {
    const { container } = render(<StageMixChart columns={columns} postings={[postings[0]]} compact />);
    expect(container.querySelector("a")).toBeNull();
  });
  it("trend counts today's applications", () => {
    render(<TrendColumns cards={columns.flatMap((c) => c.cards)} />);
    expect(screen.getByText(/3 in the last 14 days/)).toBeInTheDocument();
  });
  it("histogram buckets screening scores", () => {
    render(<ScoreHistogram cards={columns.flatMap((c) => c.cards)} />);
    expect(screen.getByText(/3 scored/)).toBeInTheDocument();
  });
});
