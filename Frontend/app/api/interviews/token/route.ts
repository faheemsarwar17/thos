import { NextResponse } from "next/server";

const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export async function POST(request: Request) {
  const backendUrl = process.env.BACKEND_API_URL;
  const tokenPath = process.env.BACKEND_LIVEKIT_TOKEN_PATH ?? "/api/v1/interviews/token";

  if (!backendUrl) {
    return NextResponse.json(
      { error: "Interview rooms are not configured. Set BACKEND_API_URL on the frontend server." },
      { status: 503 },
    );
  }

  let body: { roomName?: unknown; participantName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }

  const roomName = typeof body.roomName === "string" ? body.roomName.trim() : "";
  const participantName = typeof body.participantName === "string" ? body.participantName.trim() : "";
  if (!ROOM_NAME_PATTERN.test(roomName)) {
    return NextResponse.json({ error: "The room name is invalid." }, { status: 400 });
  }
  if (participantName.length < 1 || participantName.length > 100) {
    return NextResponse.json({ error: "Enter a participant name between 1 and 100 characters." }, { status: 400 });
  }

  try {
    const tokenEndpoint = new URL(tokenPath, backendUrl);
    const headers = new Headers({ "Content-Type": "application/json" });
    const authorization = request.headers.get("authorization");
    const cookie = request.headers.get("cookie");
    if (authorization) headers.set("authorization", authorization);
    if (cookie) headers.set("cookie", cookie);
    const developmentIdentity = participantName
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    if (developmentIdentity) headers.set("x-development-identity", developmentIdentity);

    const backendResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ room_name: roomName }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await backendResponse.json().catch(() => null)) as {
      token?: unknown;
      server_url?: unknown;
      error?: unknown;
      message?: unknown;
      detail?: unknown;
    } | null;

    if (!backendResponse.ok || typeof payload?.token !== "string" || typeof payload.server_url !== "string") {
      const backendMessage = [payload?.message, payload?.detail, payload?.error].find(
        (value): value is string => typeof value === "string",
      ) ?? "The backend did not issue an interview token.";
      return NextResponse.json({ error: backendMessage }, { status: backendResponse.status || 502 });
    }

    return NextResponse.json({ token: payload.token, serverUrl: payload.server_url });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    return NextResponse.json(
      { error: timedOut ? "The interview service did not respond within 10 seconds. Try again." : "The interview service is unavailable. Check the backend URL and try again." },
      { status: 502 },
    );
  }
}
