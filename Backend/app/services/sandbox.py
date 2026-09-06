"""Proctored sandbox lifecycle: start, autosave, violations, submit, evaluate.

The sandbox session lives on the applied attempt as a single JSON document
(``sandbox_session``); the candidate is the single writer, so whole-document
writes are race-free. Content is generated once at first start and reused on
resume. Evaluation is one structured LLM call with a deterministic fallback
when no AI key is configured.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.ai.sandbox import SandboxEvaluation, SandboxProblem, generate_sandbox_content
from app.core.config import Settings
from app.core.errors import ApiError
from app.db import store
from app.db.database import Connection
from app.logging import logger

STATUS_NOT_STARTED = "not_started"
STATUS_IN_PROGRESS = "in_progress"
STATUS_SUBMITTED = "submitted"
STATUS_EXPIRED = "expired"

_CLOSED_STATUSES = {STATUS_SUBMITTED, STATUS_EXPIRED}

# Grace window so an in-flight auto-submit fired at the deadline still lands.
SUBMIT_GRACE_SECONDS = 30
# Burst-dedup: the same violation type is recorded at most once per second.
VIOLATION_DEDUP_SECONDS = 1.0

MAX_RECORDING_BYTES = 500 * 1024 * 1024  # 500 MB

_EVAL_RULES = """\
Rules for grading:
- Score 0-100 strictly against the rubric; an empty or near-empty submission
  scores close to 0.
- Coding: judge correctness against the statement and examples, the approach,
  time/space complexity against the constraints, edge-case handling, and
  readability. Do NOT execute the code; reason about it.
- Written: judge relevance to each prompt, depth and specificity, structure
  and clarity, and whether the minimum word counts are met.
- breakdown maps 3-6 short criterion names to 0-100 subscores; the overall
  score must be consistent with them.
