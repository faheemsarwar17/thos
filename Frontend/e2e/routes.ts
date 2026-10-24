import type { Persona } from "./fixtures";

export type Ids = { postingId: string; attemptId: string | null; applicationId: string | null };
export type RouteSpec = { name: string; persona: Persona; path: string | ((ids: Ids) => string | null) };

export const ROUTES: RouteSpec[] = [
  { name: "login", persona: "public", path: "/login" },
  { name: "register", persona: "public", path: "/register" },
  { name: "register-org", persona: "public", path: "/register/organization" },
  { name: "interview-room", persona: "public", path: "/interviews/faculty-panel" },
  { name: "home", persona: "employer", path: "/" },
  { name: "jobs", persona: "employer", path: "/jobs" },
  { name: "jobs-create", persona: "employer", path: "/jobs?create=1" },
  { name: "job-detail", persona: "employer", path: (ids) => `/jobs/${ids.postingId}` },
  { name: "pipeline", persona: "employer", path: "/pipeline" },
  { name: "pipeline-drawer", persona: "employer", path: (ids) => (ids.applicationId ? `/pipeline?applicationId=${ids.applicationId}` : null) },
  { name: "talent", persona: "employer", path: "/talent" },
  { name: "analytics", persona: "employer", path: "/analytics" },
  { name: "messages", persona: "employer", path: "/messages" },
  { name: "automations", persona: "employer", path: "/automations" },
  { name: "admin", persona: "employer", path: "/admin" },
  { name: "admin-members", persona: "employer", path: "/admin#members" },
  { name: "admin-packs", persona: "employer", path: "/admin#packs" },
  { name: "admin-workflows", persona: "employer", path: "/admin#workflows" },
  { name: "admin-emails", persona: "employer", path: "/admin#emails" },
  { name: "admin-audit", persona: "employer", path: "/admin#audit" },
  { name: "cand-home", persona: "candidate", path: "/candidate" },
  { name: "cand-jobs", persona: "candidate", path: "/candidate/jobs" },
  { name: "cand-applications", persona: "candidate", path: "/candidate/applications" },
  { name: "cand-messages", persona: "candidate", path: "/candidate/messages" },
  { name: "cand-profile", persona: "candidate", path: "/candidate/profile" },
  { name: "cand-screening", persona: "candidate", path: "/candidate/interview" },
  { name: "cand-applied", persona: "candidate", path: (ids) => (ids.attemptId ? `/candidate/applied/${ids.attemptId}` : null) },
  { name: "cand-sandbox", persona: "candidate", path: (ids) => (ids.attemptId ? `/candidate/sandbox/${ids.attemptId}` : null) },
];

export function resolvePath(route: RouteSpec, ids: Ids): string | null {
  return typeof route.path === "function" ? route.path(ids) : route.path;
}
