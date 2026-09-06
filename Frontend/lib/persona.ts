export type Persona = {
  identity: string;
  name: string;
  role: string;
  kind: "employer" | "candidate";
};

export const PERSONAS: Persona[] = [
  { identity: "local-developer", name: "Ayesha Khan", role: "Administrator · National University", kind: "employer" },
  { identity: "bilal-hassan", name: "Bilal Hassan", role: "Recruiter · National University", kind: "employer" },
  { identity: "samira-iqbal", name: "Samira Iqbal", role: "Hiring manager · National University", kind: "employer" },
  { identity: "tariq-mahmood", name: "Tariq Mahmood", role: "Administrator · Riverside College", kind: "employer" },
  { identity: "hira-ahmed", name: "Hira Ahmed", role: "Candidate", kind: "candidate" },
  { identity: "omar-farooq", name: "Omar Farooq", role: "Candidate", kind: "candidate" },
];

const STORAGE_KEY = "thos.identity";

export function currentIdentity(): string {
  if (typeof window === "undefined") return "local-developer";
  return window.localStorage.getItem(STORAGE_KEY) ?? "local-developer";
}

export function setIdentity(identity: string): void {
  window.localStorage.setItem(STORAGE_KEY, identity);
}

export function currentPersona(): Persona {
  const identity = currentIdentity();
  return (
    PERSONAS.find((persona) => persona.identity === identity) ?? {
      identity,
      name: identity,
      role: "Custom identity",
      kind: "employer",
    }
  );
}
