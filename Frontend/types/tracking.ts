/** Minimal Interview shape for the voice portal (ATS-adapted from PTS). */

export type InterviewType = "profile_screening" | "job_interview" | "SELF" | "MANAGER" | "PEER" | "HR" | "TEAMLEAD";

export interface Interview {
  id: string;
  access_token: string;
  status: string;
  transcripts?: unknown;
  duration_minutes?: number;
  language?: string;
  title?: string;
  kind?: "profile" | "applied";
  sandbox?: { required: boolean; status: string | null } | null;
  participant?: { full_name?: string; name?: string };
  type?: InterviewType;
}
