"""AI Feedback and Loophole Analysis Engine for Candidate Applications.

Analyzes candidate profile, CV, and answers against job requirements to pinpoint
missing competencies or 'loopholes', generating constructive, actionable
improvement guidance emailed to candidates upon rejection.
"""

from __future__ import annotations

import logging
import re
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


def _generate_holistic_heuristic_feedback(
    *,
    job_title: str,
    posting_requirements: str,
    interview_skipped: bool,
    answered_questions_count: int,
    interview_score: float | None,
    sandbox_unmodified: bool,
    sandbox_score: float | None,
    sandbox_notes: str,
    holistic_score: float,
) -> str:
    """Deterministic, transparent feedback guide when AI model is unconfigured or unavailable."""
    if interview_skipped and sandbox_unmodified:
        overview = (
            f"Your application assessment for **{job_title}** resulted in an overall score of **{holistic_score}/100**.\n"
            "The live voice interview was concluded without substantive competency responses (0 questions answered), "
            "and the technical sandbox assessment was submitted with an unmodified starter template. "
            "Because no technical solution or dialogue was attempted, no competency points could be credited."
        )
        interview_detail = "No questions were completed during the spoken session. The interview was ended before establishing technical signals."
        sandbox_detail = "The sandbox code was submitted without modifying the starter template. No functional algorithm or tests were implemented."
    elif interview_skipped:
        overview = (
            f"Your application assessment for **{job_title}** resulted in an overall score of **{holistic_score}/100**.\n"
            "The technical sandbox was evaluated, but the voice interview was skipped with 0 questions answered, which significantly lowered your overall evaluation."
        )
        interview_detail = "No competency questions were completed during the live spoken session."
        sandbox_detail = f"Sandbox scored {sandbox_score or 0}/100. {sandbox_notes or 'Solution submitted.'}"
    elif sandbox_unmodified:
        overview = (
            f"Your application assessment for **{job_title}** resulted in an overall score of **{holistic_score}/100**.\n"
            f"The voice interview was evaluated (score: {interview_score or 0}/100), but the technical sandbox was submitted without implementation changes."
        )
        interview_detail = f"Completed interview with {answered_questions_count} questions answered."
        sandbox_detail = "The starter template was submitted without functional implementation."
    else:
        overview = (
            f"Your application assessment for **{job_title}** resulted in an overall score of **{holistic_score}/100**.\n"
            f"Both the spoken interview and technical sandbox were evaluated against the core competencies of the role."
        )
        interview_detail = f"Interview score: {interview_score or 0}/100 across {answered_questions_count} questions."
        sandbox_detail = f"Sandbox score: {sandbox_score or 0}/100. {sandbox_notes or 'Code reviewed against rubric.'}"

    return (
        f"### 1. Assessment Overview & Score Analysis\n"
        f"{overview}\n\n"
        f"### 2. Evaluation Breakdown: Interview & Technical Sandbox\n"
        f"- **Voice Spoken Interview**: {interview_detail}\n"
        f"- **Technical Sandbox Assessment**: {sandbox_detail}\n\n"
        f"### 3. Key Competency Gaps & Missing Job Signals ('Loopholes')\n"
        f"To succeed in the **{job_title}** hiring pipeline, candidates must demonstrate practical proficiency in: "
        f"end-to-end service implementation, structured algorithmic problem solving, and clear verbal articulation of technical trade-offs.\n\n"
        f"### 4. Actionable Growth & Interview Preparation Roadmap\n"
        f"- **Prepare for Live Spoken Screening**: Practice answering behavioral and technical questions using the STAR framework (Situation, Task, Action, Result).\n"
        f"- **Timed Sandbox Practice**: Practice solving data structure and API challenges in timed, proctored environments under 30 minutes.\n"
        f"- **Hands-On Portfolio**: Build deployed demonstrations highlighting production features such as error boundaries, unit tests, and CI/CD pipelines.\n"
        f"- **Resume Alignment**: Directly highlight practical project outcomes and metrics on your profile before applying."
    )


