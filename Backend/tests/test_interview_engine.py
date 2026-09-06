"""Unit tests for the interview plan generator and the LangGraph turn engine."""

from __future__ import annotations

import asyncio
from typing import Any

from pydantic import SecretStr

from app.ai.graph import TurnEngine, restore_coverage
from app.ai.graph.assess import AnswerAssessment
from app.ai.plan import build_fallback_plan, generate_interview_plan
from app.ai.plan.generator import _JobPlanDraft, _ProfilePlanDraft, _QuestionGuidance
from app.ai.plan.models import InterviewerPersona, InterviewPlan, PlannedQuestion
from app.core.config import Settings

LONG_ANSWER = (
    "In my last role I led the migration of our billing platform to event driven "
    "services, which cut processing time by forty percent across the whole team."
)
SHORT_ANSWER = "yeah ok"


def _settings(*, with_key: bool = False) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        ai_api_key=SecretStr("sk-test") if with_key else None,
    )


def _context(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "interview_type": "job_interview",
        "subject_name": "Ada Lovelace",
        "candidate_profile": "Backend engineer, 6 years, Python and Postgres.",
        "job_title": "Senior Backend Engineer",
        "job_description": "Build and scale our payments platform.",
        "questions": [
            {"id": "q1", "prompt": "Walk me through a scaling challenge.", "competency": "Systems"},
            {"id": "q2", "prompt": "How do you ensure code quality?", "competency": "Craft"},
        ],
        "competencies": ["Systems", "Craft"],
        "language": "English",
        "duration_minutes": 10,
    }
    base.update(overrides)
    return base


def _engine_plan(max_followups: int = 1) -> InterviewPlan:
    return InterviewPlan(
        persona=InterviewerPersona(name="Ayesha"),
        greeting="Hello Ada, welcome to your interview.",
        questions=[
            PlannedQuestion(
                id="q1",
                competency="Systems",
                question="Walk me through a scaling challenge.",
                sufficiency_criteria="Names a concrete challenge with outcomes.",
                max_followups=max_followups,
            ),
            PlannedQuestion(
                id="q2",
                competency="Craft",
                question="How do you ensure code quality?",
                sufficiency_criteria="Mentions reviews, tests, or CI.",
                max_followups=max_followups,
            ),
        ],
        closing="Thank you for your time, Ada. Goodbye.",
    )


def _fake_assess(verdict: str, followup: str = "What was the outcome?"):
    async def _assess(question: PlannedQuestion, answer: str) -> AnswerAssessment:
        return AnswerAssessment(verdict=verdict, suggested_followup=followup)

    return _assess


class _FakeChain:
    """Stand-in for a LangChain structured-output chain."""

    def __init__(self, draft: Any) -> None:
        self._draft = draft
        self.calls: list[dict[str, Any]] = []

    async def ainvoke(self, payload: dict[str, Any]) -> Any:
        self.calls.append(payload)
        return self._draft


# --------------------------------------------------------------- plan tests


def test_fallback_plan_when_no_ai_key() -> None:
    plan = asyncio.run(generate_interview_plan(_context(), _settings()))
    assert plan.persona.name == "Ayesha"
    assert [q.question for q in plan.questions] == [
        "Walk me through a scaling challenge.",
        "How do you ensure code quality?",
    ]
    assert all(q.sufficiency_criteria for q in plan.questions)
    assert plan.greeting and plan.closing


def test_fallback_plan_without_questions_has_default() -> None:
    plan = build_fallback_plan(_context(questions=[]), _settings())
    assert len(plan.questions) == 1
    assert plan.questions[0].question


