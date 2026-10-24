"""Server-side voice proctoring (PRD §5.8). Flags only: nothing here warns or terminates.

Layers:
- pure heuristics over numpy arrays (``spectral_flatness``, ``pause_ratio``, ``rms_cv``);
- ``VoiceAnalyzer``: pure decision logic over speech segments and non-speech chunks;
- ``VoiceMonitor``: the I/O shell that taps the candidate's LiveKit audio.

Speaker embeddings use SpeechBrain ECAPA when the optional ``proctoring-voice`` group is
installed; otherwise ``NullEmbedder`` keeps the heuristics that need no embedding.
No audio is stored and embeddings never leave memory.
"""

from __future__ import annotations

import asyncio
import contextlib
import threading
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Protocol

from app.core.config import Settings
from app.logging import logger

try:
    import numpy as np
except ImportError:  # pragma: no cover - numpy ships with livekit
    np = None  # type: ignore[assignment]

SAMPLE_RATE = 16000
Flag = tuple[str, dict[str, Any]]

# Fixed heuristic thresholds (PRD §5.8); the speaker thresholds come from settings.
_WHISPER_PROB_LOW = 0.2
_WHISPER_PROB_HIGH = 0.5
_WHISPER_SECONDS = 1.5
_WHISPER_FLATNESS_MARGIN = 0.15
_BASELINE_SECONDS = 20.0
_TTS_MIN_SECONDS = 20.0
_TTS_MAX_PAUSE_RATIO = 0.03
_TTS_MAX_RMS_CV = 0.15
_SECOND_VOICE_MIN_SECONDS = 3.0
_SUB_WINDOW_SECONDS = 1.0
_SUB_WINDOW_HOP_SECONDS = 0.5
_MAX_SUB_WINDOWS = 16
_ENROLMENT_FALLBACK = "enrolment_fallback"


# --- pure heuristics ------------------------------------------------------------------


def spectral_flatness(frame: Any) -> float:
    """Geometric over arithmetic mean of the power spectrum (1 = noise-like, 0 = tonal)."""
    power = np.abs(np.fft.rfft(np.asarray(frame, dtype=np.float64))) ** 2 + 1e-10
    return float(np.exp(np.mean(np.log(power))) / np.mean(power))


def pause_ratio(vad_probs: Sequence[float], threshold: float = 0.5) -> float:
    if not vad_probs:
        return 0.0
    return sum(1 for p in vad_probs if p < threshold) / len(vad_probs)


def rms_cv(pcm: Any, win: int = 320) -> float:
    """Coefficient of variation of the 20 ms RMS envelope (low = unnaturally steady)."""
    samples = np.asarray(pcm, dtype=np.float64)
    count = len(samples) // win
    if count < 2:
        return 0.0
    rms = np.sqrt(np.mean(samples[: count * win].reshape(count, win) ** 2, axis=1))
    mean = rms.mean()
    return float(rms.std() / mean) if mean > 0 else 0.0


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    va = np.asarray(a, dtype=np.float64)
    vb = np.asarray(b, dtype=np.float64)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    return float(va @ vb / denom) if denom else 0.0


# --- embedders --------------------------------------------------------------------------


class SpeakerEmbedder(Protocol):
    name: str
    available: bool

    def embed(self, pcm16k: Any) -> list[float]: ...


class NullEmbedder:
    name = "none"
    available = False

    def embed(self, pcm16k: Any) -> list[float]:
        raise RuntimeError("No speaker embedding model is available.")


class EcapaEmbedder:
    """SpeechBrain ECAPA-TDNN on CPU (192-dim). Loads on construction; may raise."""

    name = "ecapa"
    available = True

    def __init__(self, settings: Settings) -> None:
        import torch
        from speechbrain.inference.speaker import EncoderClassifier

        self._torch = torch
        self._classifier = EncoderClassifier.from_hparams(
            source=settings.proctoring_voice_model,
            savedir=f"{settings.proctoring_model_dir}/ecapa",
            run_opts={"device": "cpu"},
        )

    def embed(self, pcm16k: Any) -> list[float]:
        tensor = self._torch.from_numpy(np.asarray(pcm16k, dtype=np.float32))[None]
        with self._torch.no_grad():
            return self._classifier.encode_batch(tensor).squeeze().tolist()


