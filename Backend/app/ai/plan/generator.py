"""Generate the interview plan (persona + questions) before a session starts.

Job interviews keep every locked pool question verbatim (fairness); the LLM only
writes the persona, greeting, per-question sufficiency criteria, and closing.
Profile screenings let the LLM draft a 3-stage plan (general experience ->
confirm strongest area -> deep dive) grounded in pack competencies + CV text.
When no AI key is configured a deterministic template plan is returned so dev
and tests never touch the network.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.core.config import Settings
from app.logging import logger

from .models import InterviewerPersona, InterviewPlan, PlannedQuestion

# --- Strategy rules absorbed from the retired interview_strategies.py --------

_SHARED_RULES = """\
Rules that bind the whole interview:
- Always use second person ("you", "your"); the participant IS the candidate.
- Ground every question in real profile/CV/job-description facts only.
  Do NOT invent profile, employer, or job details.
- When an answer is vague, probe with one STAR follow-up
  (Situation -> Task -> Action -> Result), then move on.
- AI scores are advisory; never speak offer/reject decisions aloud.
"""

_JOB_RULES = (
    _SHARED_RULES
    + """\
- Every candidate for this posting is assessed against the SAME locked
  question pool; the planned questions are fixed and must not be rewritten.
- Cover each locked pool question by name before deep follow-ups.
"""
)

_PROFILE_RULES = (
    _SHARED_RULES
    + """\
