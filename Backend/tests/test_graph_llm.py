"""Regression tests for the GraphLLM LiveKit adapter.

These exercise the real livekit-agents ChatContext/LLMStream contract — the
unit tests for the turn engine alone never touch this adapter path.
"""

from __future__ import annotations

import asyncio

from livekit.agents.llm import ChatContext, LLMStream

from app.ai.graph import TurnEngine
from app.ai.plan.models import InterviewerPersona, InterviewPlan, PlannedQuestion
from app.ai.runtime.graph_llm import GraphLLM


def _plan() -> InterviewPlan:
    return InterviewPlan(
        persona=InterviewerPersona(name="Ayesha"),
        greeting="Hello, welcome.",
        questions=[
            PlannedQuestion(
                id="q1",
                competency="Systems",
                question="Walk me through a scaling challenge.",
                sufficiency_criteria="Concrete story.",
            )
        ],
        closing="That concludes our interview. Goodbye.",
    )


async def _collect(stream: LLMStream) -> str:
    parts: list[str] = []
    async for chunk in stream:
        if chunk.delta and chunk.delta.content:
            parts.append(chunk.delta.content)
    return "".join(parts)


def test_latest_user_text_reads_finalized_transcript() -> None:
    """`text_content` is a property in livekit-agents 1.x — regression guard."""
    llm = GraphLLM(TurnEngine(_plan(), noise_threshold_words=3))
    ctx = ChatContext()
    ctx.add_message(role="assistant", content="Walk me through a scaling challenge.")
    ctx.add_message(role="user", content="  I rewrote the batch pipeline overnight.  ")
    assert llm._latest_user_text(ctx) == "I rewrote the batch pipeline overnight."
    # The same finalized item is never handled twice.
    assert llm._latest_user_text(ctx) is None


def test_chat_streams_opening_for_fresh_context() -> None:
    async def run() -> str:
        llm = GraphLLM(TurnEngine(_plan(), noise_threshold_words=3))
        return await _collect(llm.chat(chat_ctx=ChatContext()))

    text = asyncio.run(run())
    assert "Hello, welcome." in text
    assert "Walk me through a scaling challenge." in text


def test_chat_routes_answer_through_engine() -> None:
    async def run() -> str:
        engine = TurnEngine(_plan(), noise_threshold_words=3)
        llm = GraphLLM(engine)
        await engine.opening()  # consume the greeting phase
        ctx = ChatContext()
        ctx.add_message(role="assistant", content="Walk me through a scaling challenge.")
        ctx.add_message(
            role="user",
            content="I rewrote the batch pipeline and cut processing time in half.",
        )
        return await _collect(llm.chat(chat_ctx=ctx))

    text = asyncio.run(run())
    # Single-question plan: a sufficient answer wraps up with the closing.
    assert text == "That concludes our interview. Goodbye."
