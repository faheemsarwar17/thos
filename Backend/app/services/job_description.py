"""AI Job Description Generator Service.

Generates comprehensive, professional, industry-tailored job descriptions
reading role title, location, work mode, domain pack competencies, and employment type.
"""

from __future__ import annotations

import logging
from typing import Any

from app.core.config import Settings, get_settings

logger = logging.getLogger("thos.job_description")


async def generate_ai_job_description(
    *,
    title: str,
    location: str | None = None,
    work_mode: str | None = "hybrid",
    pack_manifest: dict[str, Any] | None = None,
    employment_type: str | None = "full_time",
    notes: str | None = None,
    settings: Settings | None = None,
) -> str:
    """Generate a structured, professional job description via LLM or deterministic fallback."""
    cfg = settings or get_settings()

    mode_display = {
        "remote": "Remote (Work from anywhere within region)",
        "hybrid": "Hybrid (Flexible split between office and remote)",
        "onsite": "On-Site (Office / Campus based)",
    }.get((work_mode or "").lower(), work_mode or "Hybrid")

    emp_display = {
        "full_time": "Full-Time",
        "part_time": "Part-Time",
        "contract": "Contract",
        "internship": "Internship",
    }.get((employment_type or "").lower(), employment_type or "Full-Time")

    loc_display = location.strip() if location and location.strip() else "Primary Office / Flexible"

    domain_name = ""
    rubric_dims: list[str] = []
    if pack_manifest:
        domain_name = pack_manifest.get("display_name") or pack_manifest.get("domain") or ""
        for dim in pack_manifest.get("rubric_dimensions", []):
            if isinstance(dim, dict):
                label = dim.get("label") or dim.get("id")
                if label:
                    rubric_dims.append(label)

    if cfg.ai_is_configured:
        try:
            from langchain_core.messages import HumanMessage, SystemMessage
            from langchain_openai import ChatOpenAI

            api_key = cfg.ai_api_key.get_secret_value() if cfg.ai_api_key else cfg.openai_api_key
            chat = ChatOpenAI(
                api_key=api_key,
                model=cfg.ai_model,
                temperature=0.4,
                timeout=cfg.ai_timeout_seconds,
                max_retries=1,
            )

            system_prompt = (
                "You are an executive talent acquisition director and professional job specification writer. "
                "Your objective is to craft an inspiring, well-structured, modern, and realistic Job Description "
                "for a hiring requisition based on the provided parameters.\n\n"
                "Format the response in clean markdown using the following structure:\n"
                "## Role Overview\n"
                "(2-3 engaging paragraphs introducing the mission, impact, team culture, and highlighting the location and work mode arrangement)\n\n"
                "## Key Responsibilities\n"
                "(5-7 actionable bullet points starting with strong action verbs describing everyday impact and strategic ownership)\n\n"
                "## Required Qualifications & Competencies\n"
                "(5-6 concrete bullet points detailing must-have technical/domain skills, experience level, and problem-solving abilities)\n\n"
                "## Preferred Qualifications\n"
                "(3-4 nice-to-have capabilities, bonus tools, or specialized certifications)\n\n"
                "## Work Arrangement & Benefits\n"
                "(Highlight the specific work mode (Remote/Hybrid/On-site), flexible workplace culture, professional growth, and collaboration)\n\n"
                "Tone: Engaging, inclusive, professional, and clear. Avoid buzzwords or vague clichés. Emphasize actual domain competencies."
            )

            context_lines = [
                f"Job Title: {title}",
                f"Work Mode: {mode_display}",
                f"Location: {loc_display}",
                f"Employment Type: {emp_display}",
            ]
            if domain_name:
                context_lines.append(f"Domain / Industry: {domain_name}")
            if rubric_dims:
                context_lines.append(f"Core Rubric Competencies: {', '.join(rubric_dims[:6])}")
            if notes:
                context_lines.append(f"Additional Hiring Manager Notes: {notes}")

            human_prompt = "\n".join(context_lines)

            result = await chat.ainvoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=human_prompt),
            ])
            text = str(result.content).strip()
            if text:
                return text
        except Exception as exc:
            logger.warning(f"OpenAI job description generation failed, falling back to template: {exc}")

    return _generate_fallback_description(
        title=title,
        location=loc_display,
        work_mode=mode_display,
        employment_type=emp_display,
        domain_name=domain_name,
        rubric_dims=rubric_dims,
        notes=notes,
    )


def _generate_fallback_description(
    *,
    title: str,
    location: str,
    work_mode: str,
    employment_type: str,
    domain_name: str,
    rubric_dims: list[str],
    notes: str | None = None,
) -> str:
    """Deterministic, domain-aligned job description fallback."""
    domain_intro = f" in our {domain_name} practice" if domain_name else ""
    domain_bullet = f"Leverage deep domain knowledge in {domain_name} to drive high standards" if domain_name else "Drive best-in-class technical and operational standards"

    competencies = rubric_dims if rubric_dims else [
        "Core Technical Architecture & Design",
        "Analytical Problem Solving & Troubleshooting",
        "Cross-functional Collaboration & Communication",
        "Execution Quality & Operational Excellence",
    ]

    competency_bullets = "\n".join(
        f"- Demonstrated proficiency in **{comp}** with proven real-world execution."
        for comp in competencies[:5]
    )

    notes_section = f"\n\n*Special Notes: {notes.strip()}*" if notes and notes.strip() else ""

    return f"""## Role Overview
We are looking for a talented and driven **{title}** to join our team{domain_intro}. In this role, you will be instrumental in designing, scaling, and delivering impactful initiatives that advance our core mission.

This position is offered as **{employment_type}** with a **{work_mode}** arrangement based out of **{location}**. You will collaborate closely with interdisciplinary teams, contributing to strategic decisions and mentoring peers in a dynamic, high-trust environment.

## Key Responsibilities
- Lead and contribute to the end-to-end lifecycle of critical projects from concept through production.
- {domain_bullet} across team deliverables and architecture.
- Partner with product managers, engineers, and stakeholders to define technical roadmaps and project milestones.
- Champion rigorous testing, documentation, and maintainability across all system components.
- Mentor junior team members, conduct constructive peer reviews, and foster an inclusive engineering culture.
- Identify performance bottlenecks and implement reliable, scalable optimizations.

## Required Qualifications & Competencies
{competency_bullets}
- 3+ years of professional experience in roles directly relevant to {title}.
- Strong analytical and troubleshooting mindset with a pragmatic approach to complex challenges.
- Outstanding verbal and written communication skills for cross-functional collaboration.
- Track record of delivering high-quality deliverables in iterative, fast-paced team environments.

## Preferred Qualifications
- Prior experience working in high-growth or mission-critical production environments.
- Active familiarity with modern cloud infrastructure, automation pipelines, and monitoring tooling.
- Demonstrated leadership in open-source contributions, technical writing, or community mentorship.

## Work Arrangement & Benefits
- **Work Mode**: {work_mode} — we provide the autonomy and modern tooling you need to do your best work.
- **Location**: {location} (flexible scheduling and remote support).
- Competitive compensation package, comprehensive healthcare coverage, and dedicated professional development budgets.
- Collaborative, forward-thinking team with continuous learning opportunities.{notes_section}"""
