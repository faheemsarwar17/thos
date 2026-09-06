"""Per-answer assessment: one fast structured LLM call per candidate turn.

The chain judges the answer against the current planned question's
sufficiency criteria. When no AI key is configured a deterministic
word-count heuristic keeps the engine fully functional in dev/tests.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Literal

from pydantic import BaseModel

from app.ai.plan.models import PlannedQuestion
from app.core.config import Settings
from app.logging import logger


class AnswerAssessment(BaseModel):
    """Structured verdict for one candidate answer."""

    verdict: Literal["sufficient", "needs_followup", "off_topic"]
    missing_point: str = ""
    suggested_followup: str = ""


# Async callable: (question, answer) -> AnswerAssessment
AssessFn = Callable[[PlannedQuestion, str], Awaitable[AnswerAssessment]]


def heuristic_assessment(*, min_words: int) -> AssessFn:
    """Deterministic fallback assessor (no AI key): long enough == sufficient."""

    async def _assess(question: PlannedQuestion, answer: str) -> AnswerAssessment:
        del question  # the heuristic only looks at the answer shape
        if len(answer.split()) >= min_words:
            return AnswerAssessment(verdict="sufficient")
        return AnswerAssessment(
            verdict="needs_followup",
            missing_point="detail",
            suggested_followup="Could you tell me a bit more about that?",
        )

    return _assess


def build_assessment_chain(settings: Settings) -> AssessFn | None:
    """LangChain structured-output assessor; None when no AI key is configured."""
    if not settings.ai_is_configured:
        return None

    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You assess one spoken interview answer at a time. Judge ONLY the "
                "answer against the question and its sufficiency criteria.\n"
                "Verdicts:\n"
                "- sufficient: the answer meets the criteria (concrete, on-topic).\n"
                "- needs_followup: on-topic but vague or missing a key point; provide "
                "a short, specific spoken follow-up question that asks for the "
                "missing point (STAR: situation, task, action, result).\n"
                "- off_topic: the answer does not address the question at all.\n"
                "Never invent facts about the candidate, employer, or role.",
            ),
            (
                "human",
                "Interview question: {question}\n"
                "Sufficiency criteria: {criteria}\n"
                "Candidate answer: {answer}",
            ),
        ]
    )
    llm = ChatOpenAI(
        model=settings.turn_assessment_model,
        max_tokens=settings.turn_assessment_max_tokens,
        api_key=settings.ai_api_key.get_secret_value() if settings.ai_api_key else None,
        timeout=float(settings.ai_timeout_seconds),
    )
    chain = prompt | llm.with_structured_output(AnswerAssessment)

    async def _assess(question: PlannedQuestion, answer: str) -> AnswerAssessment:
        try:
            return await chain.ainvoke(
                {
                    "question": question.question,
                    "criteria": question.sufficiency_criteria or "Addresses the question.",
                    "answer": answer,
                }
            )
        except Exception as err:
            # A failed assessment must never stall the interview — accept and move on.
            logger.warning(
                f"Answer assessment failed for question {question.id}; "
                f"treating as sufficient: {err}",
                exc_info=True,
            )
            return AnswerAssessment(verdict="sufficient")

    return _assess