- Goal: build a portable skill signal from concrete examples.
- Follow this dynamic 3-stage question plan:
  1. General Experience: ask about their general experience and background.
  2. Identify Strongest Area: from their answers and CV, confirm their
     strongest technical area with them (e.g. "It sounds like backend
     engineering is your strongest area. Is that right?").
  3. Deep Dive: spend the remainder on challenging, specific technical
     questions focused deeply on that single strongest area.
"""
)


class _QuestionGuidance(BaseModel):
    """LLM-authored assessment guidance for one locked pool question."""

    question_id: str
    sufficiency_criteria: str
    max_followups: int = 1


class _JobPlanDraft(BaseModel):
    """Everything the LLM may author for a job interview (questions stay verbatim)."""

    persona: InterviewerPersona
    greeting: str
    closing: str
    guidance: list[_QuestionGuidance] = Field(default_factory=list)


class _ProfilePlanDraft(BaseModel):
    """Full LLM-authored plan for a profile screening."""

    persona: InterviewerPersona
    greeting: str
    closing: str
    questions: list[PlannedQuestion] = Field(default_factory=list)


def _locked_questions(context: dict[str, Any]) -> list[dict[str, Any]]:
    return [q for q in (context.get("questions") or []) if isinstance(q, dict)]


def build_fallback_plan(context: dict[str, Any], settings: Settings) -> InterviewPlan:
    """Deterministic template plan used when no AI key is configured (tests/dev)."""
    subject = context.get("subject_name") or "Candidate"
    language = context.get("language") or settings.default_interview_language
    duration = int(context.get("duration_minutes") or settings.default_interview_length_minutes)
    questions = [
        PlannedQuestion(
            id=str(q.get("id") or f"q{idx}"),
            competency=str(q.get("competency") or q.get("theme") or f"Topic {idx}"),
            question=str(q.get("prompt") or q.get("text") or "").strip(),
            sufficiency_criteria=(
                "The answer gives a concrete example with actions and outcomes."
            ),
            max_followups=1,
        )
        for idx, q in enumerate(_locked_questions(context), start=1)
        if str(q.get("prompt") or q.get("text") or "").strip()
    ]
    if not questions:
        questions = [
            PlannedQuestion(
                id="q1",
                competency="General experience",
                question="Tell me about your recent experience and the work you are most proud of.",
                sufficiency_criteria="The answer names concrete work with outcomes.",
                max_followups=1,
            )
        ]
    return InterviewPlan(
        persona=InterviewerPersona(voice=settings.tts_voice),
        greeting=(
            f"Hello {subject}, and welcome. My name is Ayesha and I will be your "
            "interviewer today. I will ask you a few questions about your experience; "
            "please answer in your own words and take your time."
        ),
        questions=questions,
        closing=(
            "Thank you for your time today. That concludes our interview — "
            "your responses have been recorded and will be reviewed shortly. Goodbye."
        ),
        language=language,
        duration_minutes=duration,
    )


def _chat_model(settings: Settings) -> Any:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.plan_generation_model,
        api_key=settings.ai_api_key.get_secret_value() if settings.ai_api_key else None,
        timeout=float(settings.ai_timeout_seconds),
    )


def _job_plan_chain(settings: Settings) -> Any:
    """LangChain chain producing a _JobPlanDraft (module-level for testability)."""
    from langchain_core.prompts import ChatPromptTemplate

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You design the interviewer persona and assessment rubric for a "
                "structured job interview.\n" + _JOB_RULES,
            ),
            (
                "human",
                "Role: {job_title}\n\nJob description:\n{job_description}\n\n"
                "Candidate: {subject_name}\nCandidate profile/CV:\n{candidate_profile}\n\n"
                "Locked question pool (ids are fixed):\n{pool}\n\n"
                "Interview language: {language}. Duration: {duration} minutes.\n\n"
                "Return: a warm professional interviewer persona, a short spoken "
                "greeting addressed to the candidate by name, a brief spoken closing, "
                "and for EACH locked question id the sufficiency criteria a strong "
                "answer must meet (one or two sentences, concrete and checkable).",
            ),
        ]
    )
    return prompt | _chat_model(settings).with_structured_output(_JobPlanDraft)


def _profile_plan_chain(settings: Settings) -> Any:
    """LangChain chain producing a _ProfilePlanDraft (module-level for testability)."""
    from langchain_core.prompts import ChatPromptTemplate

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You design the interviewer persona and question plan for a "
                "profile screening interview.\n" + _PROFILE_RULES,
            ),
            (
                "human",
                "Candidate: {subject_name}\nCandidate profile/CV:\n{candidate_profile}\n\n"
                "Competency themes to cover: {competencies}\n\n"
                "Interview language: {language}. Duration: {duration} minutes.\n\n"
                "Return: a warm professional interviewer persona, a short spoken "
                "greeting addressed to the candidate by name, a brief spoken closing, "
                "and 3-5 planned questions following the 3-stage plan (general "
                "experience, confirm strongest area, deep dive). Give each question a "
                "stable id (q1, q2, ...), the competency it targets, the exact spoken "
                "question text, sufficiency criteria a strong answer must meet, and "
                "max_followups (0-2).",
            ),
        ]
    )
    return prompt | _chat_model(settings).with_structured_output(_ProfilePlanDraft)


async def _generate_job_plan(context: dict[str, Any], settings: Settings) -> InterviewPlan:
    """Locked pool stays verbatim; the LLM authors persona + assessment guidance."""
    locked = _locked_questions(context)
    pool_lines = "\n".join(
        f"- id={q.get('id')}: {q.get('prompt') or q.get('text')}"
        for q in locked
    )
    chain = _job_plan_chain(settings)
    candidate_profile = context.get("candidate_profile") or "No profile details available."
    draft: _JobPlanDraft = await chain.ainvoke(
        {
            "job_title": context.get("job_title") or "Open role",
            "job_description": context.get("job_description") or "No job description provided.",
            "subject_name": context.get("subject_name") or "Candidate",
            "candidate_profile": candidate_profile,
            "pool": pool_lines or "- (empty pool)",
            "language": context.get("language") or settings.default_interview_language,
            "duration": int(
                context.get("duration_minutes") or settings.default_interview_length_minutes
            ),
        }
    )
    guidance = {g.question_id: g for g in draft.guidance}
    questions: list[PlannedQuestion] = []
    for idx, q in enumerate(locked, start=1):
        text = str(q.get("prompt") or q.get("text") or "").strip()
        if not text:
            continue
        qid = str(q.get("id") or f"q{idx}")
        rubric = guidance.get(qid)
        questions.append(
            PlannedQuestion(
                id=qid,
                competency=str(q.get("competency") or q.get("theme") or ""),
                question=text,
                sufficiency_criteria=(
                    (rubric.sufficiency_criteria if rubric else "")
                    or "The answer addresses the question with a concrete example."
                ),
                max_followups=rubric.max_followups if rubric else 1,
            )
        )
    return InterviewPlan(
        persona=draft.persona,
        greeting=draft.greeting,
        questions=questions,
        closing=draft.closing,
        language=context.get("language") or settings.default_interview_language,
        duration_minutes=int(
            context.get("duration_minutes") or settings.default_interview_length_minutes
        ),
    )


async def _generate_profile_plan(context: dict[str, Any], settings: Settings) -> InterviewPlan:
    """LLM drafts a 3-stage screening plan grounded in pack competencies + CV."""
    competencies = [str(c) for c in (context.get("competencies") or []) if str(c).strip()]
    chain = _profile_plan_chain(settings)
    candidate_profile = context.get("candidate_profile") or "No profile details available."
    draft: _ProfilePlanDraft = await chain.ainvoke(
        {
            "subject_name": context.get("subject_name") or "Candidate",
            "candidate_profile": candidate_profile,
            "competencies": ", ".join(competencies) or "general professional experience",
            "language": context.get("language") or settings.default_interview_language,
            "duration": int(
                context.get("duration_minutes") or settings.default_interview_length_minutes
            ),
        }
    )
    return InterviewPlan(
        persona=draft.persona,
        greeting=draft.greeting,
        questions=draft.questions,
        closing=draft.closing,
        language=context.get("language") or settings.default_interview_language,
        duration_minutes=int(
            context.get("duration_minutes") or settings.default_interview_length_minutes
        ),
    )


async def generate_interview_plan(context: dict[str, Any], settings: Settings) -> InterviewPlan:
    """Return the interview plan, falling back to a deterministic template."""
    if not settings.ai_is_configured:
        logger.info("AI key not configured — using fallback interview plan")
        return build_fallback_plan(context, settings)
    try:
        if context.get("interview_type") == "job_interview":
            return await _generate_job_plan(context, settings)
        return await _generate_profile_plan(context, settings)
    except Exception as err:
        logger.error(
            f"Plan generation failed, using fallback plan: {err}", exc_info=True
        )
        return build_fallback_plan(context, settings)