- notes is 2-4 sentences: what was strong, what was missing.
"""


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_ts(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _candidate_profile_text(candidate: dict[str, Any]) -> str:
    profile = candidate.get("profile") or {}
    parsed = candidate.get("parsed_cv") or {}
    parts = [
        profile.get("headline") or "",
        profile.get("summary") or "",
        "Skills: " + ", ".join(profile.get("skills") or []),
        parsed.get("summary") or "",
    ]
    return "\n".join(p for p in parts if p).strip()


# --- Candidate-facing view ----------------------------------------------------


def sanitize_session(session: dict[str, Any] | None) -> dict[str, Any] | None:
    """Strip grading internals (rubric, evaluation notes) from the candidate view."""
    if not isinstance(session, dict):
        return None
    clean = dict(session)
    for key in ("problem", "exercise"):
        content = clean.get(key)
        if isinstance(content, dict):
            clean[key] = {k: v for k, v in content.items() if k != "rubric"}
    evaluation = clean.get("evaluation")
    if isinstance(evaluation, dict):
        clean["evaluation"] = {"score": evaluation.get("score")}
    return clean


def load_sandbox_state(
    attempt: dict[str, Any], posting: dict[str, Any]
) -> dict[str, Any]:
    """GET payload: whether the sandbox is required, its config, and the session."""
    required = bool(posting.get("sandbox_required"))
    return {
        "required": required,
        "config": posting.get("sandbox_config") if required else None,
        "session": sanitize_session(attempt.get("sandbox_session")),
    }


# --- Lifecycle -----------------------------------------------------------------


async def start_sandbox(
    conn: Connection,
    *,
    attempt: dict[str, Any],
    candidate: dict[str, Any],
    posting: dict[str, Any],
    settings: Settings,
) -> dict[str, Any]:
    """Start (or resume) the sandbox; content is generated once and persisted."""
    if not posting.get("sandbox_required"):
        raise ApiError(
            code="sandbox_not_required",
            message="This posting does not require a sandbox assessment.",
            status_code=404,
        )
    if attempt.get("status") not in ("submitted", "evaluated"):
        raise ApiError(
            code="interview_not_completed",
            message="Complete the voice interview before starting the sandbox.",
            status_code=409,
        )
    existing = attempt.get("sandbox_session")
    if isinstance(existing, dict) and existing.get("status") in (
        STATUS_IN_PROGRESS,
        STATUS_SUBMITTED,
        STATUS_EXPIRED,
    ):
        # Idempotent resume: same problem, original deadline.
        return existing

    config = posting.get("sandbox_config") or {}
    sandbox_type = str(config.get("type") or "coding")
    time_limit = int(config.get("time_limit_minutes") or 30)
    content = await generate_sandbox_content(
        posting=posting,
        candidate_profile=_candidate_profile_text(candidate),
        config=config,
        settings=settings,
    )
    now = _now()
    session: dict[str, Any] = {
        "status": STATUS_IN_PROGRESS,
        "type": sandbox_type,
        "difficulty": str(config.get("difficulty") or "medium"),
        "time_limit_minutes": time_limit,
        "started_at": now.isoformat(),
        "deadline": (now + timedelta(minutes=time_limit)).isoformat(),
        "submitted_at": None,
        "submission": {
            "code": "",
            "language": (
                content.language_hint if isinstance(content, SandboxProblem) else None
            ),
            "answers": {},
            "updated_at": None,
        },
        "violations": [],
        "evaluation": None,
        "recording_path": None,
    }
    key = "problem" if isinstance(content, SandboxProblem) else "exercise"
    session[key] = content.model_dump()
    store.set_applied_attempt_sandbox(conn, attempt_id=attempt["id"], session=session)
    return session


def _load_active_session(
    conn: Connection, *, attempt: dict[str, Any]
) -> dict[str, Any]:
    """Return the in-progress session, lazily expiring it past the deadline."""
    session = attempt.get("sandbox_session")
    if not isinstance(session, dict) or session.get("status") == STATUS_NOT_STARTED:
        raise ApiError(
            code="sandbox_not_started",
            message="The sandbox has not been started yet.",
            status_code=409,
        )
    if session.get("status") in _CLOSED_STATUSES:
        raise ApiError(
            code="sandbox_closed",
            message="The sandbox has already been submitted.",
            status_code=409,
        )
    deadline = _parse_ts(session.get("deadline"))
    if deadline and _now() > deadline + timedelta(seconds=SUBMIT_GRACE_SECONDS):
        # Server-enforced deadline: expire inline and persist before failing.
        session["status"] = STATUS_EXPIRED
        store.set_applied_attempt_sandbox(conn, attempt_id=attempt["id"], session=session)
        conn.commit()
        raise ApiError(
            code="sandbox_closed",
            message="The sandbox time limit has elapsed.",
            status_code=409,
        )
    return session


def save_progress(
    conn: Connection,
    *,
    attempt: dict[str, Any],
    code: str | None = None,
    language: str | None = None,
    answers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Autosave the current submission; returns the (unchanged) deadline."""
    session = _load_active_session(conn, attempt=attempt)
    submission = session.setdefault("submission", {})
    if code is not None:
        submission["code"] = code
    if language is not None:
        submission["language"] = language
    if answers is not None:
        submission["answers"] = answers
    submission["updated_at"] = _now().isoformat()
    store.set_applied_attempt_sandbox(conn, attempt_id=attempt["id"], session=session)
    return {"deadline": session.get("deadline")}


def log_violation(
    conn: Connection,
    *,
    attempt: dict[str, Any],
    violation_type: str,
    detail: str = "",
) -> dict[str, Any]:
    """Append a proctoring violation; the same type is deduped within one second."""
    session = _load_active_session(conn, attempt=attempt)
    violations = session.setdefault("violations", [])
    now = _now()
    for past in reversed(violations):
        if past.get("type") != violation_type:
            continue
        at = _parse_ts(past.get("at"))
        if at and (now - at).total_seconds() < VIOLATION_DEDUP_SECONDS:
            return {"violations": len(violations), "deduplicated": True}
        break
    violations.append(
        {"type": violation_type, "detail": (detail or "")[:500], "at": now.isoformat()}
    )
    store.set_applied_attempt_sandbox(conn, attempt_id=attempt["id"], session=session)
    return {"violations": len(violations), "deduplicated": False}


