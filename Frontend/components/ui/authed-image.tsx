"use client";

import { useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** <img> for API endpoints that require the Authorization header. */
export function AuthedImage({
  path,
  alt,
  size = 96,
  className,
}: {
  path: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!path) {
      setObjectUrl(null);
      return;
    }
    const token = getAccessToken();
    fetch(`${API_BASE}${path}`, {
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
  }, [path]);

  if (!path || !objectUrl) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={objectUrl}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "50%", objectFit: "cover", width: size, height: size }}
    />
  );
}
