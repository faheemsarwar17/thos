"""Unit tests for voice interview config builders, readiness, and report mapping."""

import pytest

from app.ai.plan import build_fallback_plan
from app.core.config import Settings
from app.core.errors import ApiError
from app.services.synthesis_service import map_report_to_evaluation
from app.services.voice_interview import (
    build_job_interview_config,
    build_profile_screening_config,
    ensure_voice_ready,
)


def _settings() -> Settings:
    return Settings(_env_file=None, environment="test", ai_api_key=None)


def _candidate() -> dict:
    return {
        "display_name": "Ada Lovelace",
        "profile": {
            "full_name": "Ada Lovelace",
            "headline": "Backend Engineer",
            "skills": ["python", "postgres"],
        },
        "parsed_cv": {"summary": "Built payment systems."},
    }


def _attempt(questions: list[dict]) -> dict:
    return {
        "id": "pia_test",
        "questions": questions,
        "duration_minutes": 10,
        "room_name": "room-1",
        "transcripts": [],
    }


def test_profile_config_builds_structured_context() -> None:
    config = build_profile_screening_config(
        attempt=_attempt(
            [{"id": "q1", "prompt": "Tell me about yourself.", "competency": "General"}]
        ),
        candidate=_candidate(),
        settings=_settings(),
    )
    assert config["interview_type"] == "profile_screening"
    assert config["session_kind"] == "profile"
    assert config["subject_name"] == "Ada Lovelace"
    assert config["competencies"] == ["General"]
    assert "Backend Engineer" in config["candidate_profile"]
    assert config["questions"][0]["prompt"] == "Tell me about yourself."


def test_job_config_embeds_locked_pool_verbatim() -> None:
    questions = [
        {"id": "q1", "prompt": "Walk me through a scaling challenge.", "competency": "Systems"},
        {"id": "q2", "prompt": "How do you ensure code quality?", "competency": "Craft"},
    ]
    config = build_job_interview_config(
        attempt=_attempt(questions),
        candidate=_candidate(),
        posting={"title": "Senior Backend Engineer", "description": "Scale payments."},
        settings=_settings(),
    )
    assert config["interview_type"] == "job_interview"
    assert config["session_kind"] == "applied"
    assert config["job_title"] == "Senior Backend Engineer"
    assert "Scale payments." in config["job_description"]
    assert [q["prompt"] for q in config["questions"]] == [
        "Walk me through a scaling challenge.",
        "How do you ensure code quality?",
    ]

    # The fallback plan built from this context keeps the locked pool verbatim.
    plan = build_fallback_plan(config, _settings())
    assert [q.question for q in plan.questions] == [
        "Walk me through a scaling challenge.",
        "How do you ensure code quality?",
    ]


def test_profile_fallback_plan_covers_pack_competencies() -> None:
    config = build_profile_screening_config(
        attempt=_attempt(
            [
                {"id": "q1", "prompt": "Describe your experience.", "competency": "General"},
                {
                    "id": "q2",
                    "prompt": "Confirm your strongest area.",
                    "competency": "Strongest Area",
                },
                {"id": "q3", "prompt": "Deep dive: design a cache.", "competency": "Deep Dive"},
            ]
        ),
        candidate=_candidate(),
        settings=_settings(),
    )
    plan = build_fallback_plan(config, _settings())
    assert [q.competency for q in plan.questions] == ["General", "Strongest Area", "Deep Dive"]
    assert plan.persona.name == "Ayesha"
    assert plan.greeting and plan.closing


def test_map_report_scales_score_and_requires_human() -> None:
    evaluation = map_report_to_evaluation(
        {
            "overall_score": 7.2,
            "competency_scores": {
                "domain_correctness": {"score": 8.0, "rationale": "Clear examples"}
            },
            "key_highlights": ["Led a cohort"],
            "concerns": ["Thin on metrics"],
        }
    )
    assert evaluation["overall_score"] == 72
    assert evaluation["requires_human_decision"] is True
    assert evaluation["dimensions"][0]["score"] == 80


def test_ensure_voice_ready_fails_without_config() -> None:
    settings = Settings(
        _env_file=None,
        livekit_url=None,
        livekit_api_key=None,
        livekit_api_secret=None,
        ai_api_key=None,
    )
    with pytest.raises(ApiError) as exc:
        ensure_voice_ready(settings)
    assert exc.value.status_code == 503
