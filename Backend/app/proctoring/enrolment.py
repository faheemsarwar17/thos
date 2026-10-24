"""Voice enrolment: decode the device-check sample and hold the embedding in memory.

Embeddings are biometric data. They live only in this process, expire after two hours
and are dropped when the interview session ends. Audio is never written anywhere.
"""

from __future__ import annotations

import io
import threading
import time
import wave
from collections.abc import Sequence
from typing import Any

SAMPLE_RATE = 16000
_DEFAULT_TTL_SECONDS = 2 * 60 * 60


class EnrolmentRegistry:
    """attempt id → (embedding, source), with a time-to-live."""

    def __init__(self, ttl_seconds: float = _DEFAULT_TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._items: dict[str, tuple[list[float], str, float]] = {}
        self._lock = threading.Lock()
        self._now = time.monotonic

    def put(self, attempt_id: str, embedding: Sequence[float], *, source: str) -> None:
        with self._lock:
            self._items[attempt_id] = ([float(v) for v in embedding], source, self._now())

    def get(self, attempt_id: str) -> tuple[list[float], str] | None:
        with self._lock:
            item = self._items.get(attempt_id)
            if item is None:
                return None
            embedding, source, stored_at = item
            if self._now() - stored_at > self._ttl:
                del self._items[attempt_id]
                return None
            return embedding, source

    def pop(self, attempt_id: str) -> None:
        with self._lock:
            self._items.pop(attempt_id, None)


_registry = EnrolmentRegistry()


def get_enrolment_registry() -> EnrolmentRegistry:
    return _registry


def decode_wav_pcm16_mono_16k(data: bytes) -> Any:
    """Decode a 16 kHz, mono, 16-bit WAV to float32 samples in [-1, 1].

    Returns a numpy array when numpy is installed, otherwise a list of floats.
    Raises ``ValueError`` for anything else.
    """
    try:
        with wave.open(io.BytesIO(data), "rb") as reader:
            if reader.getframerate() != SAMPLE_RATE:
                raise ValueError("The voice sample must be recorded at 16 kHz.")
            if reader.getnchannels() != 1:
                raise ValueError("The voice sample must be mono.")
            if reader.getsampwidth() != 2:
                raise ValueError("The voice sample must be 16-bit PCM.")
            frames = reader.readframes(reader.getnframes())
    except (wave.Error, EOFError) as exc:
        raise ValueError("The voice sample is not a valid WAV file.") from exc
    try:
        import numpy as np
    except ImportError:
        count = len(frames) // 2
        ints = memoryview(frames)[: count * 2].cast("h")
        return [value / 32768.0 for value in ints]
    return np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768.0
