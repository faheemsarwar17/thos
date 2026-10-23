import type { CandidateApplication } from "@/lib/types";

export type NextStep = { label: string; href: string; tone: "brand" | "violet" } | null;

const TERMINAL = ["Withdrawn", "Hired", "Rejected"];

export function isTerminal(app: CandidateApplication) {
  return TERMINAL.includes(app.status);
}

/**
 * Sandbox CTA state, unchanged from the applications page: complete once submitted/expired,
 * takeable after the job interview is submitted/evaluated, otherwise pending. null = not required.
 */
export function sandboxState(app: CandidateApplication): "complete" | "take" | "pending" | null {
  const interview = app.applied_interview;
  if (isTerminal(app) || !interview?.sandbox?.required) return null;
  if (["submitted", "expired"].includes(interview.sandbox.status ?? "")) return "complete";
  if (["submitted", "evaluated"].includes(interview.status)) return "take";
  return "pending";
}

/** The one thing this application needs from the candidate right now, if anything. */
export function nextStep(app: CandidateApplication): NextStep {
  const interview = app.applied_interview;
  if (isTerminal(app) || !interview) return null;
  if (["invited", "in_progress"].includes(interview.status)) {
    return { label: "Take your job interview", href: `/candidate/applied/${interview.attempt_id}`, tone: "brand" };
  }
  if (sandboxState(app) === "take") {
    return { label: "Complete the proctored sandbox", href: `/candidate/sandbox/${interview.attempt_id}`, tone: "violet" };
  }
  return null;
}