_embedders: dict[tuple[str, str], SpeakerEmbedder] = {}
_embedders_lock = threading.Lock()


def get_embedder(settings: Settings) -> SpeakerEmbedder:
    """The cached embedder; ``NullEmbedder`` if the optional model can't be used."""
    key = (settings.proctoring_voice_model, settings.proctoring_model_dir)
    with _embedders_lock:
        if key not in _embedders:
            try:
                _embedders[key] = EcapaEmbedder(settings)
            except Exception as err:
                logger.warning(f"Voice proctoring model unavailable, using heuristics only: {err}")
                _embedders[key] = NullEmbedder()
        return _embedders[key]


def reset_embedder_cache() -> None:
    with _embedders_lock:
        _embedders.clear()


# --- analyzer (pure) --------------------------------------------------------------------


@dataclass(frozen=True)
class VoiceConfig:
    mismatch_threshold: float
    mismatch_consecutive: int
    second_voice_threshold: float
    second_voice_match: float
    min_segment_seconds: float
    enrolment_fallback_seconds: float

    @classmethod
    def from_settings(cls, settings: Settings) -> VoiceConfig:
        return cls(
            mismatch_threshold=settings.proctoring_voice_mismatch_threshold,
            mismatch_consecutive=settings.proctoring_voice_mismatch_consecutive,
            second_voice_threshold=settings.proctoring_second_voice_threshold,
            second_voice_match=settings.proctoring_second_voice_match,
            min_segment_seconds=settings.proctoring_voice_min_segment_seconds,
            enrolment_fallback_seconds=settings.proctoring_enrolment_fallback_seconds,
        )


@dataclass
class VoiceDecisionState:
    consecutive_mismatches: int = 0
    fallback_embeddings: list[tuple[list[float], float]] = field(default_factory=list)
    baseline_samples: list[tuple[float, float]] = field(default_factory=list)  # (flatness, s)
    baseline: float | None = None
    whisper_run: float = 0.0


