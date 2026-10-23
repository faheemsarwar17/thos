import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

export const API = process.env.E2E_API_URL ?? "http://localhost:8000";
export const ACCOUNTS = {
  employer: { email: "ayesha.khan@nut.edu.pk", password: "Password123!" },
  candidate: { email: "hira.ahmed@gmail.com", password: "Password123!" },
} as const;
export type Persona = keyof typeof ACCOUNTS | "public";
export type Theme = "light" | "dark";
export type Session = { access_token: string; refresh_token: string } & Record<string, unknown>;

export async function apiLogin(persona: keyof typeof ACCOUNTS): Promise<Session> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNTS[persona]),
  });
  if (!res.ok) throw new Error(`login ${persona} failed: ${res.status}`);
  return (await res.json()) as Session;
}

/** Fresh API login per call (refresh tokens are single-use, so never share storageState between contexts). */
export async function signIn(page: Page, persona: Persona, theme: Theme = "light") {
  const session = persona === "public" ? null : await apiLogin(persona);
  await page.emulateMedia({ colorScheme: theme });
  await page.addInitScript(
    ([s, t]) => {
      window.localStorage.setItem("thos-theme", t as string);
      if (s) {
        const sess = s as Session;
        window.localStorage.setItem("thos.access_token", sess.access_token);
        window.localStorage.setItem("thos.refresh_token", sess.refresh_token);
        window.localStorage.setItem("thos.session", JSON.stringify(sess));
      }
    },
    [session, theme] as const,
  );
  return session;
}

/** Block every mutating API call (keeps the shared dev DB clean). Auth calls stay allowed. */
export async function readOnly(page: Page) {
  await page.route(`${API}/**`, (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "OPTIONS" || req.url().includes("/api/v1/auth/")) return route.continue();
    return route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "e2e_read_only", message: "Blocked by read-only e2e" } }),
    });
  });
  await page.route("**/api/interviews/token", (route) => route.fulfill({ status: 403, body: "{}" }));
}

export function onlyProject(testInfo: TestInfo, name = "w1366") {
  base.skip(testInfo.project.name !== name, `runs on ${name} only`);
}

export async function resolveIds() {
  const emp = await apiLogin("employer");
  const cand = await apiLogin("candidate");
  const get = async (path: string, s: Session) =>
    (await (await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${s.access_token}` } })).json()) as Record<string, unknown>;
  const postings = (await get("/api/v1/postings", emp)).postings as { id: string }[];
  const apps = (await get("/api/v1/candidates/me/applications", cand)).applications as {
    id: string; applied_interview: { attempt_id: string } | null;
  }[];
  const pipeline = (await get("/api/v1/pipeline", emp)).columns as { cards: { id: string }[] }[];
  return {
    postingId: postings[0]?.id ?? "missing",
    attemptId: apps.find((a) => a.applied_interview)?.applied_interview?.attempt_id ?? null,
    applicationId: pipeline.flatMap((c) => c.cards)[0]?.id ?? null,
  };
}

export const test = base;
export { expect };
