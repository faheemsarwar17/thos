"""Live-session proctoring hooks with fakes; no LiveKit needed (Task 5)."""

import asyncio
from typing import Any

import pytest

from app.ai.runtime import manager
from app.ai.runtime.session import InterviewSession
from app.core.config import Settings
from app.proctoring import service as proctoring_service


class _Handle:
    async def wait_for_playout(self) -> None:
        return None


class _Input:
    def __init__(self) -> None:
        self.audio: list[bool] = []

    def set_audio_enabled(self, enable: bool) -> None:
        self.audio.append(enable)


class FakeAgentSession:
    def __init__(self) -> None:
        self.said: list[str] = []
        self.interrupts = 0
        self.input = _Input()

    def interrupt(self, *, force: bool = False) -> None:
        self.interrupts += 1

    def say(self, text: str, allow_interruptions: bool = True) -> _Handle:
        self.said.append(text)
        return _Handle()


def _session(settings: Settings, **config: Any) -> tuple[InterviewSession, FakeAgentSession]:
    session = InterviewSession(
        attempt_id="pia_test",
        kind="profile",
        config={"proctoring_enabled": True, **config},
        settings=settings,
    )
    fake = FakeAgentSession()
    session.agent_session = fake  # type: ignore[assignment]
    session._started_ok = True
    return session, fake


def test_pausable_timer_keeps_remaining_time(settings: Settings) -> None:
    session, _ = _session(settings)
    clock = [0.0]
    session._now_loop = lambda: clock[0]

    async def run() -> None:
        session._start_timer(600)
        clock[0] = 100.0
        await session.pause_for_proctoring()
        assert session._timer_task is not None
        await asyncio.sleep(0)
        assert session._timer_task.cancelled() or session._timer_task.done()
        clock[0] = 1100.0  # time passes while the warning is open: no deadline burns
        await session.resume_after_proctoring()
        assert session._deadline_remaining == pytest.approx(500.0)
        session._timer_task.cancel()

    asyncio.run(run())


def test_pause_interrupts_and_mutes_then_resume_repeats_question(settings: Settings) -> None:
    session, fake = _session(settings)
    session._last_agent_text = "Tell me about a hard decision."

    async def run() -> None:
        session._start_timer(600)
        await session.pause_for_proctoring()
        await session.pause_for_proctoring()  # idempotent
        assert session._paused is True and fake.interrupts == 1 and fake.input.audio == [False]
        await session.resume_after_proctoring()
        assert session._paused is False and fake.input.audio == [False, True]
        assert fake.said == ["Thanks. Let's continue. Tell me about a hard decision."]
        session._timer_task.cancel()

    asyncio.run(run())


def test_resume_prefix_is_not_stacked(settings: Settings) -> None:
    session, _ = _session(settings)
    session._remember_agent_text("Thanks. Let's continue. Tell me about a hard decision.")
    assert session._last_agent_text == "Tell me about a hard decision."


def test_terminate_skips_closing_and_runs_once(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    session, fake = _session(settings)
    completed: list[str] = []
    analyses: list[str] = []

    async def fake_completed(reason: str) -> None:
        completed.append(reason)

    monkeypatch.setattr(session, "_send_completed", fake_completed)
    monkeypatch.setattr(session, "_schedule_analysis", lambda: analyses.append("x"))

    async def run() -> None:
        await session.terminate_for_proctoring("gaze_violation")
        await session.terminate_for_proctoring("gaze_violation")

    asyncio.run(run())
    assert fake.said == [] and fake.interrupts == 1
    assert completed == ["proctoring_terminated"] and analyses == ["x"]


def test_manager_without_session_returns_false() -> None:
    async def run() -> tuple[bool, bool, bool]:
        return (
            await manager.pause_for_proctoring("missing"),
            await manager.resume_after_proctoring("missing"),
            await manager.terminate_for_proctoring("missing", reason="gaze_violation"),
        )

    assert asyncio.run(run()) == (False, False, False)


def test_heartbeat_watchdog_flags_once(settings: Settings, monkeypatch: pytest.MonkeyPatch) -> None:
    tuned = settings.model_copy(
        update={
            "proctoring_heartbeat_timeout_seconds": 0.05,
            "proctoring_heartbeat_interval_seconds": 0.01,
        }
    )
    session, _ = _session(tuned)
    session._candidate_connected = True
    calls: list[tuple[str, str]] = []

    async def fake_record(settings: Settings, *, kind: str, attempt_id: str, type_: str, metrics):
        calls.append((attempt_id, type_))

    monkeypatch.setattr(proctoring_service, "record_server_event", fake_record)

    async def run() -> None:
        task = asyncio.create_task(session._heartbeat_watchdog())
        await asyncio.sleep(0.25)
        session._completed = True
        await asyncio.wait_for(task, timeout=1)

    asyncio.run(run())
    assert calls == [("pia_test", "detector_heartbeat_lost")]


def test_watchdog_ignores_paused_or_disconnected(
    settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    tuned = settings.model_copy(
        update={
            "proctoring_heartbeat_timeout_seconds": 0.02,
            "proctoring_heartbeat_interval_seconds": 0.01,
        }
    )
    session, _ = _session(tuned)
    session._candidate_connected = False
    calls: list[str] = []

    async def fake_record(settings: Settings, **kwargs: Any) -> None:
        calls.append(kwargs["type_"])

    monkeypatch.setattr(proctoring_service, "record_server_event", fake_record)

    async def run() -> None:
        task = asyncio.create_task(session._heartbeat_watchdog())
        await asyncio.sleep(0.1)
        session._completed = True
        await asyncio.wait_for(task, timeout=1)

    asyncio.run(run())
    assert calls == []