class VoiceAnalyzer:
    """Decides voice flags from segments and non-speech chunks. No I/O."""

    def __init__(
        self,
        cfg: VoiceConfig,
        embedder: SpeakerEmbedder,
        enrolment: Sequence[float] | None,
        sample_rate: int = SAMPLE_RATE,
    ) -> None:
        self.cfg = cfg
        self.embedder = embedder
        self.enrolment = list(enrolment) if enrolment is not None else None
        self.sample_rate = sample_rate
        self.state = VoiceDecisionState()

    def on_non_speech(self, pcm: Any, vad_prob: float, t: float) -> list[Flag]:
        """Quiet chunks build the room baseline; sub-threshold noisy ones may be whispering."""
        seconds = len(pcm) / self.sample_rate
        if seconds <= 0:
            return []
        flatness = spectral_flatness(pcm)
        state = self.state
        if vad_prob < _WHISPER_PROB_LOW:
            state.whisper_run = 0.0
            if state.baseline is None:
                state.baseline_samples.append((flatness, seconds))
                if sum(s for _, s in state.baseline_samples) >= _BASELINE_SECONDS:
                    state.baseline = float(np.median([f for f, _ in state.baseline_samples]))
                    state.baseline_samples.clear()
            return []
        if state.baseline is None or vad_prob >= _WHISPER_PROB_HIGH:
            state.whisper_run = 0.0
            return []
        if flatness <= state.baseline + _WHISPER_FLATNESS_MARGIN:
            state.whisper_run = 0.0
            return []
        state.whisper_run += seconds
        if state.whisper_run < _WHISPER_SECONDS:
            return []
        run = state.whisper_run
        state.whisper_run = 0.0
        return [
            (
                "whisper_background",
                {
                    "seconds": round(run, 2),
                    "flatness": round(flatness, 3),
                    "baseline": round(state.baseline, 3),
                    "at_s": round(t, 1),
                },
            )
        ]

    def on_segment(self, pcm: Any, vad_probs: Sequence[float], t: float) -> list[Flag]:
        """One candidate speech segment (VAD start → end)."""
        seconds = len(pcm) / self.sample_rate
        if seconds < self.cfg.min_segment_seconds:
            return []
        flags: list[Flag] = []
        if seconds >= _TTS_MIN_SECONDS:
            pauses = pause_ratio(vad_probs)
            steadiness = rms_cv(pcm)
            if pauses < _TTS_MAX_PAUSE_RATIO and steadiness < _TTS_MAX_RMS_CV:
                flags.append(
                    (
                        "tts_cadence",
                        {
                            "seconds": round(seconds, 1),
                            "pause_ratio": round(pauses, 3),
                            "rms_cv": round(steadiness, 3),
                            "confidence": "low",
                        },
                    )
                )
        if not self.embedder.available:
            return flags
        embedding = self.embedder.embed(pcm)
        if self.enrolment is None:
            return flags + self._accumulate_enrolment(embedding, seconds)
        flags += self._check_mismatch(embedding)
        if seconds >= _SECOND_VOICE_MIN_SECONDS:
            flags += self._check_second_voice(pcm)
        return flags

    def _accumulate_enrolment(self, embedding: list[float], seconds: float) -> list[Flag]:
        state = self.state
        state.fallback_embeddings.append((embedding, seconds))
        total = sum(s for _, s in state.fallback_embeddings)
        if total < self.cfg.enrolment_fallback_seconds:
            return []
        weights = np.asarray([s for _, s in state.fallback_embeddings])
        vectors = np.asarray([e for e, _ in state.fallback_embeddings], dtype=np.float64)
        self.enrolment = (vectors * weights[:, None]).sum(axis=0) / weights.sum()
        self.enrolment = self.enrolment.tolist()
        state.fallback_embeddings.clear()
        return [(_ENROLMENT_FALLBACK, {"seconds": round(total, 1)})]

    def _check_mismatch(self, embedding: list[float]) -> list[Flag]:
        assert self.enrolment is not None
        similarity = cosine(embedding, self.enrolment)
        if similarity >= self.cfg.mismatch_threshold:
            self.state.consecutive_mismatches = 0
            return []
        self.state.consecutive_mismatches += 1
        if self.state.consecutive_mismatches < self.cfg.mismatch_consecutive:
            return []
        run = self.state.consecutive_mismatches
        self.state.consecutive_mismatches = 0
        return [("voice_mismatch", {"cosine": round(similarity, 3), "consecutive": run})]

    def _check_second_voice(self, pcm: Any) -> list[Flag]:
        assert self.enrolment is not None
        size = int(_SUB_WINDOW_SECONDS * self.sample_rate)
        hop = int(_SUB_WINDOW_HOP_SECONDS * self.sample_rate)
        starts = list(range(0, len(pcm) - size + 1, hop))
        if len(starts) > _MAX_SUB_WINDOWS:  # long answers: sample evenly
            step = len(starts) / _MAX_SUB_WINDOWS
            starts = [starts[int(i * step)] for i in range(_MAX_SUB_WINDOWS)]
        windows = [self.embedder.embed(pcm[s : s + size]) for s in starts]
        if len(windows) < 2:
            return []
        min_pair = min(
            cosine(windows[i], windows[j])
            for i in range(len(windows))
            for j in range(i + 1, len(windows))
        )
        max_enrolled = max(cosine(w, self.enrolment) for w in windows)
        if (
            min_pair < self.cfg.second_voice_threshold
            and max_enrolled > self.cfg.second_voice_match
        ):
            return [
                (
                    "second_voice",
                    {
                        "min_pairwise": round(min_pair, 3),
                        "max_enrolment": round(max_enrolled, 3),
                        "windows": len(windows),
                    },
                )
            ]
        return []


# --- monitor (I/O shell) ------------------------------------------------------------------