async def synthesize_application_feedback_and_scoring(
    conn: Connection,
    *,
    attempt: dict[str, Any],
    settings: Settings | None = None,
) -> dict[str, Any]:
    """Holistically evaluate voice interview + sandbox assessment and write feedback to application."""
    cfg = settings or get_settings()
    app_id = attempt.get("application_id")
    if not app_id:
        return {"score": 0.0, "feedback": ""}

    app_row = conn.execute("SELECT * FROM applications WHERE id=?", (app_id,)).fetchone()
    if not app_row:
        return {"score": 0.0, "feedback": ""}
    application = dict(app_row)

    cand = store.get_candidate(conn, candidate_id=attempt["candidate_id"])
    user = store.get_user(conn, cand["user_id"]) if cand else None
    cand_name = (user or {}).get("display_name") or "Candidate"

    posting = (
        store.get_posting(conn, tenant_id=attempt["tenant_id"], posting_id=attempt["posting_id"])
        or store.get_published_posting(conn, attempt["posting_id"])
        or {}
    )
    job_title = posting.get("title") or "the position"
    posting_reqs = posting.get("requirements") or posting.get("description") or ""

    # Refresh attempt to get latest sandbox & interview state
    fresh_attempt = store.get_applied_attempt_by_id(conn, attempt_id=attempt["id"]) or attempt

    # 1. Voice Interview analysis
    transcripts = list(fresh_attempt.get("transcripts") or [])
    answer_assessments = list(fresh_attempt.get("answer_assessments") or [])
    interview_eval = fresh_attempt.get("evaluation") or {}
    interview_score = interview_eval.get("overall_score")

    # Count candidate words
    cand_words = sum(
        len(re.findall(r"\b\w+\b", str(entry.get("content") or entry.get("text") or "")))
        for entry in transcripts
        if (entry.get("role") or entry.get("speaker") or "").lower() in ("user", "candidate", "participant")
    )
    answered_questions_count = sum(
        1
        for a in answer_assessments
        if a.get("verdict") in ("sufficient", "needs_followup")
        and a.get("intent") in ("answer", "sufficient")
    )
    interview_skipped = bool(cand_words < 20 or answered_questions_count == 0)

    # 2. Technical Sandbox analysis
    sandbox = fresh_attempt.get("sandbox_session") or {}
    sandbox_eval = sandbox.get("evaluation") or {}
    sandbox_score = sandbox_eval.get("score")
    sandbox_notes = sandbox_eval.get("notes") or ""

    from app.services.sandbox import _is_unmodified_submission

    sandbox_unmodified = _is_unmodified_submission(sandbox)
    sandbox_submitted = sandbox.get("status") in ("submitted", "expired")

    # 3. Calculate holistic score
    if interview_skipped and (sandbox_unmodified or (sandbox_score is not None and sandbox_score == 0)):
        holistic_score = 0.0
    elif interview_skipped:
        holistic_score = round(float(sandbox_score or 0) * 0.5, 1)
    elif sandbox_unmodified or not sandbox_submitted:
        holistic_score = round(float(interview_score or 0) * 0.5, 1)
    else:
        i_s = float(interview_score) if interview_score is not None else 0.0
        s_s = float(sandbox_score) if sandbox_score is not None else 0.0
        holistic_score = round(0.5 * i_s + 0.5 * s_s, 1)

    # 4. Generate AI feedback guide
    feedback = ""
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
                "You are an empathetic, expert Senior Technical Talent Advisor and Career Mentor. "
                "Analyze the candidate's complete assessment results for a job application.\n"
                "Provide a detailed, honest, constructive, and empowering feedback guide in clean Markdown with these sections:\n\n"
                "### 1. Assessment Overview & Score Analysis\n"
                "(Provide an honest, transparent breakdown of the candidate's results. Explicitly mention if the voice interview was skipped/ended with 0 questions answered, or if the technical sandbox was submitted without code changes to the starter template. Explain clearly how this affected their score.)\n\n"
                "### 2. Evaluation Breakdown: Interview & Technical Sandbox\n"
                "- **Voice Spoken Interview**: Summarize communication depth, dialogue engagement, and technical responses.\n"
                "- **Technical Sandbox Assessment**: Summarize code implementation, correctness, approach, and problem-solving structure.\n\n"
                "### 3. Key Competency Gaps & Missing Job Signals ('Loopholes')\n"
                "(Identify 2-3 specific technical proficiencies, architectures, or practical experiences required by the job specification where proof/depth was missing.)\n\n"
                "### 4. Actionable Growth & Interview Preparation Roadmap\n"
                "(Give actionable, concrete steps: specific tools, project architectures to build, timed sandbox practice strategies, and interview readiness tips to succeed next time.)\n\n"
                "Tone: Candid, encouraging, respectful, and highly actionable. Reference specific technologies from the job requirements."
            )

            interview_desc = (
                "Interview skipped or concluded early with 0 questions answered."
                if interview_skipped
                else f"Answered {answered_questions_count} questions ({cand_words} words spoken). Score: {interview_score}/100."
            )
            sandbox_desc = (
                "Starter code template was submitted without modifications or implementation."
                if sandbox_unmodified
                else f"Score: {sandbox_score}/100. Notes: {sandbox_notes}"
            )

            human_prompt = (
                f"Job Title: {job_title}\n"
                f"Job Requirements:\n{posting_reqs}\n\n"
                f"Candidate Name: {cand_name}\n"
                f"Voice Interview Status: {interview_desc}\n"
                f"Sandbox Assessment Status: {sandbox_desc}\n"
                f"Overall Holistic Score: {holistic_score}/100\n\n"
                "Please generate the complete, personalized assessment feedback and roadmap."
            )

            response = await chat.ainvoke([SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)])
            feedback = str(response.content).strip()
        except Exception as err:
            logger.warning(f"AI application feedback generation failed, using heuristic: {err}")

    if not feedback:
        feedback = _generate_holistic_heuristic_feedback(
            job_title=job_title,
            posting_requirements=posting_reqs,
            interview_skipped=interview_skipped,
            answered_questions_count=answered_questions_count,
            interview_score=interview_score,
            sandbox_unmodified=sandbox_unmodified,
            sandbox_score=sandbox_score,
            sandbox_notes=sandbox_notes,
            holistic_score=holistic_score,
        )

    # Persist feedback and score
    store.update_application_feedback(conn, application_id=app_id, feedback=feedback)
    conn.execute(
        "UPDATE applications SET job_match_score=?, updated_at=? WHERE id=?",
        (holistic_score, store.utc_now(), app_id),
    )
    if cand and user:
        store.create_notification(
            conn,
            tenant_id=attempt["tenant_id"],
            recipient_user_id=cand["user_id"],
            title=f"Assessment Feedback Available: {job_title}",
            body="Your technical interview and sandbox evaluation feedback is now ready. View your personalized career roadmap.",
            link="/candidate/applications",
        )
    conn.commit()
    logger.info(f"Synthesized application feedback for {app_id} (score={holistic_score})")
    return {"score": holistic_score, "feedback": feedback}