async def submit_sandbox(
    conn: Connection,
    *,
    attempt: dict[str, Any],
    settings: Settings,
    auto: bool = False,
    code: str | None = None,
    language: str | None = None,
    answers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Finalize the sandbox: mark status, evaluate, and persist. Idempotent."""
    session = attempt.get("sandbox_session")
    if not isinstance(session, dict) or session.get("status") == STATUS_NOT_STARTED:
        raise ApiError(
            code="sandbox_not_started",
            message="The sandbox has not been started yet.",
            status_code=409,
        )
    if session.get("status") in _CLOSED_STATUSES:
        evaluation = session.get("evaluation") or {}
        return {"status": session["status"], "score": evaluation.get("score")}

    # Accept final progress with the submit so a fullscreen-exit auto-submit
    # cannot lose work written after the last autosave tick.
    if code is not None or language is not None or answers is not None:
        submission = session.setdefault("submission", {})
        if code is not None:
            submission["code"] = code
        if language is not None:
            submission["language"] = language
        if answers is not None:
            submission["answers"] = answers
        submission["updated_at"] = _now().isoformat()

    now = _now()
    deadline = _parse_ts(session.get("deadline"))
    expired = deadline is not None and now > deadline + timedelta(
        seconds=SUBMIT_GRACE_SECONDS
    )
    session["status"] = STATUS_EXPIRED if expired else STATUS_SUBMITTED
    session["submitted_at"] = now.isoformat()
    evaluation = await evaluate_sandbox(session, settings)
    session["evaluation"] = evaluation.model_dump()
    store.set_applied_attempt_sandbox(conn, attempt_id=attempt["id"], session=session)
    logger.info(
        f"Sandbox {'auto-' if auto else ''}submitted for attempt {attempt['id']} "
        f"(status={session['status']}, score={evaluation.score})"
    )
    return {"status": session["status"], "score": evaluation.score}


# --- Recording ------------------------------------------------------------------


def save_recording(settings: Settings, *, attempt_id: str, data: bytes) -> str:
    """Persist the proctoring webm under ``videos_dir``; returns the file name."""
    if not data:
        raise ApiError(
            status_code=422,
            code="empty_recording",
            message="The uploaded recording is empty.",
        )
    if len(data) > MAX_RECORDING_BYTES:
        raise ApiError(
            status_code=422,
            code="recording_too_large",
            message="The recording exceeds the 500 MB limit.",
        )
    root = Path(settings.videos_dir)
    root.mkdir(parents=True, exist_ok=True)
    file_name = f"sandbox_{attempt_id}.webm"
    (root / file_name).write_bytes(data)
    return file_name


def attach_recording(
    conn: Connection, *, attempt: dict[str, Any], file_name: str
) -> None:
    """Store the recording file name on the session JSON."""
    session = attempt.get("sandbox_session")
    if isinstance(session, dict):
        session["recording_path"] = file_name
        store.set_applied_attempt_sandbox(conn, attempt_id=attempt["id"], session=session)


# --- Evaluation ------------------------------------------------------------------


def _chat_model(settings: Settings) -> Any:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.plan_generation_model,
        api_key=settings.ai_api_key.get_secret_value() if settings.ai_api_key else None,
        timeout=float(settings.ai_timeout_seconds),
    )


def _evaluation_chain(settings: Settings) -> Any:
    """LangChain chain producing a SandboxEvaluation (module-level for testability)."""
    from langchain_core.prompts import ChatPromptTemplate

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You grade proctored hiring sandbox submissions.\n" + _EVAL_RULES,
            ),
            (
                "human",
                "Sandbox type: {sandbox_type}\nDifficulty: {difficulty}\n\n"
                "Assignment:\n{assignment}\n\n"
                "Grading rubric:\n{rubric}\n\n"
                "Candidate submission:\n{submission}\n\n"
                "Return the evaluation.",
            ),
        ]
    )
    return prompt | _chat_model(settings).with_structured_output(SandboxEvaluation)


def _assignment_text(session: dict[str, Any]) -> str:
    problem = session.get("problem")
    if isinstance(problem, dict):
        parts = [problem.get("title") or "", problem.get("statement") or ""]
        examples = [e for e in (problem.get("examples") or []) if isinstance(e, dict)]
        if examples:
            parts.append(
                "Examples:\n"
                + "\n".join(
                    f"- input: {e.get('input')} -> output: {e.get('output')}"
                    for e in examples
                )
            )
        constraints = problem.get("constraints") or []
        if constraints:
            parts.append("Constraints:\n" + "\n".join(f"- {c}" for c in constraints))
        return "\n\n".join(p for p in parts if p)
    exercise = session.get("exercise") or {}
    prompts = [p for p in (exercise.get("prompts") or []) if isinstance(p, dict)]
    return "\n\n".join(
        f"Prompt {p.get('id')} (min {p.get('min_words') or 0} words): {p.get('question')}"
        for p in prompts
    )


def _rubric_items(session: dict[str, Any]) -> list[str]:
    content = session.get("problem") or session.get("exercise") or {}
    if not isinstance(content, dict):
        return []
    return [str(r) for r in (content.get("rubric") or [])]


def _submission_for_eval(session: dict[str, Any]) -> str:
    submission = session.get("submission") or {}
    if session.get("type") == "written":
        answers = submission.get("answers") or {}
        if isinstance(answers, dict):
            return "\n\n".join(f"[{key}]\n{value}" for key, value in answers.items())
        return str(answers)
    language = submission.get("language") or "python"
    return f"Language: {language}\n\n{submission.get('code') or ''}"


def _submission_plain_text(session: dict[str, Any]) -> str:
    submission = session.get("submission") or {}
    if session.get("type") == "written":
        answers = submission.get("answers") or {}
        if isinstance(answers, dict):
            return "\n\n".join(str(v) for v in answers.values())
        return str(answers)
    return str(submission.get("code") or "")


def _keyword_coverage(text: str, rubric: list[str]) -> float:
    if not rubric:
        return 0.0
    words = set(re.findall(r"[a-z]{4,}", text.lower()))
    hits = 0
    for item in rubric:
        keywords = set(re.findall(r"[a-z]{4,}", item.lower()))
        if keywords & words:
            hits += 1
    return hits / len(rubric)


def _fallback_evaluation(session: dict[str, Any]) -> SandboxEvaluation:
    """Deterministic score: non-empty + length + rubric keyword coverage."""
    text = _submission_plain_text(session)
    if not text.strip():
        return SandboxEvaluation(
            score=0.0,
            breakdown={"completeness": 0.0},
            notes="No submission content was provided.",
        )
    if session.get("type") == "written":
        volume = min(1.0, len(text.split()) / 250.0)
    else:
        volume = min(1.0, len([ln for ln in text.splitlines() if ln.strip()]) / 20.0)
    coverage = _keyword_coverage(text, _rubric_items(session))
    score = round(100.0 * (0.4 + 0.3 * volume + 0.3 * coverage), 1)
    return SandboxEvaluation(
        score=min(score, 100.0),
        breakdown={
            "completeness": 100.0,
            "volume": round(volume * 100.0, 1),
            "rubric_coverage": round(coverage * 100.0, 1),
        },
        notes="Deterministic fallback evaluation (AI key not configured).",
    )


async def evaluate_sandbox(
    session: dict[str, Any], settings: Settings
) -> SandboxEvaluation:
    """Grade the submission against the rubric (LLM + deterministic fallback)."""
    if not settings.ai_is_configured:
        return _fallback_evaluation(session)
    try:
        chain = _evaluation_chain(settings)
        return await chain.ainvoke(
            {
                "sandbox_type": session.get("type") or "coding",
                "difficulty": session.get("difficulty") or "medium",
                "assignment": _assignment_text(session) or "(no assignment)",
                "rubric": "\n".join(f"- {r}" for r in _rubric_items(session))
                or "- Overall quality",
                "submission": _submission_for_eval(session) or "(empty submission)",
            }
        )
    except Exception as err:
        logger.error(
            f"Sandbox evaluation failed, using fallback scoring: {err}", exc_info=True
        )
        return _fallback_evaluation(session)
