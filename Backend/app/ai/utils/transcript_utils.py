"""Helpers for normalizing persisted interview transcript rows."""

from __future__ import annotations

from typing import Any


def normalize_transcript_entries(
    transcripts: Any,
) -> list[dict[str, str]]:
    """Normalize stored transcript rows to {role, content, timestamp}."""
    if not transcripts:
        return []

    if isinstance(transcripts, str):
        return []

    normalized: list[dict[str, str]] = []
    for entry in transcripts:
        if not isinstance(entry, dict):
            continue

        role_raw = entry.get("role") or entry.get("speaker") or "unknown"
        role = str(role_raw).strip().lower()
        if role in ("agent", "assistant", "interviewer"):
            role = "assistant"
        elif role in ("user", "candidate", "participant"):
            role = "user"
        else:
            role = "user" if role not in ("assistant", "system") else role

        content = (
            entry.get("content")
            or entry.get("text")
            or entry.get("message")
            or ""
        )
        if isinstance(content, list):
            parts: list[str] = []
            for part in content:
                if isinstance(part, str):
                    parts.append(part)
                elif isinstance(part, dict):
                    parts.append(str(part.get("text") or part.get("content") or ""))
            content = " ".join(p for p in parts if p).strip()
        else:
            content = str(content).strip() if content is not None else ""

        if not content:
            continue

        timestamp = entry.get("timestamp") or entry.get("created_at") or ""
        normalized.append(
            {
                "role": role,
                "content": content,
                "timestamp": str(timestamp) if timestamp else "",
            }
        )

    return normalized
