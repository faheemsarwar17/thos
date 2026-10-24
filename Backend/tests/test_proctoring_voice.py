"""Server-side voice proctoring: heuristics, analyzer, enrolment route (Task 6)."""

import builtins
import io
import os
import wave
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")

from fastapi.testclient import TestClient  # noqa: E402

from app.core.config import Settings  # noqa: E402
from app.proctoring import enrolment, voice  # noqa: E402
from tests.proctoring_helpers import CANDIDATE, profile_attempt  # noqa: E402

SR = 16000
RNG = np.random.default_rng(7)


def _cfg(**overrides) -> voice.VoiceConfig:
    base = {
        "mismatch_threshold": 0.25,
        "mismatch_consecutive": 2,
        "second_voice_threshold": 0.30,
        "second_voice_match": 0.40,
        "min_segment_seconds": 1.5,
        "enrolment_fallback_seconds": 45.0,
    }
    base.update(overrides)
    return voice.VoiceConfig(**base)


class FakeEmbedder:
    """Maps a segment's mean sample value to a preset embedding."""

    name = "fake"
    available = True

    def __init__(self, table: dict[float, list[float]], default: list[float]) -> None:
        self.table = table
        self.default = default
        self.calls = 0

    def embed(self, pcm):
        self.calls += 1
        return self.table.get(round(float(pcm.mean()), 2), self.default)


ENROLLED = [1.0, 0.0, 0.0]
OTHER = [0.0, 1.0, 0.0]


def _constant(value: float, seconds: float):
    return np.full(int(SR * seconds), value, dtype=np.float32)


def test_spectral_flatness_noise_vs_tone() -> None:
    noise = RNG.standard_normal(1024).astype(np.float32)
    tone = np.sin(2 * np.pi * 200 * np.arange(1024) / SR).astype(np.float32)
    assert voice.spectral_flatness(noise) > 0.5
    assert voice.spectral_flatness(tone) < 0.1


def test_pause_ratio_and_rms_cv() -> None:
    assert voice.pause_ratio([1, 1, 0, 1]) == 0.25
    assert voice.pause_ratio([]) == 0.0
    steady = RNG.standard_normal(SR * 2).astype(np.float32)
    t = np.arange(SR * 2) / SR
    modulated = (steady * (0.5 + 0.5 * np.sin(2 * np.pi * 3 * t))).astype(np.float32)
    assert voice.rms_cv(steady) < 0.15
    assert voice.rms_cv(modulated) > 0.3
    assert voice.cosine([1, 0], [1, 0]) == pytest.approx(1.0)
    assert voice.cosine([1, 0], [0, 1]) == pytest.approx(0.0)


def test_mismatch_needs_two_consecutive_segments() -> None:
    embedder = FakeEmbedder({0.1: ENROLLED, 0.2: OTHER}, default=ENROLLED)
    analyzer = voice.VoiceAnalyzer(_cfg(), embedder, enrolment=ENROLLED)
    low, high = _constant(0.2, 2), _constant(0.1, 2)
    assert analyzer.on_segment(low, [0.9] * 10, t=1) == []
    assert analyzer.on_segment(high, [0.9] * 10, t=2) == []  # a match resets the run
    assert analyzer.on_segment(low, [0.9] * 10, t=3) == []
    flags = analyzer.on_segment(low, [0.9] * 10, t=4)
    assert [f[0] for f in flags] == ["voice_mismatch"]
    assert flags[0][1]["cosine"] == pytest.approx(0.0)
    assert analyzer.on_segment(_constant(0.2, 1.0), [0.9] * 10, t=5) == []  # too short


def test_second_voice_from_sub_windows() -> None:
    a, b = 0.3, 0.4
    embedder = FakeEmbedder({a: ENROLLED, b: OTHER}, default=ENROLLED)
    analyzer = voice.VoiceAnalyzer(_cfg(), embedder, enrolment=ENROLLED)
    # 4 s alternating 1 s blocks: speaker A, speaker B, A, B.
    pcm = np.concatenate([_constant(a, 1), _constant(b, 1), _constant(a, 1), _constant(b, 1)])
    flags = analyzer.on_segment(pcm, [0.9] * 40, t=1)
    assert "second_voice" in [f[0] for f in flags]


def test_fallback_enrolment_then_checks() -> None:
    embedder = FakeEmbedder({0.1: ENROLLED, 0.2: OTHER}, default=ENROLLED)
    analyzer = voice.VoiceAnalyzer(_cfg(enrolment_fallback_seconds=45), embedder, enrolment=None)
    seen: list[str] = []
    for i in range(5):  # 5 × 9.2 s = 46 s of speech
        seen += [f[0] for f in analyzer.on_segment(_constant(0.1, 9.2), [0.9] * 90, t=i)]
    assert seen == ["enrolment_fallback"]
    assert analyzer.enrolment is not None
    flags = []
    for i in range(2):
        flags += analyzer.on_segment(_constant(0.2, 2), [0.9] * 10, t=10 + i)
    assert [f[0] for f in flags] == ["voice_mismatch"]


