"""AI Feedback and Loophole Analysis Engine for Candidate Applications.

Analyzes candidate profile, CV, and answers against job requirements to pinpoint
missing competencies or 'loopholes', generating constructive, actionable
improvement guidance emailed to candidates upon rejection.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import Settings, get_settings
from app.db import store
from app.db.database import Connection
from app.services.cv_parse import profile_text_for_embedding
from app.services.mail import OutboundMessage, get_mail_adapter

logger = logging.getLogger("thos.ai_feedback")


async def generate_candidate_improvement_feedback(
    *,
    candidate: dict[str, Any],
    posting: dict[str, Any],
    stage_label: str = "Screening",
    match_reasons: str | None = None,
    settings: Settings | None = None,
) -> str:
    """Generate constructive, actionable feedback identifying loopholes and growth areas."""
    cfg = settings or get_settings()

    job_title = posting.get("title", "the position")
    posting_reqs = posting.get("requirements") or posting.get("description") or ""
    candidate_profile = candidate.get("profile") or {}
    candidate_cv = candidate.get("parsed_cv")
    profile_text = profile_text_for_embedding(candidate_profile, candidate_cv)

    if cfg.ai_is_configured:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            from langchain_openai import ChatOpenAI

            chat = ChatOpenAI(
                api_key=cfg.ai_api_key.get_secret_value() if cfg.ai_api_key else cfg.openai_api_key,
                model=cfg.ai_model,
                temperature=0.3,
                timeout=cfg.ai_timeout_seconds,
                max_retries=1,
            )

            system_prompt = (
                "You are an empathetic, insightful Senior Talent Advisor and Career Coach. "
                "A candidate was not advanced during the hiring process. Your mission is to provide "
                "personalized, constructive, and actionable feedback so they understand where their application "
                "had gaps ('loopholes') compared to the job requirements, and how they can improve "
                "their skills and presentation for future applications.\n\n"
                "Format your response with the following clear markdown sections:\n"
                "### 1. Key Gaps & Missing Requirements\n"
                "(Identify 2-3 specific technical proficiencies, domain depth, or evidence that were missing or underdeveloped compared to the job description)\n\n"
                "### 2. Actionable Improvement Roadmap\n"
                "(Provide concrete steps: specific tools, concepts, open-source projects, or certifications that would close these gaps)\n\n"
                "### 3. Application & Resume Refinement Tips\n"
                "(Practical advice on how to better articulate their achievements, structure their CV, or present their strongest skills)\n\n"
                "Tone: Encouraging, professional, respectful, and genuinely helpful. Do not be generic; reference specifics from the job description and candidate background."
            )

            human_prompt = (
                f"Job Title: {job_title}\n\n"
                f"Job Requirements & Description:\n{posting_reqs}\n\n"
                f"Candidate Background:\n{profile_text}\n\n"
                f"Review Stage: {stage_label}\n"
                f"Prior Match Analysis: {match_reasons or 'Standard candidate review'}\n\n"
                "Please generate the personalized constructive feedback guide."
            )

            response = await chat.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)])
            feedback = str(response.content).strip()
            if feedback:
                return feedback
        except Exception as err:
            logger.warning(f"AI feedback generation failed, falling back to rule-based analysis: {err}")

    # Deterministic fallback when AI is unconfigured or unavailable
    candidate_skills = [str(s).lower().strip() for s in candidate_profile.get("skills") or []]
    return _generate_heuristic_feedback(
        job_title=job_title,
        posting_requirements=posting_reqs,
        candidate_skills=candidate_skills,
        stage_label=stage_label,
    )


def _generate_heuristic_feedback(
    *,
    job_title: str,
    posting_requirements: str,
    candidate_skills: list[str],
    stage_label: str,
) -> str:
    """Deterministic, structured feedback for environments without active LLM."""
    common_areas = ["system architecture", "automated testing", "production operations", "cloud scalability"]
    missing_highlights = [area for area in common_areas if area not in " ".join(candidate_skills)]

    return (
        f"### 1. Key Gaps & Missing Requirements\n"
        f"For the **{job_title}** position at the {stage_label} stage, our team prioritized candidates "
        f"demonstrating deep, direct experience with the primary requirements outlined in the role specification. "
        f"Your profile demonstrated strong core fundamentals, but lacked explicit depth in: "
        f"{', '.join(missing_highlights[:2]) or 'advanced hands-on production leadership and specialized tooling'}.\n\n"
        f"### 2. Actionable Improvement Roadmap\n"
        f"- **Deepen Domain Depth**: Build or contribute to projects demonstrating end-to-end implementation of {missing_highlights[0] if missing_highlights else 'the core tech stack'}.\n"
        f"- **Quantify Impact**: Highlight metrics (e.g., latency reduction, cost savings, user scale) alongside your skill list.\n"
        f"- **Expand Tooling**: Consider pursuing industry-recognized certifications or verifiable portfolio repositories.\n\n"
        f"### 3. Application & Resume Refinement Tips\n"
        f"- Tailor your summary to directly mirror the technical requirements of target roles.\n"
        f"- Include a 'Key Highlights' section at the top of your resume emphasizing your strongest technical accomplishments.\n"
        f"- Showcase open-source contributions or deployed demos to substantiate your practical experience."
    )


async def send_rejection_feedback_email(
    *,
    to_email: str,
    candidate_name: str,
    job_title: str,
    organization_name: str,
    feedback: str,
    settings: Settings | None = None,
) -> None:
    """Send personalized rejection email with growth-oriented improvement guidance."""
    adapter = get_mail_adapter(settings)
    subject = f"Application update & feedback: {job_title} at {organization_name}"
    body = (
        f"Hello {candidate_name},\n\n"
        f"Thank you for taking the time to apply for the {job_title} role at {organization_name}.\n\n"
        f"After thorough consideration across our applicant pool, we will not be moving forward with your "
        f"candidacy for this particular position at this time.\n\n"
        f"Because we are committed to transparent and constructive hiring, our team has prepared personalized "
        f"feedback identifying key areas where you can strengthen your profile for future opportunities:\n\n"
        f"--------------------------------------------------\n"
        f"{feedback}\n"
        f"--------------------------------------------------\n\n"
        f"We encourage you to continue developing these competencies and welcome you to apply for future "
        f"openings at {organization_name}.\n\n"
        f"Best regards,\nThe {organization_name} Recruiting Team"
    )

    try:
        await adapter.send(OutboundMessage(to_email=to_email, subject=subject, body=body))
        logger.info(f"Dispatched feedback email for {job_title} to {to_email}")
    except Exception as err:
        logger.error(f"Failed to send feedback email to {to_email}: {err}")
