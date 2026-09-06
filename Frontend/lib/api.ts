import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  getSession,
  saveSession,
  type AuthSession,
} from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
      cache: "no-store",
    });
    if (!response.ok) {
      clearSession();
      return false;
    }
    const body = (await response.json()) as AuthSession & {
      access_token: string;
      refresh_token: string;
    };
    saveSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      user: body.user,
      memberships: body.memberships ?? [],
      candidate_id: body.candidate_id ?? null,
      is_superadmin: Boolean(body.is_superadmin),
      has_employer_membership: Boolean(body.has_employer_membership),
    });
    return true;
  } catch {
    clearSession();
    return false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "network_unreachable",
      "The THOS API is unreachable. Start the backend (uvicorn app.main:app) and retry.",
    );
  }

  if (response.status === 401 && retry && !path.startsWith("/api/v1/auth/")) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;
    if (refreshed) return request<T>(method, path, body, false);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error as { code?: string; message?: string } | undefined;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? "The request could not be completed.",
    );
  }
  return payload as T;
}

async function requestForm<T>(path: string, form: FormData, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Do not set Content-Type — the browser adds the multipart boundary.

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: form,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      0,
      "network_unreachable",
      "The THOS API is unreachable. Start the backend (uvicorn app.main:app) and retry.",
    );
  }

  if (response.status === 401 && retry && !path.startsWith("/api/v1/auth/")) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;
    if (refreshed) return requestForm<T>(path, form, false);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error as { code?: string; message?: string } | undefined;
    throw new ApiError(
      response.status,
      error?.code ?? "unknown_error",
      error?.message ?? "The request could not be completed.",
    );
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  postForm: <T>(path: string, form: FormData) => requestForm<T>(path, form),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export async function login(email: string, password: string): Promise<AuthSession> {
  const body = await request<AuthSession>("POST", "/api/v1/auth/login", { email, password }, false);
  saveSession(body);
  return body;
}

export async function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthSession> {
  const body = await request<AuthSession>(
    "POST",
    "/api/v1/auth/register",
    { email, password, display_name: displayName },
    false,
  );
  saveSession(body);
  return body;
}

export async function logout(): Promise<void> {
  const refresh = getRefreshToken();
  try {
    if (refresh) {
      await request("POST", "/api/v1/auth/logout", { refresh_token: refresh }, false);
    }
  } catch {
    // Clear local session even if revoke fails.
  }
  clearSession();
}

export function currentSession(): AuthSession | null {
  return getSession();
}

export function idempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
