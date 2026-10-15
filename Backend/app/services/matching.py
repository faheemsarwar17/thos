"""Proactive matching for published postings (MATCH-01).

Scores prefer profile↔job embedding similarity when vectors exist.
Falls back to skill/keyword overlap. Interview scores still blend in.
Only candidates with discovery consent (and no existing application)
receive proactive match notifications.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from app.core.config import Settings, get_settings
from app.db import store
from app.db.database import Connection
from app.services.cv_parse import posting_text_for_embedding, profile_text_for_embedding
from app.services.embeddings import decode_embedding, embed_text, similarity_percent

DEFAULT_WEIGHTS = {"cv_match": 0.4, "profile_interview_score": 0.6}
MATCH_THRESHOLD = 45.0
MAX_MATCHES = 25
MAX_NOTIFICATIONS = 10


def _tokenize(*parts: str) -> set[str]:
    tokens: set[str] = set()
    for part in parts:
        for token in re.findall(r"[a-z0-9][a-z0-9+#./-]{1,}", part.lower()):
            if len(token) >= 2:
                tokens.add(token)
    return tokens


def _skill_overlap(
    candidate_skills: list[str], pack_skills: list[str], posting_text: str
) -> tuple[float, list[str]]:
    candidate_set = {skill.strip().lower() for skill in candidate_skills if skill.strip()}
    pack_set = {skill.strip().lower() for skill in pack_skills if skill.strip()}
    posting_tokens = _tokenize(posting_text)
    matched: list[str] = []
    for skill in sorted(candidate_set):
        if skill in pack_set or any(token in skill or skill in token for token in posting_tokens):
            matched.append(skill)
    if not candidate_set:
        return 0.0, []
    ontology_hits = len([skill for skill in matched if skill in pack_set])
    score = min(100.0, (len(matched) / max(3, min(len(candidate_set), 8))) * 100.0)
    if ontology_hits:
        score = min(100.0, score + ontology_hits * 5)
    return score, matched[:5]


def ensure_posting_embedding(
    conn: Connection,
    *,
    tenant_id: str,
    posting: dict[str, Any],
    manifest: dict[str, Any],
    settings: Settings | None = None,
) -> list[float]:
    existing = decode_embedding(posting.get("embedding"))
    if existing:
        return existing
    cfg = settings or get_settings()
    vector, model = embed_text(
        posting_text_for_embedding(posting, manifest),
        settings=cfg,
    )
    store.update_posting(
        conn,
        tenant_id=tenant_id,
        posting_id=posting["id"],
        fields={
            "embedding": vector,
            "embedding_model": model,
            "embedded_at": datetime.now(UTC).isoformat(),
        },
    )
    posting["embedding"] = vector
    posting["embedding_model"] = model
    return vector


def ensure_candidate_embedding(
    conn: Connection,
    *,
    candidate: dict[str, Any],
    settings: Settings | None = None,
) -> list[float] | None:
    existing = decode_embedding(candidate.get("embedding"))
    if existing:
        return existing
    profile = candidate.get("profile") or {}
    text = profile_text_for_embedding(profile, candidate.get("parsed_cv"))
    if len(text.strip()) < 12:
        return None
    cfg = settings or get_settings()
    vector, model = embed_text(text, settings=cfg)
    now = datetime.now(UTC).isoformat()
    store.update_candidate(
        conn,
        candidate_id=candidate["id"],
        embedding=vector,
        embedding_model=model,
        embedded_at=now,
    )
    candidate["embedding"] = vector
    candidate["embedding_model"] = model
    candidate["embedded_at"] = now
    return vector


def score_candidate_for_posting(
    *,
    candidate: dict[str, Any],
    posting: dict[str, Any],
    manifest: dict[str, Any],
    interview_score: float | None,
    posting_embedding: list[float] | None = None,
    candidate_embedding: list[float] | None = None,
) -> dict[str, Any] | None:
    consents = candidate.get("consents") or {}
    if not consents.get("discovery"):
        return None

    profile = candidate.get("profile") or {}
    skills = list(profile.get("skills") or [])
    domains = list(candidate.get("target_domains") or [])
    pack_skills = list((manifest.get("ontology") or {}).get("skills") or [])
    posting_text = f"{posting.get('title', '')} {posting.get('description', '')}"
    skill_score, matched_skills = _skill_overlap(skills, pack_skills, posting_text)

    vector_score = similarity_percent(candidate_embedding, posting_embedding)
    used_vector = bool(candidate_embedding and posting_embedding and vector_score > 0)
    # Prefer the stronger CV signal so weak offline embeddings cannot
    # suppress clear skill overlap (and real embeddings can still win).
    if used_vector:
        cv_score = max(skill_score, vector_score)
        if matched_skills and vector_score >= 35:
            cv_score = min(100.0, cv_score + min(8.0, len(matched_skills) * 2))
    else:
        cv_score = skill_score

    weights = manifest.get("matching_weights") or DEFAULT_WEIGHTS
    cv_weight = float(weights.get("cv_match", DEFAULT_WEIGHTS["cv_match"]))
    interview_weight = float(
        weights.get("profile_interview_score", DEFAULT_WEIGHTS["profile_interview_score"])
    )
    total_weight = cv_weight + interview_weight or 1.0
    cv_weight /= total_weight
    interview_weight /= total_weight

    interview_component = float(interview_score) if interview_score is not None else 0.0
    overall = round((cv_score * cv_weight) + (interview_component * interview_weight), 1)

    reasons: list[str] = []
    if used_vector and vector_score >= skill_score:
        reasons.append(f"Profile embedding similarity {vector_score:.0f}%")
    elif used_vector:
        reasons.append(f"Embedding similarity {vector_score:.0f}% (skills ranked higher)")
    if matched_skills:
        reasons.append("Skill overlap: " + ", ".join(matched_skills))
    if interview_score is not None:
        reasons.append(
            f"Profile Interview {interview_score:.0f} on {manifest.get('pack_id', 'pack')}"
        )
    else:
        reasons.append("No Profile Interview score for this domain pack yet")
    pack_id = str(manifest.get("pack_id", ""))
    if pack_id and pack_id in domains:
        overall = min(100.0, overall + 5)
        reasons.append(f"Candidate targets domain '{pack_id}'")
    reasons.append("Discovery consent granted")

    if overall < MATCH_THRESHOLD and not matched_skills and interview_score is None and not used_vector:
        return None
    if overall < MATCH_THRESHOLD:
        return None

    return {
        "score": overall,
        "skill_score": round(cv_score, 1),
        "interview_score": round(interview_component, 1),
        "reasons": reasons,
    }


def run_posting_matching(
    conn: Connection,
    *,
    tenant_id: str,
    posting: dict[str, Any],
    manifest: dict[str, Any],
    notify: bool = True,
    settings: Settings | None = None,
) -> list[dict[str, Any]]:
    """Score consenting candidates and optionally notify the top matches."""
    cfg = settings or get_settings()
    posting_embedding = ensure_posting_embedding(
        conn,
        tenant_id=tenant_id,
        posting=posting,
        manifest=manifest,
        settings=cfg,
    )

    existing_apps = {
        application["candidate_id"]
        for application in store.list_applications_for_tenant(
            conn, tenant_id=tenant_id, posting_id=posting["id"]
        )
    }
    candidates = store.list_discoverable_candidates(conn)
    scored: list[dict[str, Any]] = []
    for candidate in candidates:
        if candidate["id"] in existing_apps:
            continue
        candidate_embedding = ensure_candidate_embedding(
            conn, candidate=candidate, settings=cfg
        )
        interview_score = store.best_profile_score_for_pack(
            conn, candidate_id=candidate["id"], pack_id=manifest["pack_id"]
        )
        result = score_candidate_for_posting(
            candidate=candidate,
            posting=posting,
            manifest=manifest,
            interview_score=interview_score,
            posting_embedding=posting_embedding,
            candidate_embedding=candidate_embedding,
        )
        if result is None:
            continue
        scored.append(
            {
                "candidate_id": candidate["id"],
                "user_id": candidate["user_id"],
                "display_name": candidate.get("display_name"),
                **result,
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    scored = scored[:MAX_MATCHES]
    saved = store.replace_posting_matches(
        conn,
        tenant_id=tenant_id,
        posting_id=posting["id"],
        matches=scored,
    )

    if notify:
        for match in saved[:MAX_NOTIFICATIONS]:
            if match.get("notified"):
                continue
            store.create_notification(
                conn,
                tenant_id=tenant_id,
                recipient_user_id=match["user_id"],
                title=f"New role match: {posting['title']}",
                body=(
                    f"You scored {match['score']:.0f} for “{posting['title']}”. "
                    + (match["reasons"][0] if match.get("reasons") else "Based on your profile.")
                ),
                link="/candidate/jobs",
            )
            store.mark_match_notified(conn, match_id=match["id"])
            match["notified"] = True

        if saved:
            members = store.list_members(conn, tenant_id=tenant_id)
            for member in members:
                if member.get("role") not in {"administrator", "hiring_manager", "recruiter"}:
                    continue
                store.create_notification(
                    conn,
                    tenant_id=tenant_id,
                    recipient_user_id=member["user_id"],
                    title=f"{len(saved)} talent match(es) for {posting['title']}",
                    body="Open the job to review explainable proactive matches.",
                    link=f"/jobs/{posting['id']}",
                )
                break

    return saved

import json
import logging
from pydantic import BaseModel, Field

logger = logging.getLogger("thos.ai")


class JobMatchEvaluation(BaseModel):
    score: float = Field(..., description="Compatibility score from 0.0 to 100.0")
    reasoning: str = Field(
        ...,
        description="A clear paragraph explaining the match based on candidate profile and screening interview vs the job description.",
    )
    strengths: list[str] = Field(
        default_factory=list,
        description="Key matched strengths or skills demonstrated by the candidate",
    )
    gaps: list[str] = Field(
        default_factory=list,
        description="Missing requirements, skill gaps, or areas for improvement",
    )
    recommendation: str = Field(
        default="match",
        description="Recruiter recommendation: strong_match, match, borderline, unqualified",
    )


async def evaluate_screening_with_ai(
    conn: Connection,
    *,
    candidate: dict[str, Any],
    posting: dict[str, Any],
    manifest: dict[str, Any] | None = None,
    settings: Settings | None = None,
) -> JobMatchEvaluation:
    """Evaluate candidate qualifications and initial screening interview against a JD using AI.

    Extracts:
    1. Candidate profile, parsed CV, skills, experience
    2. Completed profile interview attempts, evaluation score, rubric, and transcript
    3. Job requisition title, description, requirements, skills, work mode

    Returns a calibrated JobMatchEvaluation with a 0-100 score and explainable reasons.
    If LLM is offline or unavailable, generates a high-quality deterministic score
    combining semantic embeddings, ontology skill overlap, and verified interview score.
    """
    cfg = settings or get_settings()

    # 1. Gather profile interview attempts
    attempts = store.list_profile_attempts(conn, candidate_id=candidate["id"])
    completed_attempts = [
        a for a in attempts
        if a.get("status") in ("evaluated", "completed", "analyzed")
    ]
    pack_id = (manifest or {}).get("pack_id") or posting.get("pack_id")
    target_attempt = None
    if pack_id:
        for a in completed_attempts:
            if a.get("pack_id") == pack_id:
                target_attempt = a
                break
    if not target_attempt and completed_attempts:
        target_attempt = max(
            completed_attempts,
            key=lambda a: float((a.get("evaluation") or {}).get("overall_score", 0)),
        )

    transcripts = target_attempt.get("transcripts", []) if target_attempt else []
    interview_eval = target_attempt.get("evaluation") if target_attempt else None
    interview_score = (
        float(interview_eval.get("overall_score"))
        if interview_eval and interview_eval.get("overall_score") is not None
        else store.best_profile_score(conn, candidate_id=candidate["id"])
    )

    # 2. Embeddings & Overlap
    profile = candidate.get("profile") or {}
    skills = list(profile.get("skills") or [])
    pack_skills = list(((manifest or {}).get("ontology") or {}).get("skills") or [])
    posting_text = f"{posting.get('title', '')} {posting.get('description', '')} {posting.get('requirements', '')}"
    skill_score, matched_skills = _skill_overlap(skills, pack_skills, posting_text)

    posting_embedding = ensure_posting_embedding(
        conn,
        tenant_id=posting.get("tenant_id", ""),
        posting=posting,
        manifest=manifest or {},
        settings=cfg,
    )
    candidate_embedding = ensure_candidate_embedding(
        conn,
        candidate=candidate,
        settings=cfg,
    )
    vector_score = similarity_percent(candidate_embedding, posting_embedding)

    cv_score = (
        max(skill_score, vector_score)
        if (candidate_embedding and posting_embedding and vector_score > 0)
        else skill_score
    )
    if interview_score is not None:
        fallback_score = round((cv_score * 0.4) + (interview_score * 0.6), 1)
    else:
        fallback_score = round(cv_score, 1)

    # Ensure baseline score for candidates with meaningful profiles
    if fallback_score < 25 and (skills or profile.get("summary") or candidate.get("parsed_cv")):
        fallback_score = 40.0

    # 3. If AI is configured, invoke LLM
    if cfg.ai_is_configured:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            from langchain_openai import ChatOpenAI

            api_key = cfg.openai_api_key or (
                cfg.ai_api_key.get_secret_value() if cfg.ai_api_key else ""
            )
            if api_key:
                chat_model = ChatOpenAI(
                    api_key=api_key,
                    model=cfg.ai_model,
                    temperature=0.1,
                    timeout=float(cfg.ai_timeout_seconds),
                    max_retries=1,
                )
                structured = chat_model.with_structured_output(JobMatchEvaluation)

                system_prompt = (
                    "You are an expert hiring manager and technical talent evaluator. "
                    "Assess how well the candidate matches the job requisition based on their profile, CV, and their initial AI voice screening interview performance. "
                    "Output: "
                    "1. score: float from 0.0 to 100.0 representing overall fit for this role. "
                    "2. reasoning: a concise 2-3 sentence paragraph explaining why this score was awarded. "
                    "3. strengths: list of 2-4 key candidate strengths relevant to the job. "
                    "4. gaps: list of missing skills or requirements for this role. "
                    "5. recommendation: one of 'strong_match', 'match', 'borderline', 'unqualified'. "
                    "Be objective, balanced, and reward demonstrated depth in relevant skills."
                )

                profile_text = profile_text_for_embedding(profile, candidate.get("parsed_cv"))

                interview_summary = []
                if interview_score is not None:
                    interview_summary.append(f"Screening Interview Score: {interview_score:.1f}/100")
                if interview_eval:
                    if interview_eval.get("summary"):
                        interview_summary.append(f"Summary: {interview_eval.get('summary')}")
                    if interview_eval.get("strengths"):
                        interview_summary.append(
                            f"Strengths: {', '.join(interview_eval.get('strengths', []))}"
                        )
                    if interview_eval.get("growth_areas"):
                        interview_summary.append(
                            f"Growth areas: {', '.join(interview_eval.get('growth_areas', []))}"
                        )

                transcript_str = (
                    json.dumps(transcripts[:10], indent=2)
                    if transcripts
                    else "None recorded."
                )

                human_prompt = (
                    f"--- JOB REQUISITION ---\n"
                    f"Title: {posting.get('title', '')}\n"
                    f"Work Mode: {posting.get('work_mode', 'hybrid')}\n"
                    f"Description:\n{posting.get('description', '')}\n\n"
                    f"Requirements:\n{posting.get('requirements', '')}\n\n"
                    f"--- CANDIDATE PROFILE & CV ---\n"
                    f"{profile_text}\n\n"
                    f"--- INITIAL SCREENING INTERVIEW PERFORMANCE ---\n"
                    f"{chr(10).join(interview_summary) or 'No prior interview evaluated.'}\n\n"
                    f"--- INTERVIEW TRANSCRIPTS ---\n"
                    f"{transcript_str}\n"
                )

                result = await structured.ainvoke(
                    [SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)]
                )
                if result and isinstance(result, JobMatchEvaluation):
                    result.score = max(0.0, min(100.0, round(float(result.score), 1)))
                    return result
        except Exception as e:
            logger.warning(
                f"LLM screening evaluation failed, falling back to deterministic calculation: {e}"
            )

    # 4. Fallback deterministic evaluation
    reasons: list[str] = []
    if matched_skills:
        reasons.append(f"Matched skills: {', '.join(matched_skills)}")
    if vector_score > 0:
        reasons.append(f"Profile semantic match: {vector_score:.0f}%")
    if interview_score is not None:
        reasons.append(f"Screening interview score: {interview_score:.0f}/100")
    if not reasons:
        reasons.append("Evaluated against requisition qualifications and profile background")

    reasoning_text = ". ".join(reasons) + "."
    rec = (
        "strong_match"
        if fallback_score >= 80
        else (
            "match"
            if fallback_score >= 65
            else ("borderline" if fallback_score >= 45 else "unqualified")
        )
    )

    return JobMatchEvaluation(
        score=fallback_score,
        reasoning=reasoning_text,
        strengths=matched_skills[:4],
        gaps=[],
        recommendation=rec,
    )


async def evaluate_jd_match(
    candidate: dict[str, Any],
    posting: dict[str, Any],
    interview_transcripts: list[dict[str, Any]],
    settings: Settings | None = None,
    conn: Connection | None = None,
) -> JobMatchEvaluation | None:
    """Backward-compatible helper for evaluate_jd_match."""
    if conn is not None:
        return await evaluate_screening_with_ai(
            conn, candidate=candidate, posting=posting, settings=settings
        )
    cfg = settings or get_settings()
    from app.db.database import connect

    with connect(cfg.database) as local_conn:
        return await evaluate_screening_with_ai(
            local_conn, candidate=candidate, posting=posting, settings=settings
        )
