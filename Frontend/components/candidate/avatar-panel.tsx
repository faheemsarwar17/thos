"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

type AvatarState = { has_avatar: boolean; avatar_url: string | null };

/** Fetch an auth-protected image and expose a local object URL for <img>. */
function useAuthedImage(url: string | null, version: number) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!url) {
      setObjectUrl(null);
      return;
    }
    const token = getAccessToken();
    fetch(`${API_BASE}${url}?v=${version}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        revoked = URL.createObjectURL(blob);
        setObjectUrl(revoked);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [url, version]);

  return objectUrl;
}

export function AvatarPanel() {
  const [state, setState] = useState<AvatarState | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imageUrl = useAuthedImage(state?.avatar_url ?? null, version);

  const load = useCallback(async () => {
    try {
      const body = await api.get<{ user: AvatarState }>("/api/v1/me");
      setState(body.user);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Profile photo must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const body = await api.postForm<{ avatar: AvatarState }>("/api/v1/me/avatar", form);
      setState(body.avatar);
      setVersion((v) => v + 1);
      setMessage("Profile photo updated. It will be used for identity checks in interviews.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The photo could not be uploaded.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body = await api.delete<{ avatar: AvatarState }>("/api/v1/me/avatar");
      setState(body.avatar);
      setMessage("Profile photo removed.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The photo could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="avatar-heading">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Identity</p>
          <h2 id="avatar-heading">Profile photo</h2>
        </div>
      </div>
      <div className="panel-body form-grid">
        <p className="panel-note form-grid__full">
          This photo is matched against a live webcam frame during interviews to verify
          your identity. Use a clear, recent photo of your face (JPEG, PNG, or WebP, max 5 MB).
        </p>
        <div className="form-grid__full" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="Your profile photo"
              width={96}
              height={96}
              style={{ borderRadius: "50%", objectFit: "cover", width: 96, height: 96 }}
            />
          ) : (
            <div
              aria-hidden
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "var(--surface-muted, #eee)",
                color: "var(--text-muted, #666)",
                fontSize: "0.8rem",
              }}
            >
              No photo
            </div>
          )}
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Choose profile photo"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
              disabled={busy}
            />
            {state?.has_avatar && (
              <Button type="button" variant="ghost" onClick={() => void remove()} disabled={busy}>
                Remove photo
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p className="form-error form-grid__full" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success form-grid__full" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
