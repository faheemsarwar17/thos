"""Post-session voice interview analysis with anti-hallucination guards."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any

import openai

from app.ai.prompts.analysis_templates import INDIVIDUAL_ANALYSIS_PROMPT
from app.ai.prompts.format_utils import escape_format_kwargs
from app.api.models.choices.tracking import InterviewStatus
from app.api.models.database import get_db_context
from app.api.models.interview import Interview
from app.core.config import Settings, get_settings
from app.db import store
from app.db.database import connect
from app.domain.evaluation import EVALUATOR_VERSION
from app.logging import logger

MIN_PARTICIPANT_WORDS = 20

# Identity verification statuses that must be stated explicitly in the report.
_IDENTITY_STATEMENTS = {
    "ambiguous": (
        "Identity verification was ambiguous: the live interview frame could not be "
        "matched to the profile photo on file with confidence."
    ),
    "mismatch": (
        "Identity verification flagged a possible mismatch between the live interview "
        "participant and the profile photo on file."
    ),
    "no_reference_photo": (
        "Identity was not verified: the participant has no profile photo on file to "
        "compare against."
    ),
    "unavailable": "Identity verification could not be completed for this session.",
}


def _apply_identity_verdict(report: dict[str, Any], verification: dict[str, Any]) -> None:
    """Attach the identity verdict to the report; ambiguous/mismatch are stated."""
    report["identity_verification"] = verification
    status = (verification or {}).get("status")
    statement = _IDENTITY_STATEMENTS.get(status or "")
    if not statement:
        return
    detail = (verification.get("detail") or "").strip()
    note = f"{statement} {detail}".strip() if detail else statement
    concerns = report.setdefault("concerns", [])
    if isinstance(concerns, list) and note not in concerns:
        concerns.append(note)
    summary = report.get("executive_summary")
    if isinstance(summary, str) and status in ("ambiguous", "mismatch"):
        report["executive_summary"] = f"{summary} Identity note: {note}".strip()


def _flatten_transcript(transcripts: list[dict[str, Any]] | None) -> str:
    lines: list[str] = []
    for entry in transcripts or []:
        role = entry.get("role") or entry.get("speaker") or "unknown"
        content = (entry.get("content") or entry.get("text") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _count_participant_words(transcripts: list[dict[str, Any]] | None) -> int:
    words = 0
    for entry in transcripts or []:
        role = (entry.get("role") or entry.get("speaker") or "").lower()
        if role not in {"user", "participant", "candidate"}:
            continue
        content = entry.get("content") or entry.get("text") or ""
        words += len(re.findall(r"\b\w+\b", content))
    return words


def _insufficient_report(participant_name: str) -> dict[str, Any]:
    return {
        "executive_summary": (
            f"{participant_name} did not provide substantive responses during this interview. "
            "The session was abandoned or contained insufficient dialogue for assessment."
        ),
        "overall_score": 1.0,
        "sentiment": {
            "label": "Insufficient Data",
            "description": "The participant did not engage meaningfully.",
        },
        "competency_scores": {
            "domain_correctness": {"score": 1.0, "rationale": "No assessable content."},
            "structure": {"score": 1.0, "rationale": "No assessable content."},
            "communication": {"score": 1.0, "rationale": "No assessable content."},
            "role_alignment": {"score": 1.0, "rationale": "No assessable content."},
        },
        "key_highlights": [],
        "concerns": ["Interview session contained no assessable professional content."],
        "star_analysis": {
            "situation": "Not assessable",
            "task": "Not assessable",
            "action": "Not assessable",
            "result": "Not assessable",
        },
        "recommendations": ["Reschedule when the candidate can complete a full conversation."],
        "data_quality": {
            "label": "Insufficient",
            "score": 0,
            "rationale": "Below minimum participant word threshold.",
        },
    }


def map_report_to_evaluation(
    report: dict[str, Any],
    *,
    pack_id: str = "",
    pack_version: str = "",
) -> dict[str, Any]:
    """Map synthesis report (1–10) into ATS evaluation (0–100)."""
    raw = float(report.get("overall_score") or 1.0)
    overall = max(0, min(100, round(raw * 10)))
    competency = report.get("competency_scores") or {}
    dimensions: list[dict[str, Any]] = []
    for key, payload in competency.items():
        if isinstance(payload, dict):
            score = float(payload.get("score") or 1.0)
            dimensions.append(
                {
                    "id": key,
                    "label": key.replace("_", " ").title(),
                    "score": max(0, min(100, round(score * 10))),
                    "rationale": payload.get("rationale") or "",
                }
            )
    highlights = list(report.get("key_highlights") or [])
    concerns = list(report.get("concerns") or [])
    return {
        "overall_score": overall,
        "dimensions": dimensions,
        "strengths": highlights,
        "gaps": concerns,
        "evidence": highlights[:5],
        "requires_human_decision": True,
        "evaluator_version": f"voice-llm-{EVALUATOR_VERSION}",
        "pack_id": pack_id,
        "pack_version": pack_version,
        "analysis": report,
        "data_quality": report.get("data_quality"),
    }


class SynthesisService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client: openai.AsyncOpenAI | None = None

    def _get_client(self) -> openai.AsyncOpenAI:
        if self._client is None:
            key = self.settings.openai_api_key or "unused"
            self._client = openai.AsyncOpenAI(api_key=key)
        return self._client

    def _load_identity_verdict(self, interview_id: str, kind: str) -> dict[str, Any] | None:
        """Read the recorded live identity verdict for this attempt, if any."""
        conn = None
        try:
            conn = connect(self.settings.database)
            if kind == "profile":
                attempt = store.get_profile_attempt_by_id(conn, attempt_id=interview_id)
            else:
                attempt = store.get_applied_attempt_by_id(conn, attempt_id=interview_id)
            return (attempt or {}).get("identity_verification")
        except Exception as exc:
            logger.error(f"Could not load identity verdict for {interview_id}: {exc}")
            return None
        finally:
            if conn is not None:
                conn.close()

    async def analyze_interview(self, interview_id: str) -> bool:
        logger.info(f"Starting voice interview analysis for {interview_id}")
        try:
            with get_db_context() as db:
                interview = db.query(Interview).filter(Interview.id == interview_id).first()
                if not interview:
                    logger.error(f"Interview {interview_id} not found for analysis")
                    return False
                if interview.status == InterviewStatus.ANALYZED:
                    return True

                transcripts = list(interview.transcripts or [])
                transcript_text = _flatten_transcript(transcripts)
                participant_words = _count_participant_words(transcripts)
                participant_name = "Candidate"

                if not transcript_text.strip() or participant_words < MIN_PARTICIPANT_WORDS:
                    report = _insufficient_report(participant_name)
                else:
                    prompt = INDIVIDUAL_ANALYSIS_PROMPT.format(
                        **escape_format_kwargs(
                            {
                                "interview_type": (
                                    interview.type.value
                                    if hasattr(interview.type, "value")
                                    else str(interview.type)
                                ),
                                "evaluation_title": "Hiring interview",
                                "evaluation_description": "Voice interview assessment",
                                "job_description": "See session configuration",
                                "kpi_list": "See coverage themes from attempt questions",
                                "cv_sections": "See candidate profile",
                                "subject_name": participant_name,
                                "participant_name": participant_name,
                                "duration_minutes": str(interview.duration_minutes or 10),
                                "transcript": transcript_text,
                            }
                        )
                    )
                    report = await self._call_llm_json(prompt)
                    if report is None:
                        report = _insufficient_report(participant_name)

                verification = self._load_identity_verdict(interview_id, interview.kind)
                if verification:
                    _apply_identity_verdict(report, verification)
                evaluation = map_report_to_evaluation(report)
                interview.report = report
                interview.evaluation = evaluation
                interview.status = InterviewStatus.ANALYZED
                db.commit()

            # Also write evaluation through store helpers for submitted_at.
            settings = self.settings
            conn = connect(settings.database)
            try:
                if interview.kind == "profile":
                    store.update_profile_interview_voice(
                        conn,
                        attempt_id=interview_id,
                        status="evaluated",
                        evaluation=evaluation,
                        transcripts=transcripts,
                        submitted_at=datetime.now(UTC).isoformat(),
                    )
                else:
                    store.update_applied_interview_voice(
                        conn,
                        attempt_id=interview_id,
                        status="evaluated",
                        evaluation=evaluation,
                        transcripts=transcripts,
                        submitted_at=datetime.now(UTC).isoformat(),
                    )
                conn.commit()
            finally:
                conn.close()
            return True
        except Exception as exc:
            logger.error(f"Error analyzing interview {interview_id}: {exc}", exc_info=True)
            return False

    async def check_and_synthesize(self, tracking_id: str) -> bool:
        """No-op for ATS (no 180° tracking cycles)."""
        return False

    async def _call_llm_json(self, prompt: str) -> dict[str, Any] | None:
        if not self.settings.ai_is_configured:
            return None
        try:
            response = await self._get_client().chat.completions.create(
                model=self.settings.analysis_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a rigorous hiring assessor. Return JSON only. "
                            "Score only from transcript evidence. Never invent facts."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            content = (response.choices[0].message.content or "").strip()
            if not content:
                return None
            return json.loads(content)
        except Exception as exc:
            logger.error(f"LLM analysis failed: {exc}", exc_info=True)
            return None


synthesis_service = SynthesisService()
