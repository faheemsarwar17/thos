"""State carried through the LangGraph turn engine."""

from __future__ import annotations

from typing import Any, Literal, TypedDict

from app.ai.plan.models import InterviewPlan

Phase = Literal["greeting", "questioning", "closing", "done"]

# "noise" is set by the ingest node for trivially short answers so the
# assessment LLM call is skipped entirely.
Verdict = Literal["sufficient", "needs_followup", "off_topic", "noise"]


class TurnState(TypedDict, total=False):
    plan: InterviewPlan
    question_index: int
    followups_used: dict[str, int]
    coverage: dict[str, bool]
    assessments: list[dict[str, Any]]
    phase: Phase
    answer: str
    verdict: str
    suggested_followup: str
    utterance: str
    started_at: str


def new_turn_state(plan: InterviewPlan, *, started_at: str = "") -> TurnState:
    return TurnState(
        plan=plan,
        question_index=0,
        followups_used={},
        coverage={},
        assessments=[],
        phase="greeting",
        answer="",
        verdict="",
        suggested_followup="",
        utterance="",
        started_at=started_at,
    )
