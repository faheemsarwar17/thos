"""GraphLLM: a LiveKit `LLM` adapter that delegates each turn to the TurnEngine.

The AgentSession pipeline calls `chat()` when the user's turn ends (final STT
transcript). We read the latest user message from the chat context, hand it to
the deterministic turn engine, and stream the composed utterance back — one
fast structured assessment call is the only model latency in the loop.
"""

from __future__ import annotations

from typing import Any

from livekit.agents.llm import (
    LLM,
    ChatChunk,
    ChatContext,
    ChoiceDelta,
    LLMStream,
    Tool,
)
from livekit.agents.types import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    APIConnectOptions,
    NotGivenOr,
)

from app.ai.graph.engine import TurnEngine
from app.logging import logger

_CHUNK_SIZE = 24  # characters per streamed chunk; small chunks start TTS sooner


class GraphLLM(LLM):
    def __init__(self, engine: TurnEngine) -> None:
        super().__init__()
        self._engine = engine
        self._handled_item_ids: set[str] = set()

    @property
    def model(self) -> str:
        return "turn-engine"

    @property
    def provider(self) -> str:
        return "thos"

    def chat(
        self,
        *,
        chat_ctx: ChatContext,
        tools: list[Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: NotGivenOr[bool] = NOT_GIVEN,
        tool_choice: NotGivenOr[Any] = NOT_GIVEN,
        extra_kwargs: NotGivenOr[dict[str, Any]] = NOT_GIVEN,
    ) -> LLMStream:
        return _GraphLLMStream(
            self,
            engine=self._engine,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )

    def _latest_user_text(self, chat_ctx: ChatContext) -> str | None:
        """Return the newest unhandled finalized user transcript, if any."""
        for item in reversed(chat_ctx.items):
            if getattr(item, "type", None) != "message":
                continue
            if getattr(item, "role", None) != "user":
                continue
            item_id = str(getattr(item, "id", "") or "")
            if item_id and item_id in self._handled_item_ids:
                return None
            try:
                # text_content is a @property in livekit-agents 1.x, not a method.
                text = (item.text_content or "").strip()
            except Exception as err:
                logger.warning(f"Failed to read chat item text: {err}", exc_info=True)
                text = ""
            if item_id:
                self._handled_item_ids.add(item_id)
            return text or None
        return None


class _GraphLLMStream(LLMStream):
    def __init__(self, llm: GraphLLM, *, engine: TurnEngine, **kwargs: Any) -> None:
        super().__init__(llm, **kwargs)
        self._graph_llm = llm
        self._engine = engine

    async def _run(self) -> None:
        utterance = await self._decide_utterance()
        if not utterance:
            return
        for start in range(0, len(utterance), _CHUNK_SIZE):
            self._event_ch.send_nowait(
                ChatChunk(
                    id=f"turn-{id(self)}",
                    delta=ChoiceDelta(
                        role="assistant",
                        content=utterance[start : start + _CHUNK_SIZE],
                    ),
                )
            )

    async def _decide_utterance(self) -> str:
        answer = self._graph_llm._latest_user_text(self._chat_ctx)
        if answer:
            logger.info(f"Turn engine handling answer: {answer[:80]!r}")
            return await self._engine.handle_answer(answer)
        if self._engine.state.get("phase") == "greeting":
            return await self._engine.opening()
        # No new answer (e.g. a stray generate_reply): re-ask the current question.
        question = self._engine.current_question()
        if question is not None:
            return question.question
        return ""