def test_job_plan_embeds_locked_pool_verbatim(monkeypatch) -> None:
    draft = _JobPlanDraft(
        persona=InterviewerPersona(name="Maya", role="Hiring Interviewer"),
        greeting="Hi Ada, great to meet you.",
        closing="That wraps us up, thank you.",
        guidance=[
            _QuestionGuidance(question_id="q1", sufficiency_criteria="Concrete scale story."),
            _QuestionGuidance(
                question_id="q2", sufficiency_criteria="Mentions CI.", max_followups=2
            ),
        ],
    )
    fake = _FakeChain(draft)
    monkeypatch.setattr("app.ai.plan.generator._job_plan_chain", lambda settings: fake)

    plan = asyncio.run(generate_interview_plan(_context(), _settings(with_key=True)))

    # Locked pool questions are verbatim — only persona/rubric come from the LLM.
    assert [q.question for q in plan.questions] == [
        "Walk me through a scaling challenge.",
        "How do you ensure code quality?",
    ]
    assert plan.persona.name == "Maya"
    assert plan.questions[0].sufficiency_criteria == "Concrete scale story."
    assert plan.questions[1].max_followups == 2
    assert "Walk me through a scaling challenge" in fake.calls[0]["pool"]


def test_profile_plan_has_three_stages(monkeypatch) -> None:
    draft = _ProfilePlanDraft(
        persona=InterviewerPersona(name="Sara"),
        greeting="Hello, lovely to meet you.",
        closing="Thanks so much, goodbye.",
        questions=[
            PlannedQuestion(
                id="q1",
                competency="General Experience",
                question="Tell me about your background.",
                sufficiency_criteria="Overview with roles.",
            ),
            PlannedQuestion(
                id="q2",
                competency="Strongest Area",
                question="Which area do you consider your strongest?",
                sufficiency_criteria="Names and justifies one area.",
            ),
            PlannedQuestion(
                id="q3",
                competency="Deep Dive",
                question="Design a rate limiter for that stack.",
                sufficiency_criteria="Concrete design with trade-offs.",
            ),
        ],
    )
    fake = _FakeChain(draft)
    monkeypatch.setattr("app.ai.plan.generator._profile_plan_chain", lambda settings: fake)

    context = _context(interview_type="profile_screening")
    plan = asyncio.run(generate_interview_plan(context, _settings(with_key=True)))

    assert len(plan.questions) == 3
    assert [q.competency for q in plan.questions] == [
        "General Experience",
        "Strongest Area",
        "Deep Dive",
    ]
    assert plan.persona.name == "Sara"
    assert "Backend engineer" in fake.calls[0]["candidate_profile"]


def test_plan_generation_falls_back_on_chain_error(monkeypatch) -> None:
    class _BrokenChain:
        async def ainvoke(self, payload: dict[str, Any]) -> Any:
            raise RuntimeError("provider down")

    monkeypatch.setattr(
        "app.ai.plan.generator._job_plan_chain", lambda settings: _BrokenChain()
    )
    plan = asyncio.run(generate_interview_plan(_context(), _settings(with_key=True)))
    assert plan.persona.name == "Ayesha"  # deterministic fallback
    assert len(plan.questions) == 2


# ------------------------------------------------------------- engine tests


def test_opening_is_scripted_greeting_plus_first_question() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    opening = asyncio.run(engine.opening())
    assert "Hello Ada, welcome to your interview." in opening
    assert "Walk me through a scaling challenge." in opening
    assert engine.state["phase"] == "questioning"


def test_sufficient_answer_advances_with_exact_question_text() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    asyncio.run(engine.opening())
    utterance = asyncio.run(engine.handle_answer(LONG_ANSWER))
    assert utterance.endswith("How do you ensure code quality?")
    assert engine.state["question_index"] == 1
    assert engine.state["coverage"] == {"q1": True}
    assert engine.state["assessments"][0]["verdict"] == "sufficient"


def test_needs_followup_speaks_suggested_followup() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("needs_followup"))
    asyncio.run(engine.opening())
    utterance = asyncio.run(engine.handle_answer(LONG_ANSWER))
    assert utterance == "What was the outcome?"
    assert engine.state["question_index"] == 0
    assert engine.state["followups_used"] == {"q1": 1}


def test_exhausted_followups_advances() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("needs_followup"))
    asyncio.run(engine.opening())
    asyncio.run(engine.handle_answer(LONG_ANSWER))  # uses the single follow-up
    utterance = asyncio.run(engine.handle_answer(LONG_ANSWER))
    assert utterance.endswith("How do you ensure code quality?")
    assert engine.state["question_index"] == 1


