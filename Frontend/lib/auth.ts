export type AuthMembership = {
  id: string;
  organization_id: string;
  organization_name: string;
  role: string;
};

export type AuthUser = {
  id: string;
  identity: string;
  display_name: string;
  email: string;
  is_superadmin?: boolean;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
  memberships: AuthMembership[];
  candidate_id: string | null;
  is_superadmin: boolean;
  has_employer_membership: boolean;
};

const ACCESS_KEY = "thos.access_token";
const REFRESH_KEY = "thos.refresh_token";
const SESSION_KEY = "thos.session";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function getSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  window.localStorage.setItem(ACCESS_KEY, session.access_token);
  window.localStorage.setItem(REFRESH_KEY, session.refresh_token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function currentSession(): AuthSession | null {
  return getSession();
}