def test_whisper_needs_baseline_then_flags() -> None:
    analyzer = voice.VoiceAnalyzer(_cfg(), voice.NullEmbedder(), enrolment=None)
    hop = 512  # 32 ms chunks, like Silero inference windows
    t = np.arange(hop) / SR
    hum = (np.sin(2 * np.pi * 120 * t) + 0.01 * RNG.standard_normal(hop)).astype(np.float32)
    whisper = (0.05 * RNG.standard_normal(hop)).astype(np.float32)
    # Before a baseline exists, nothing is flagged.
    assert analyzer.on_non_speech(whisper, 0.3, t=0) == []
    for i in range(int(20 * SR / hop) + 1):  # 20 s of quiet room hum
        assert analyzer.on_non_speech(hum, 0.05, t=i * hop / SR) == []
    flags: list = []
    for i in range(int(1.6 * SR / hop)):
        flags += analyzer.on_non_speech(whisper, 0.3, t=30 + i * hop / SR)
    assert [f[0] for f in flags] == ["whisper_background"]


def test_tts_cadence_is_low_confidence() -> None:
    analyzer = voice.VoiceAnalyzer(_cfg(), voice.NullEmbedder(), enrolment=None)
    steady = (0.2 * RNG.standard_normal(SR * 21)).astype(np.float32)
    flags = analyzer.on_segment(steady, [0.95] * 600, t=1)
    assert [f[0] for f in flags] == ["tts_cadence"]
    assert flags[0][1]["confidence"] == "low"
    paused = analyzer.on_segment(steady, [0.95] * 500 + [0.1] * 100, t=2)
    assert paused == []


def test_get_embedder_falls_back_without_speechbrain(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name.startswith("speechbrain"):
            raise ImportError("blocked for test")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    voice.reset_embedder_cache()
    embedder = voice.get_embedder(settings)
    assert isinstance(embedder, voice.NullEmbedder) and embedder.available is False
    voice.reset_embedder_cache()


def _wav(seconds: float, rate: int = SR, channels: int = 1) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(channels)
        out.setsampwidth(2)
        out.setframerate(rate)
        samples = (0.1 * RNG.standard_normal(int(rate * seconds) * channels) * 32767).astype("<i2")
        out.writeframes(samples.tobytes())
    return buffer.getvalue()


def test_decode_wav_rejects_wrong_format() -> None:
    pcm = enrolment.decode_wav_pcm16_mono_16k(_wav(1.0))
    assert len(pcm) == SR
    with pytest.raises(ValueError):
        enrolment.decode_wav_pcm16_mono_16k(_wav(1.0, rate=48000))
    with pytest.raises(ValueError):
        enrolment.decode_wav_pcm16_mono_16k(_wav(1.0, channels=2))
    with pytest.raises(ValueError):
        enrolment.decode_wav_pcm16_mono_16k(b"not a wav")


def test_registry_ttl() -> None:
    registry = enrolment.EnrolmentRegistry(ttl_seconds=10)
    clock = [0.0]
    registry._now = lambda: clock[0]
    registry.put("a1", [1.0, 0.0], source="device_check")
    assert registry.get("a1") == ([1.0, 0.0], "device_check")
    clock[0] = 11
    assert registry.get("a1") is None
    registry.put("a2", [1.0], source="device_check")
    registry.pop("a2")
    assert registry.get("a2") is None


def _files_under(root: Path) -> set[str]:
    return {os.path.join(d, f) for d, _, files in os.walk(root) for f in files}


def test_enrolment_route(
    client: TestClient, settings: Settings, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    base = f"/api/v1/candidates/me/profile-interview-attempts/{profile_attempt(client)}/voice"
    url = f"{base}/proctoring/enrolment"
    sample = _wav(8.0)

    monkeypatch.setattr(voice, "get_embedder", lambda settings: voice.NullEmbedder())
    before = _files_under(tmp_path)
    response = client.post(url, headers=CANDIDATE, files={"file": ("s.wav", sample, "audio/wav")})
    assert response.status_code == 200 and response.json() == {"enrolled": False}

    fake = FakeEmbedder({}, default=[0.6, 0.8, 0.0])
    monkeypatch.setattr(voice, "get_embedder", lambda settings: fake)
    response = client.post(url, headers=CANDIDATE, files={"file": ("s.wav", sample, "audio/wav")})
    assert response.status_code == 200 and response.json() == {"enrolled": True}
    attempt_id = base.split("/")[-2]
    assert enrolment.get_enrolment_registry().get(attempt_id) == ([0.6, 0.8, 0.0], "device_check")
    state = client.get(f"{base}/proctoring", headers=CANDIDATE).json()
    assert "voice" not in state  # candidates never see voice details

    wrong_rate = client.post(
        url, headers=CANDIDATE, files={"file": ("s.wav", _wav(8.0, rate=48000), "audio/wav")}
    )
    assert wrong_rate.status_code == 422
    too_short = client.post(
        url, headers=CANDIDATE, files={"file": ("s.wav", _wav(2.0), "audio/wav")}
    )
    assert too_short.status_code == 422
    # Only the SQLite database may change; no audio is ever written.
    after = _files_under(tmp_path)
    assert {
        f for f in after - before if not f.endswith((".db", "-wal", "-shm", "-journal"))
    } == set()
    enrolment.get_enrolment_registry().pop(attempt_id)
