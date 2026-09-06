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
from pydantic import BaseModel, Field

class JobMatchEvaluation(BaseModel):
    score: float = Field(..., description="Compatibility score from 0.0 to 100.0")
    reasoning: str = Field(..., description="A short paragraph explaining the match based on candidate profile and interview vs the job description.")

async def evaluate_jd_match(
    candidate: dict[str, Any],
    posting: dict[str, Any],
    interview_transcripts: list[dict[str, Any]],
    settings: Settings | None = None
) -> JobMatchEvaluation | None:
    """Use LLM to generate a specific compatibility score against a JD."""
    cfg = settings or get_settings()
    if not cfg.ai_is_configured:
        return None

    try:
        from langchain_core.messages import SystemMessage, HumanMessage
        from langchain_openai import ChatOpenAI
        chat_model = ChatOpenAI(
            api_key=cfg.ai_api_key.get_secret_value(),
            model=cfg.ai_model,
            temperature=0,
            timeout=cfg.ai_timeout_seconds,
            max_retries=1,
        )
        structured = chat_model.with_structured_output(JobMatchEvaluation)
        
        system_prompt = (
            "You are an expert technical recruiter matching candidates to job postings. "
            "Analyze the candidate's profile and their initial profile interview transcript against the job description. "
            "Output a compatibility score (0-100) and a brief reasoning (2-3 sentences max) explaining your score. "
            "Be fair, objective, and focus heavily on technical alignment and depth demonstrated in their strongest area."
        )
        
        # Build candidate context
        profile_text = profile_text_for_embedding(candidate.get("profile", {}), candidate.get("parsed_cv"))
        transcript_text = json.dumps(interview_transcripts, indent=2)
        posting_text = f"{posting.get('title', '')}\n\n{posting.get('description', '')}\n\n{posting.get('requirements', '')}"
        
        human_prompt = (
            f"--- Job Description ---\n{posting_text}\n\n"
            f"--- Candidate Profile ---\n{profile_text}\n\n"
            f"--- Candidate Profile Interview Transcript ---\n{transcript_text}\n"
        )
        
        result = await structured.ainvoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)]
        )
        return result
    except Exception as e:
        import logging
        logging.error(f"Failed to evaluate JD match: {e}")
        return None