class VoiceMonitor:
    """Taps the candidate's microphone in the LiveKit room and reports voice flags."""

    def __init__(self, *, settings: Settings, kind: str, attempt_id: str, room: Any) -> None:
        self.settings = settings
        self.kind = kind
        self.attempt_id = attempt_id
        self.room = room
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="voice-proctor")
        self._streams: list[Any] = []
        self._tasks: list[asyncio.Task[Any]] = []
        self._stopped = False

    async def start(self) -> None:
        from app.proctoring import service as proctoring_service
        from app.proctoring.enrolment import get_enrolment_registry

        try:
            if np is None:
                await self._session_event("voice_model_unavailable", {"reason": "numpy"})
                return
            loop = asyncio.get_running_loop()
            embedder = await loop.run_in_executor(self._executor, get_embedder, self.settings)
            if not embedder.available:
                await self._session_event("voice_model_unavailable", {"reason": "model"})
            enrolled = get_enrolment_registry().get(self.attempt_id)
            analyzer = VoiceAnalyzer(
                VoiceConfig.from_settings(self.settings),
                embedder,
                enrolled[0] if enrolled else None,
            )
            participant = await self._wait_for_candidate()
            if participant is None:
                return
            await self._analyze(participant, analyzer, proctoring_service)
        except asyncio.CancelledError:
            raise
        except Exception as err:
            logger.warning(f"Voice monitor stopped for {self.attempt_id}: {err}")

    async def stop(self) -> None:
        from app.proctoring.enrolment import get_enrolment_registry

        self._stopped = True
        for task in self._tasks:
            task.cancel()
        for stream in self._streams:
            with contextlib.suppress(Exception):
                await stream.aclose()
        self._executor.shutdown(wait=False, cancel_futures=True)
        get_enrolment_registry().pop(self.attempt_id)  # embeddings die with the session

    async def _wait_for_candidate(self) -> Any:
        while not self._stopped:
            for participant in list(self.room.remote_participants.values()):
                if str(participant.identity).startswith("candidate-"):
                    return participant
            await asyncio.sleep(0.5)
        return None

    async def _analyze(self, participant: Any, analyzer: VoiceAnalyzer, svc: Any) -> None:
        from livekit import rtc
        from livekit.agents import vad as agents_vad
        from livekit.plugins import silero

        audio = rtc.AudioStream.from_participant(
            participant=participant,
            track_source=rtc.TrackSource.SOURCE_MICROPHONE,
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )
        vad_stream = silero.VAD.load(sample_rate=SAMPLE_RATE).stream()
        self._streams += [audio, vad_stream]

        async def feed() -> None:
            async for event in audio:
                vad_stream.push_frame(event.frame)

        self._tasks.append(asyncio.create_task(feed(), name=f"voice-feed-{self.attempt_id}"))
        loop = asyncio.get_running_loop()
        probabilities: list[float] = []
        elapsed = 0.0
        async for event in vad_stream:
            if event.type == agents_vad.VADEventType.START_OF_SPEECH:
                probabilities = []
            elif event.type == agents_vad.VADEventType.INFERENCE_DONE:
                if event.speaking:
                    probabilities.append(event.probability)
                elif event.frames:
                    pcm = _frames_to_pcm(event.frames)
                    elapsed += len(pcm) / SAMPLE_RATE
                    flags = await loop.run_in_executor(
                        self._executor, analyzer.on_non_speech, pcm, event.probability, elapsed
                    )
                    await self._report(flags, svc)
            elif event.type == agents_vad.VADEventType.END_OF_SPEECH and event.frames:
                pcm = _frames_to_pcm(event.frames)
                elapsed += len(pcm) / SAMPLE_RATE
                flags = await loop.run_in_executor(
                    self._executor, analyzer.on_segment, pcm, list(probabilities), elapsed
                )
                del pcm
                await self._report(flags, svc)

    async def _report(self, flags: list[Flag], svc: Any) -> None:
        for type_, metrics in flags:
            if type_ == _ENROLMENT_FALLBACK:
                await svc.set_voice_status(
                    self.settings,
                    kind=self.kind,
                    attempt_id=self.attempt_id,
                    voice={"enrolled": True, "source": "interview_fallback", "model": "ecapa"},
                    session_event="enrolment_fallback",
                    metrics=metrics,
                )
                continue
            await svc.record_server_event(
                self.settings,
                kind=self.kind,
                attempt_id=self.attempt_id,
                type_=type_,
                metrics=metrics,
            )

    async def _session_event(self, type_: str, metrics: dict[str, Any]) -> None:
        from app.proctoring import service as proctoring_service

        await proctoring_service.record_server_event(
            self.settings, kind=self.kind, attempt_id=self.attempt_id, type_=type_, metrics=metrics
        )


def _frames_to_pcm(frames: Sequence[Any]) -> Any:
    chunks = [np.frombuffer(bytes(frame.data), dtype="<i2") for frame in frames]
    return np.concatenate(chunks).astype(np.float32) / 32768.0
