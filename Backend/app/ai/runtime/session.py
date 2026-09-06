"""InterviewSession: the whole LiveKit runtime for one voice interview.

Pipeline: Silero VAD -> OpenAI STT -> GraphLLM (LangGraph turn engine) ->
OpenAI TTS. Emits the same telemetry websocket messages the frontend already
consumes, so no frontend changes are required.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

from livekit import rtc
from livekit.agents import Agent, AgentSession
from livekit.api import AccessToken, VideoGrants
from livekit.plugins import openai, silero

from app.ai.graph import TurnEngine, build_assessment_chain, restore_coverage
from app.ai.plan import InterviewPlan, generate_interview_plan
from app.ai.utils.transcript_utils import normalize_transcript_entries
from app.core.config import Settings
from app.db import store
from app.db.database import connect
from app.logging import logger
from app.websocket.manager import get_websocket_manager

from .graph_llm import GraphLLM

_SAY_PLAYOUT_TIMEOUT = 60.0


class InterviewSession:
    """Owns the room connection, the agent pipeline, telemetry, and persistence."""

    def __init__(
        self,
        *,
        attempt_id: str,
        kind: str,
        config: dict[str, Any],
        settings: Settings,
    ) -> None:
        self.attempt_id = attempt_id
        self.kind = kind  # "profile" | "applied"
        self.config = config
        self.settings = settings
        self.websocket_manager = get_websocket_manager()
        self.room: rtc.Room | None = None
        self.agent_session: AgentSession | None = None
        self.engine: TurnEngine | None = None
        self.plan: InterviewPlan | None = None
        self._timer_task: asyncio.Task[None] | None = None
        self._tasks: set[asyncio.Task[Any]] = set()
        self._completed = False
        self._started_ok = False
        self._persisted_assessments = 0

    # ------------------------------------------------------------- lifecycle

    async def start(self) -> None:
        """Full setup: plan -> room -> pipeline -> opening utterance."""
        try:
            await self._send_setup("generating_persona")
            self.plan = await self._load_or_generate_plan()
            await self._send("interviewer_identity", {"name": self.plan.persona.name})

            await self._send_setup("connecting_to_room")
            self.room = rtc.Room()
            await self.room.connect(self.settings.livekit_ws_url, self._agent_token())
            logger.info(f"Interview session {self.attempt_id} joined room {self.room.name}")

            await self._send_setup("initializing_agents")
            self._build_pipeline()
            await self._send_transcript_history()
            assert self.agent_session is not None
            await self.agent_session.start(self._build_agent(), room=self.room)

            await self._send(
                "interview_setup_complete",
                {"status": "ready", "session_id": self.attempt_id},
            )
            duration = max(1, int(self.plan.duration_minutes or 10))
            self._timer_task = self._spawn(
                self._duration_timer(duration * 60),
                name=f"interview-timer-{self.attempt_id}",
            )
            self._started_ok = True
            opening = await self.engine.opening() if self.engine else ""
            if opening:
                self.agent_session.say(opening, allow_interruptions=True)
            elif self.engine is not None and self.engine.is_done:
                # Resume of an already-completed plan: close out immediately.
                await self._finish(reason="already_completed")
        except Exception as err:
            logger.error(f"Interview session {self.attempt_id} failed to start: {err}")
            await self._send(
                "interview_setup_failed",
                {"error": str(err), "session_id": self.attempt_id},
            )
            self._mark_failed()
            await self.stop()

    async def stop(self) -> None:
        """Tear down the pipeline and room connection."""
        if self._timer_task and not self._timer_task.done():
            self._timer_task.cancel()
        self._flush_assessments()  # never lose trailing assessments
        try:
            if self.agent_session is not None:
                await self.agent_session.aclose()
        except Exception as err:
            logger.warning(f"AgentSession close failed for {self.attempt_id}: {err}")
        self.agent_session = None
        try:
            if self.room is not None:
                await self.room.disconnect()
        except Exception as err:
            logger.warning(f"Room disconnect failed for {self.attempt_id}: {err}")
        self.room = None

    async def request_user_end(self) -> None:
        """Candidate clicked End Interview: speak the closing, then complete."""
        if not self._started_ok:
            return  # never started (or start failed) — nothing to wrap up
        await self._finish(reason="user_requested_end")

    @property
    def is_completed(self) -> bool:
        return self._completed

    @property
    def has_started(self) -> bool:
        return self._started_ok

    # --------------------------------------------------------------- setup

    async def _load_or_generate_plan(self) -> InterviewPlan:
        """Resume reuses the persisted plan; otherwise generate + persist a new one."""
        attempt = self._load_attempt()
        raw_plan = (attempt or {}).get("interview_plan")
        if isinstance(raw_plan, dict) and raw_plan.get("questions"):
            try:
                plan = InterviewPlan.model_validate(raw_plan)
                logger.info(f"Reusing persisted interview plan for {self.attempt_id}")
                return plan
            except Exception as err:
                logger.warning(f"Persisted plan invalid, regenerating: {err}")
        plan = await generate_interview_plan(self.config, self.settings)
        self._persist_plan(plan)
        return plan

    def _build_pipeline(self) -> None:
        assert self.plan is not None
        assess = build_assessment_chain(self.settings)
        self.engine = TurnEngine(
            self.plan,
            assess=assess,
            noise_threshold_words=self.settings.answer_max_words_followup_threshold,
        )
        prior = (self._load_attempt() or {}).get("answer_assessments") or []
        if prior:
            restore_coverage(self.engine, prior)
            self._persisted_assessments = len(prior)
        openai_key = (
            self.settings.openai_api_key
            or (self.settings.ai_api_key.get_secret_value() if self.settings.ai_api_key else None)
        )
        self.agent_session = AgentSession(
            vad=silero.VAD.load(min_silence_duration=self.settings.vad_min_silence_seconds),
            stt=openai.STT(
                model=self.settings.stt_model,
                api_key=openai_key or None,
            ),
            llm=GraphLLM(self.engine),
            tts=openai.TTS(
                model=self.settings.tts_model,
                voice=self.plan.persona.voice or self.settings.tts_voice,
                api_key=openai_key or None,
            ),
            turn_detection="vad",
            min_endpointing_delay=self.settings.endpointing_delay_seconds,
            allow_interruptions=True,
        )
        self._wire_events()

    def _build_agent(self) -> Agent:
        assert self.plan is not None
        persona = self.plan.persona
        instructions = (
            f"You are {persona.name}, a {persona.role} conducting a spoken interview.\n"
            f"Style: {persona.style}. Tone: {persona.tone}. Pace: {persona.pace}.\n"
            f"Interview language: {self.plan.language}.\n"
            "Hard rules:\n"
            "- Speak only the composed utterance you are given; never invent questions.\n"
            "- Never announce scores, verdicts, or internal decisions.\n"
            "- Do not invent facts about the candidate, employer, or role."
        )
        return Agent(instructions=instructions)

    def _agent_token(self) -> str:
        room_name = self.config.get("room_name") or f"interview-{self.attempt_id}"
        secret = self.settings.livekit_api_secret
        secret_value = secret.get_secret_value() if secret is not None else ""
        name = self.plan.persona.name if self.plan else "THOS Interviewer"
        return (
            AccessToken(self.settings.livekit_api_key, secret_value)
            .with_identity(f"agent-{self.attempt_id}")
            .with_name(name)
            .with_grants(VideoGrants(room_join=True, room=room_name, agent=True))
            .to_jwt()
        )

    # --------------------------------------------------------------- events

    def _wire_events(self) -> None:
        assert self.agent_session is not None
        session = self.agent_session

        @session.on("user_state_changed")
        def _on_user_state(ev: Any) -> None:
            if ev.new_state == "speaking":
                self._spawn(
                    self._send("user_speech_started", self._base()),
                    name="ws-user-speech-started",
                )
            elif ev.old_state == "speaking":
                self._spawn(
                    self._send("user_speech_ended", self._base()),
                    name="ws-user-speech-ended",
                )
                self._spawn(
                    self._send("agent_turn_pending", self._base()),
                    name="ws-agent-turn-pending",
                )

        @session.on("agent_state_changed")
        def _on_agent_state(ev: Any) -> None:
            if ev.new_state == "speaking":
                self._spawn(
                    self._send("agent_turn_cleared", self._base()),
                    name="ws-agent-turn-cleared",
                )
                self._spawn(
                    self._send("agent_speech_started", self._base()),
                    name="ws-agent-speech-started",
                )
            elif ev.old_state == "speaking":
                self._spawn(
                    self._send("agent_speech_ended", self._base()),
                    name="ws-agent-speech-ended",
                )
                if not self._completed:
                    self._spawn(
                        self._send("user_turn_granted", self._base()),
                        name="ws-user-turn-granted",
                    )

        @session.on("conversation_item_added")
        def _on_item(ev: Any) -> None:
            item = ev.item
            role = getattr(item, "role", "")
            if role not in ("user", "assistant"):
                return
            try:
                # text_content is a @property in livekit-agents 1.x.
                text = (item.text_content or "").strip()
            except Exception as err:
                logger.warning(f"Failed to read chat item text: {err}", exc_info=True)
                return
            if not text:
                return
            speaker = "user" if role == "user" else "agent"
            self._spawn(
                self._record_transcript(speaker, text),
                name=f"record-transcript-{self.attempt_id}",
            )

    # --------------------------------------------------------- background tasks

    def _spawn(self, coro: Any, *, name: str) -> asyncio.Task[Any]:
        """Fire-and-forget with a strong reference and exception logging.

        The event loop only weakly references tasks; without a stored reference
        a scheduled coroutine can be garbage-collected mid-flight, and its
        exceptions would die as "never retrieved".
        """
        task = asyncio.create_task(coro, name=name)
        self._tasks.add(task)
        task.add_done_callback(self._on_task_done)
        return task

    def _on_task_done(self, task: asyncio.Task[Any]) -> None:
        self._tasks.discard(task)
        if task.cancelled():
            return
        err = task.exception()
        if err is not None:
            logger.error(
                f"Background task {task.get_name()} failed: {err}", exc_info=err
            )

    # ----------------------------------------------------------- telemetry

    def _base(self) -> dict[str, Any]:
        return {
            "session_id": self.attempt_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    async def _send(self, msg_type: str, content: dict[str, Any]) -> None:
        try:
            await self.websocket_manager.send_message(
                self.attempt_id, {"type": msg_type, "content": content}
            )
        except Exception as err:
            logger.warning(f"Telemetry send failed ({msg_type}): {err}")

    async def _send_setup(self, status: str) -> None:
        await self._send(
            "setting_up_interview", {"status": status, "session_id": self.attempt_id}
        )

    async def _send_transcript_history(self) -> None:
        attempt = self._load_attempt()
        messages = normalize_transcript_entries((attempt or {}).get("transcripts"))
        if messages:
            await self._send("transcript_history", {"messages": messages})

    # --------------------------------------------------------- persistence

    def _load_attempt(self) -> dict[str, Any] | None:
        conn = connect(self.settings.database)
        try:
            if self.kind == "profile":
                return store.get_profile_attempt_by_id(conn, attempt_id=self.attempt_id)
            return store.get_applied_attempt_by_id(conn, attempt_id=self.attempt_id)
        finally:
            conn.close()

    def _persist_plan(self, plan: InterviewPlan) -> None:
        conn = connect(self.settings.database)
        try:
            writer = (
                store.set_profile_attempt_plan
                if self.kind == "profile"
                else store.set_applied_attempt_plan
            )
            writer(conn, attempt_id=self.attempt_id, plan=plan.model_dump())
            conn.commit()
        except Exception as err:
            logger.warning(f"Failed to persist interview plan for {self.attempt_id}: {err}")
        finally:
            conn.close()

    async def _record_transcript(self, speaker: str, text: str) -> None:
        """Append a transcript entry (WS broadcast + attempt row persistence)."""
        entry = {
            "session_id": self.attempt_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "speaker": speaker,
            "message": text,
            "message_type": "user_speech" if speaker == "user" else "agent_response",
        }
        await self._send("new_transcript_message", entry)
        try:
            from app.api.models.database import get_db_context
            from app.api.models.interview import Interview

            with get_db_context() as db:
                interview = db.query(Interview).filter(Interview.id == self.attempt_id).first()
                if interview is not None:
                    interview.transcripts.append(
                        {"role": speaker, "content": text, "timestamp": entry["timestamp"]}
                    )
                    interview.mark_dirty()
                    db.commit()
        except Exception as err:
            logger.warning(f"Transcript persistence failed for {self.attempt_id}: {err}")
        if speaker == "agent":
            self._flush_assessments()

    def _flush_assessments(self) -> None:
        """Persist any new per-answer assessments produced by the turn engine."""
        if self.engine is None:
            return
        log = self.engine.state.get("assessments", [])
        pending = log[self._persisted_assessments :]
        if not pending:
            return
        conn = connect(self.settings.database)
        try:
            appender = (
                store.append_profile_answer_assessment
                if self.kind == "profile"
                else store.append_applied_answer_assessment
            )
            for assessment in pending:
                appender(conn, attempt_id=self.attempt_id, assessment=assessment)
            conn.commit()
            self._persisted_assessments = len(log)
        except Exception as err:
            logger.warning(f"Assessment persistence failed for {self.attempt_id}: {err}")
        finally:
            conn.close()

    # ------------------------------------------------------------ completion

    async def _duration_timer(self, seconds: int) -> None:
        try:
            await asyncio.sleep(seconds)
            await self._finish(reason="time_limit")
        except asyncio.CancelledError:
            pass

    async def _finish(self, *, reason: str) -> None:
        if self._completed:
            return
        self._completed = True
        closing = ""
        if self.engine is not None:
            closing = await self.engine.force_wrap()
        if closing and self.agent_session is not None:
            try:
                handle = self.agent_session.say(closing, allow_interruptions=False)
                await asyncio.wait_for(
                    handle.wait_for_playout(), timeout=_SAY_PLAYOUT_TIMEOUT
                )
            except Exception as err:
                logger.warning(f"Closing utterance failed for {self.attempt_id}: {err}")
        self._flush_assessments()  # never lose trailing assessments
        await self._send_completed(reason)
        self._schedule_analysis()

    async def _send_completed(self, reason: str) -> None:
        covered = 0
        total = 0
        if self.engine is not None and self.plan is not None:
            covered = sum(1 for v in self.engine.state.get("coverage", {}).values() if v)
            total = len(self.plan.questions)
        await self._send(
            "interview_completed",
            {
                **self._base(),
                "status": "completed",
                "reason": reason,
                "questions_covered": covered,
                "questions_total": total,
            },
        )
        try:
            from app.api.models.choices.tracking import InterviewStatus
            from app.api.models.database import get_db_context
            from app.api.models.interview import Interview

            with get_db_context() as db:
                interview = db.query(Interview).filter(Interview.id == self.attempt_id).first()
                if interview is not None:
                    interview.status = InterviewStatus.COMPLETED
                    interview.mark_dirty()
                    db.commit()
        except Exception as err:
            logger.warning(f"Failed to mark interview {self.attempt_id} completed: {err}")

    def _mark_failed(self) -> None:
        """Start failed before the pipeline came up: persist a failed status."""
        try:
            from app.api.models.choices.tracking import InterviewStatus
            from app.api.models.database import get_db_context
            from app.api.models.interview import Interview

            with get_db_context() as db:
                interview = db.query(Interview).filter(Interview.id == self.attempt_id).first()
                if interview is not None:
                    interview.status = InterviewStatus.FAILED
                    interview.mark_dirty()
                    db.commit()
        except Exception as err:
            logger.warning(f"Failed to mark interview {self.attempt_id} failed: {err}")

    def _schedule_analysis(self) -> None:
        """Fire-and-forget post-interview analysis (same as the old runtime)."""
        try:
            from app.services.synthesis_service import synthesis_service

            self._spawn(
                synthesis_service.analyze_interview(self.attempt_id),
                name=f"analyze-interview-{self.attempt_id}",
            )
        except Exception as err:
            logger.error(f"Failed to schedule analysis for {self.attempt_id}: {err}")
