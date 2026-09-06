"""CV parsing: LLM when configured, deterministic heuristic otherwise."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.schemas.cv import CvSection, ParsedCv, ProfileHints

_HEADING_RE = re.compile(
    r"(?im)^(summary|profile|objective|experience|work experience|employment|"
    r"education|skills|technical skills|projects|certifications|credentials|"
    r"achievements|publications)\s*:?\s*$"
)


class _LlmParsedCv(BaseModel):
    sections: list[CvSection] = Field(default_factory=list)
    headline: str | None = None
    summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    credentials: list[str] = Field(default_factory=list)
    experiences: list[str] = Field(default_factory=list)


def flatten_parsed_cv(parsed: ParsedCv | dict) -> str:
    if isinstance(parsed, dict):
        parsed = ParsedCv.model_validate(parsed)
    chunks: list[str] = []
    for section in parsed.sections:
        header = section.title.strip()
        if section.description.strip():
            header = f"{header}: {section.description.strip()}"
        chunks.append(header)
        chunks.extend(item.strip() for item in section.content if item.strip())
    return "\n".join(chunks)


def profile_text_for_embedding(profile: dict, parsed_cv: dict | None = None) -> str:
    parts = [
        str(profile.get("headline") or ""),
        str(profile.get("summary") or ""),
        "Skills: " + ", ".join(profile.get("skills") or []),
        "Credentials: " + ", ".join(profile.get("credentials") or []),
        "Experience: " + "; ".join(profile.get("experiences") or []),
    ]
    if parsed_cv:
        parts.append(flatten_parsed_cv(parsed_cv))
    return "\n".join(part for part in parts if part and part.strip(" :;"))


def posting_text_for_embedding(posting: dict, manifest: dict | None = None) -> str:
    parts = [
        str(posting.get("title") or ""),
        str(posting.get("description") or ""),
        str(posting.get("location") or ""),
        str(posting.get("employment_type") or ""),
    ]
    if manifest:
        ontology = manifest.get("ontology") or {}
        skills = ontology.get("skills") or []
        competencies = ontology.get("competencies") or []
        if skills:
            parts.append("Required skills: " + ", ".join(skills))
        if competencies:
            labels = [
                item.get("name", item) if isinstance(item, dict) else str(item)
                for item in competencies
            ]
            parts.append("Competencies: " + ", ".join(str(label) for label in labels))
    return "\n".join(part for part in parts if part.strip())


def extract_profile_hints(parsed: ParsedCv) -> ProfileHints:
    skills: list[str] = []
    credentials: list[str] = []
    experiences: list[str] = []
    summary: str | None = None
    headline: str | None = None

    for section in parsed.sections:
        title = section.title.lower()
        body = [line.strip() for line in section.content if line.strip()]
        if "skill" in title:
            for line in body:
                skills.extend(
                    part.strip()
                    for part in re.split(r"[,;|/•]", line)
                    if part.strip() and len(part.strip()) < 60
                )
        elif "education" in title or "credential" in title or "certification" in title:
            credentials.extend(body[:8])
        elif "experience" in title or "employment" in title or "work" in title:
            experiences.extend(body[:12])
        elif "summary" in title or "profile" in title or "objective" in title:
            summary = " ".join(body)[:2000] if body else section.description[:2000] or None
            if not headline and (section.description or body):
                headline = (section.description or body[0])[:200]

    # Deduplicate while preserving order.
    def unique(items: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for item in items:
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
        return out

    return ProfileHints(
        headline=headline,
        summary=summary,
        skills=unique(skills)[:40],
        credentials=unique(credentials)[:20],
        experiences=unique(experiences)[:20],
    )


def parse_cv_heuristic(text: str, *, source_filename: str | None = None) -> ParsedCv:
    cleaned = text.replace("\r\n", "\n").strip()
    if not cleaned:
        return ParsedCv(
            sections=[],
            source_filename=source_filename,
            parser="heuristic",
            parsed_at=datetime.now(UTC).isoformat(),
        )

    lines = cleaned.split("\n")
    sections: list[CvSection] = []
    current_title = "Overview"
    current_content: list[str] = []

    def flush() -> None:
        nonlocal current_content
        body = [line.strip() for line in current_content if line.strip()]
        if body:
            sections.append(CvSection(title=current_title, description="", content=body[:80]))
        current_content = []

    for line in lines:
        heading = _HEADING_RE.match(line.strip())
        if heading:
            flush()
            current_title = heading.group(1).strip().title()
            continue
        current_content.append(line)
    flush()

    if not sections:
        paragraphs = [part.strip() for part in re.split(r"\n\s*\n", cleaned) if part.strip()]
        sections = [
            CvSection(title="Overview", description="", content=paragraphs[:40] or [cleaned[:4000]])
        ]

    return ParsedCv(
        sections=sections[:30],
        source_filename=source_filename,
        parser="heuristic",
        parsed_at=datetime.now(UTC).isoformat(),
    )


async def parse_cv(
    text: str,
    *,
    settings: Settings,
    source_filename: str | None = None,
) -> tuple[ParsedCv, ProfileHints]:
    cleaned = text.strip()
    if len(cleaned) < 40:
        parsed = parse_cv_heuristic(cleaned, source_filename=source_filename)
        return parsed, extract_profile_hints(parsed)

    if not settings.ai_is_configured:
        parsed = parse_cv_heuristic(cleaned, source_filename=source_filename)
        return parsed, extract_profile_hints(parsed)

    try:
        chat = ChatOpenAI(
            api_key=settings.ai_api_key.get_secret_value(),  # type: ignore[union-attr]
            model=settings.ai_model,
            temperature=0,
            timeout=settings.ai_timeout_seconds,
            max_retries=1,
        )
        structured = chat.with_structured_output(_LlmParsedCv)
        result = await structured.ainvoke(
            [
                SystemMessage(
                    content=(
                        "Parse a resume/CV into a consistent structured format. "
                        "Return sections with title, short description, and content as a "
                        "list of bullet-like strings. Prefer standard section titles: "
                        "Summary, Experience, Education, Skills, Projects, Credentials. "
                        "Also extract headline, summary, skills, credentials, and short "
                        "experience blurbs for a candidate profile. Do not invent facts."
                    )
                ),
                HumanMessage(content=cleaned[:24000]),
            ]
        )
        llm = _LlmParsedCv.model_validate(result)
        if not llm.sections:
            raise ValueError("empty sections")
        parsed = ParsedCv(
            sections=llm.sections[:30],
            source_filename=source_filename,
            parser="openai",
            parsed_at=datetime.now(UTC).isoformat(),
        )
        hints = ProfileHints(
            headline=llm.headline,
            summary=llm.summary,
            skills=llm.skills[:40],
            credentials=llm.credentials[:20],
            experiences=llm.experiences[:20],
        )
        # Fill gaps from section extraction.
        fallback = extract_profile_hints(parsed)
        if not hints.headline:
            hints.headline = fallback.headline
        if not hints.summary:
            hints.summary = fallback.summary
        if not hints.skills:
            hints.skills = fallback.skills
        if not hints.credentials:
            hints.credentials = fallback.credentials
        if not hints.experiences:
            hints.experiences = fallback.experiences
        return parsed, hints
    except Exception:
        parsed = parse_cv_heuristic(cleaned, source_filename=source_filename)
        return parsed, extract_profile_hints(parsed)
