"""Sandbox content generation: fallback banks, LLM chain parsing, fallback on failure."""

import asyncio
from typing import Any

import pytest

from app.ai.sandbox import content
from app.ai.sandbox.models import SandboxProblem, WrittenExercise
from app.core.config import Settings


def _settings(*, ai: bool = False) -> Settings:
    return Settings(
        _env_file=None,
        environment="test",
        ai_api_key="sk-test" if ai else None,
    )


def _posting(**overrides: Any) -> dict[str, Any]:
    posting: dict[str, Any] = {
        "id": "pst_test",
        "title": "Backend Engineer",
        "description": "Build payment systems.",
        "question_pool": {
            "questions": [
                {"id": "q1", "prompt": "Design a ledger.", "competency": "System Design"},
                {"id": "q2", "prompt": "Review this code.", "competency": "Code Quality"},
            ]
        },
    }
    posting.update(overrides)
    return posting


class _FakeChain:
    """Minimal stand-in for a LangChain structured chain (ainvoke only)."""

    def __init__(self, result: Any = None, error: Exception | None = None):
        self._result = result
        self._error = error
        self.calls: list[dict[str, Any]] = []

    async def ainvoke(self, payload: dict[str, Any]) -> Any:
        self.calls.append(payload)
        if self._error is not None:
            raise self._error
        return self._result


def test_fallback_bank_has_valid_problems_per_difficulty() -> None:
    for difficulty in ("easy", "medium", "hard"):
        problem = content.fallback_coding_problem(difficulty)
        assert isinstance(problem, SandboxProblem)
        assert problem.id and problem.title and problem.statement
        assert problem.examples, difficulty
        assert problem.constraints, difficulty
        assert problem.starter_code.strip(), difficulty
        assert len(problem.rubric) >= 3, difficulty
        assert problem.language_hint == "python"


def test_fallback_bank_picks_deterministically_from_seed() -> None:
    first = content.fallback_coding_problem("medium", seed="posting-1")
    second = content.fallback_coding_problem("medium", seed="posting-1")
    assert first == second

    unknown = content.fallback_coding_problem("nightmare")
    medium_ids = {p.id for p in content._FALLBACK_BANK["medium"]}
    assert unknown.id in medium_ids


def test_fallback_written_exercise_builds_prompts_from_competencies() -> None:
    exercise = content.fallback_written_exercise(
        ["System Design", "Code Quality", "Mentoring", "Ignored Fourth"], "Engineer"
    )
    assert isinstance(exercise, WrittenExercise)
    # At most three topics become prompts, with stable ids.
    assert [p.id for p in exercise.prompts] == ["w1", "w2", "w3"]
    assert all(p.min_words >= 120 for p in exercise.prompts)
    assert "System Design" in exercise.prompts[0].question
    assert exercise.rubric

    # One competency still yields the two-prompt minimum.
    single = content.fallback_written_exercise(["Coaching"], "Lecturer")
    assert len(single.prompts) == 2

    # No competencies falls back to a generic prompt set.
    generic = content.fallback_written_exercise([], "")
    assert len(generic.prompts) >= 2


def test_posting_competencies_reads_pool_questions() -> None:
    assert content._posting_competencies(_posting()) == ["System Design", "Code Quality"]
    assert content._posting_competencies(_posting(question_pool=None)) == []


def test_generate_uses_fallback_without_ai_key() -> None:
    coding = asyncio.run(
        content.generate_sandbox_content(
            posting=_posting(),
            candidate_profile="",
            config={"type": "coding", "difficulty": "easy"},
            settings=_settings(),
        )
    )
    assert isinstance(coding, SandboxProblem)

    written = asyncio.run(
        content.generate_sandbox_content(
            posting=_posting(),
            candidate_profile="",
            config={"type": "written"},
            settings=_settings(),
        )
    )
    assert isinstance(written, WrittenExercise)
    # The fallback is grounded in the posting's pool competencies.
    assert "System Design" in written.prompts[0].question


def test_generate_coding_uses_llm_chain_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    llm_problem = content.fallback_coding_problem("hard").model_copy(
        update={"id": "llm-authored"}
    )
    fake = _FakeChain(result=llm_problem)
    monkeypatch.setattr(content, "_coding_chain", lambda settings: fake)

    result = asyncio.run(
        content.generate_sandbox_content(
            posting=_posting(),
            candidate_profile="Backend dev, 5 years",
            config={"type": "coding", "difficulty": "hard"},
            settings=_settings(ai=True),
        )
    )
    assert isinstance(result, SandboxProblem)
    assert result.id == "llm-authored"
    assert fake.calls[0]["job_title"] == "Backend Engineer"
    assert fake.calls[0]["difficulty"] == "hard"
    assert "payment systems" in fake.calls[0]["job_description"]


def test_generate_written_uses_llm_chain_when_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exercise = content.fallback_written_exercise(["Advising"], "Counselor")
    fake = _FakeChain(result=exercise)
    monkeypatch.setattr(content, "_written_chain", lambda settings: fake)

    result = asyncio.run(
        content.generate_sandbox_content(
            posting=_posting(),
            candidate_profile="",
            config={"type": "written"},
            settings=_settings(ai=True),
        )
    )
    assert isinstance(result, WrittenExercise)
    assert "Advising" in result.prompts[0].question
    # The chain received the pool-derived competency list.
    assert "System Design" in fake.calls[0]["competencies"]


def test_generate_falls_back_when_chain_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        content, "_coding_chain", lambda settings: _FakeChain(error=RuntimeError("boom"))
    )
    result = asyncio.run(
        content.generate_sandbox_content(
            posting=_posting(),
            candidate_profile="",
            config={"type": "coding", "difficulty": "medium"},
            settings=_settings(ai=True),
        )
    )
    assert result == content.fallback_coding_problem("medium", "pst_test")


def test_generate_written_falls_back_when_llm_returns_no_prompts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        content, "_written_chain", lambda settings: _FakeChain(result=WrittenExercise())
    )
    result = asyncio.run(
        content.generate_sandbox_content(
            posting=_posting(),
            candidate_profile="",
            config={"type": "written"},
            settings=_settings(ai=True),
        )
    )
    # The fallback guarantees at least two prompts.
    assert len(result.prompts) >= 2