def test_off_topic_redirects_and_repeats_question() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("off_topic"))
    asyncio.run(engine.opening())
    utterance = asyncio.run(engine.handle_answer(LONG_ANSWER))
    assert "Walk me through a scaling challenge." in utterance
    assert engine.state["question_index"] == 0


def test_noise_answer_waits_without_assessment() -> None:
    calls: list[str] = []

    async def _assess(question: PlannedQuestion, answer: str) -> AnswerAssessment:
        calls.append(answer)
        return AnswerAssessment(verdict="sufficient")

    engine = TurnEngine(_engine_plan(), assess=_assess)
    asyncio.run(engine.opening())
    utterance = asyncio.run(engine.handle_answer(SHORT_ANSWER))
    assert utterance.startswith("Take your time")
    assert engine.state["question_index"] == 0
    assert calls == []  # noise never reaches the assessment chain
    assert engine.state["assessments"] == []


def test_last_question_wraps_up() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    asyncio.run(engine.opening())
    asyncio.run(engine.handle_answer(LONG_ANSWER))  # advances to q2
    utterance = asyncio.run(engine.handle_answer(LONG_ANSWER))  # q2 is last
    assert utterance == "Thank you for your time, Ada. Goodbye."
    assert engine.state["phase"] == "done"
    assert engine.state["coverage"] == {"q1": True, "q2": True}


def test_force_wrap_returns_closing_and_ends() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    asyncio.run(engine.opening())
    closing = asyncio.run(engine.force_wrap())
    assert closing == "Thank you for your time, Ada. Goodbye."
    assert engine.is_done
    assert asyncio.run(engine.handle_answer(LONG_ANSWER)) == ""


def test_heuristic_assessor_used_when_no_chain() -> None:
    engine = TurnEngine(_engine_plan(), assess=None, noise_threshold_words=12)
    asyncio.run(engine.opening())
    utterance = asyncio.run(engine.handle_answer(LONG_ANSWER))
    # Long answer heuristically sufficient -> advances to the exact next question.
    assert utterance.endswith("How do you ensure code quality?")


# ---------------------------------------------------- resume / restore tests


def _log(question_id: str, verdict: str) -> dict[str, Any]:
    return {
        "question_id": question_id,
        "answer": "an answer",
        "verdict": verdict,
        "missing_point": "",
        "suggested_followup": "",
        "timestamp": "2026-01-01T00:00:00+00:00",
    }


def test_restore_coverage_resumes_after_last_sufficient_question() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    restore_coverage(engine, [_log("q1", "sufficient")])
    assert engine.state["question_index"] == 1
    assert engine.state["coverage"] == {"q1": True}
    assert engine.state["phase"] == "questioning"
    opening = asyncio.run(engine.opening())
    assert "How do you ensure code quality?" in opening
    assert "Hello Ada" not in opening  # the greeting is not replayed on resume


def test_restore_coverage_resumes_mid_followup() -> None:
    engine = TurnEngine(_engine_plan(max_followups=2), assess=_fake_assess("sufficient"))
    restore_coverage(engine, [_log("q1", "needs_followup")])
    assert engine.state["question_index"] == 0
    assert engine.state["followups_used"] == {"q1": 1}
    assert engine.state["coverage"] == {}


def test_restore_coverage_counts_exhausted_followups_as_covered() -> None:
    # max_followups=1: a second needs_followup means the live engine advanced.
    engine = TurnEngine(_engine_plan(max_followups=1), assess=_fake_assess("sufficient"))
    restore_coverage(
        engine, [_log("q1", "needs_followup"), _log("q1", "needs_followup")]
    )
    assert engine.state["coverage"] == {"q1": True}
    assert engine.state["question_index"] == 1


def test_restore_coverage_fully_covered_plan_restores_done() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    restore_coverage(engine, [_log("q1", "sufficient"), _log("q2", "sufficient")])
    assert engine.state["phase"] == "done"
    assert engine.is_done
    assert asyncio.run(engine.opening()) == ""


def test_restore_coverage_off_topic_leaves_question_uncovered() -> None:
    engine = TurnEngine(_engine_plan(), assess=_fake_assess("sufficient"))
    restore_coverage(engine, [_log("q1", "off_topic")])
    assert engine.state["question_index"] == 0
    assert engine.state["coverage"] == {}
