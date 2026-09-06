/**
 * Voice interview API adapter.
 * Preserves the PTS `publicApi` surface used by InterviewInterface / LiveKitRoomWrapper,
 * but routes calls through authenticated ATS voice endpoints.
 */

import { getAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type VoiceKind = "profile" | "applied";

type VoiceConfig = {
  kind: VoiceKind;
  attemptId: string;
};

let config: VoiceConfig = { kind: "profile", attemptId: "" };

export function configureVoiceApi(next: VoiceConfig) {
  config = next;
}

function voiceBase(attemptId: string): string {
  if (config.kind === "applied") {
    return `/api/v1/candidates/me/applied-interviews/${attemptId}/voice`;
  }
  return `/api/v1/candidates/me/profile-interview-attempts/${attemptId}/voice`;
}

async function apiFetch<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      (payload as { error?: { message?: string }; detail?: string }).error?.message ||
      (payload as { detail?: string }).detail ||
      "Request failed";
    throw Object.assign(new Error(detail), { response: { data: { detail }, status: response.status } });
  }
  return payload as T;
}

export const publicApi = {
  async getInterview(attemptId: string) {
    const data = await apiFetch<{
      id: string;
      status?: string;
      transcripts?: unknown;
      duration_minutes?: number;
      title?: string;
      kind?: "profile" | "applied";
      sandbox?: { required: boolean; status: string | null } | null;
    }>("GET", voiceBase(attemptId));
    return {
      data: {
        id: String(data.id),
        access_token: attemptId,
        status: String(data.status || "in_progress").toUpperCase(),
        transcripts: data.transcripts,
        duration_minutes: Number(data.duration_minutes || 10),
        language: "English",
        title: String(data.title || "Interview"),
        kind: data.kind,
        sandbox: data.sandbox ?? null,
      },
    };
  },

  async getLiveKitToken(attemptId: string) {
    const data = await apiFetch<{ token: string; ws_url: string }>(
      "POST",
      `${voiceBase(attemptId)}/livekit`,
    );
    return { data };
  },

  async startInterview(attemptId: string) {
    const data = await apiFetch<{ status: string }>("POST", `${voiceBase(attemptId)}/start`);
    return { data };
  },

  async completeInterview(attemptId: string) {
    const data = await apiFetch<Record<string, unknown>>(
      "POST",
      `${voiceBase(attemptId)}/complete`,
    );
    return { data };
  },

  /** One-shot live identity check: sends a webcam frame (data URL) to be
   * matched against the candidate's profile photo. Never blocks the interview. */
  async verifyIdentity(attemptId: string, image: string) {
    const data = await apiFetch<{ identity_verification: unknown }>(
      "POST",
      `${voiceBase(attemptId)}/identity-check`,
      { image },
    );
    return { data };
  },

  async uploadRecording(_attemptId: string, _blob: Blob) {
    // Recording upload is optional in ATS pilot; keep interface for InterviewInterface.
    return { data: { ok: true } };
  },
};

export function getTelemetryWsUrl(attemptId: string): string {
  const httpBase = API_BASE.replace(/\/$/, "");
  const wsBase = httpBase.startsWith("https")
    ? httpBase.replace(/^https/, "wss")
    : httpBase.replace(/^http/, "ws");
  return `${wsBase}${voiceBase(attemptId)}/telemetry`;
}
