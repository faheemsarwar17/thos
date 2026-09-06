"""Embedding helpers for profile/job vector matching.

Uses OpenAI embeddings when configured; otherwise a deterministic local
hash embedding so tests and offline dev still exercise the match path.
Vectors are stored as JSON float arrays (portable across SQLite and Postgres).
Postgres deployments also enable pgvector for future ANN queries.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Any

from app.core.config import Settings

LOCAL_DIM = 384


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for a, b in zip(left, right, strict=True):
        dot += a * b
        left_norm += a * a
        right_norm += b * b
    if left_norm <= 0 or right_norm <= 0:
        return 0.0
    return max(0.0, min(1.0, dot / math.sqrt(left_norm * right_norm)))


def _local_embed(text: str, *, dim: int = LOCAL_DIM) -> list[float]:
    """Deterministic bag-of-tokens embedding for offline / test use."""
    vector = [0.0] * dim
    tokens = re.findall(r"[a-z0-9][a-z0-9+#./-]{1,}", text.lower())
    if not tokens:
        return vector
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dim
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + (digest[5] / 255.0)
        vector[index] += sign * weight
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def embed_text(text: str, *, settings: Settings) -> tuple[list[float], str]:
    """Return (vector, model_name). Never raises for empty text."""
    cleaned = (text or "").strip()
    if not cleaned:
        return [0.0] * LOCAL_DIM, "local-empty"

    if settings.ai_is_configured:
        try:
            from langchain_openai import OpenAIEmbeddings

            model = settings.embedding_model
            client = OpenAIEmbeddings(
                api_key=settings.ai_api_key.get_secret_value(),  # type: ignore[union-attr]
                model=model,
                timeout=settings.ai_timeout_seconds,
                max_retries=1,
            )
            vector = list(client.embed_query(cleaned[:12000]))
            if vector:
                return vector, model
        except Exception:
            pass

    return _local_embed(cleaned), "local-hash-v1"


def similarity_percent(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right:
        return 0.0
    return round(cosine_similarity(left, right) * 100.0, 1)


def decode_embedding(value: Any) -> list[float] | None:
    if value is None:
        return None
    if isinstance(value, list):
        return [float(item) for item in value]
    if isinstance(value, str) and value.strip():
        import json

        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, list):
            return [float(item) for item in parsed]
    return None
