"""Session registry for live voice interviews (replaces AgentOrchestrator)."""

from __future__ import annotations

import asyncio
from typing import Any

from app.core.config import Settings
from app.logging import logger

from .session import InterviewSession

_sessions: dict[str, InterviewSession] = {}
_start_tasks: dict[str, asyncio.Task[None]] = {}
_lock = asyncio.Lock()


async def start_session(
    *,
    session_id: str,
    kind: str,
    config: dict[str, Any],
    settings: Settings,
) -> None:
    """Create (or reuse) the interview session and kick off its setup task."""
    async with _lock:
        pending = _start_tasks.get(session_id)
        if pending and not pending.done():
            logger.info(f"Voice start already in progress for {session_id}")
            return
        existing = _sessions.get(session_id)
        if existing is not None:
            if not existing.is_completed:
                logger.info(f"Voice session {session_id} already active")
                return
            await existing.stop()
        session = InterviewSession(
            attempt_id=session_id, kind=kind, config=config, settings=settings
        )
        _sessions[session_id] = session
        _start_tasks[session_id] = asyncio.create_task(
            session.start(), name=f"start-voice-{session_id}"
        )


async def end_session(session_id: str) -> None:
    """Speak the closing if needed, then tear the session down."""
    async with _lock:
        pending = _start_tasks.pop(session_id, None)
        if pending and not pending.done():
            pending.cancel()
        session = _sessions.pop(session_id, None)
    if session is None:
        return
    # Only wrap up sessions that actually started; a failed/never-started
    # interview must not be marked completed (start() already marked it failed).
    if not session.is_completed and session.has_started:
        await session.request_user_end()
    await session.stop()


def get_session(session_id: str) -> InterviewSession | None:
    return _sessions.get(session_id)


async def request_user_end(session_id: str) -> None:
    """Telemetry WS signal: the candidate asked to end the interview."""
    session = get_session(session_id)
    if session is not None:
        await session.request_user_end()
