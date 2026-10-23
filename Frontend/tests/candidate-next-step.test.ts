import { nextStep } from "@/lib/candidate-next-step";
import type { CandidateApplication } from "@/lib/types";
const base = { id: "a", job_title: "J", organization_name: "O", status: "Interview", status_order: [], applied_at: "", updated_at: "" } as unknown as CandidateApplication;

it("interview first", () => {
  expect(nextStep({ ...base, applied_interview: { attempt_id: "x", status: "invited" } })?.href).toBe("/candidate/applied/x");
});
it("then sandbox", () => {
  expect(nextStep({ ...base, applied_interview: { attempt_id: "x", status: "evaluated", sandbox: { required: true, status: null } } })?.href).toBe("/candidate/sandbox/x");
});
it("nothing when sandbox done", () => {
  expect(nextStep({ ...base, applied_interview: { attempt_id: "x", status: "evaluated", sandbox: { required: true, status: "submitted" } } })).toBeNull();
});
