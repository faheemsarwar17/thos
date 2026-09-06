"""Deterministic scenario evaluator.

Runs entirely offline so interviews are never blocked by an AI
provider. Scores are advisory: rules.md §3.1 requires a human actor for
every reject/offer/hire decision, and every evaluation stores its
rubric, pack, and evaluator versions (rules.md §3.2). Evidence cites
only real response segments (rules.md §3.3).
"""

import re
from typing import Any

EVALUATOR_VERSION = "deterministic-scenario-v1"


def _sentences(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]


def _evidence_for_concept(concept: str, response: str) -> str | None:
    lowered = concept.lower()
    for sentence in _sentences(response):
        if lowered in sentence.lower():
            return sentence[:280]
    return None


def evaluate_scenario_responses(
    *,
    questions: list[dict[str, Any]],
    responses: dict[str, str],
    rubric_dimensions: list[dict[str, Any]],
    pack_id: str,
    pack_version: str,
) -> dict[str, Any]:
    """Score responses against each question's expected concepts.

    Returns a versioned evaluation with per-question breakdowns,
    rubric-dimension scores, evidence citations, and strengths/gaps.
    """
    question_results: list[dict[str, Any]] = []
    strengths: list[str] = []
    gaps: list[str] = []

    for question in questions:
        response = (responses.get(question["id"]) or "").strip()
        expected: list[str] = question.get("expected_concepts", [])
        covered: list[dict[str, str]] = []
        missing: list[str] = []
        for concept in expected:
            evidence = _evidence_for_concept(concept, response)
            if evidence is not None:
                covered.append({"concept": concept, "evidence": evidence})
            else:
                missing.append(concept)

        coverage = len(covered) / len(expected) if expected else 0.0
        word_count = len(response.split())
        # Structure heuristic: multiple sentences and a substantive answer.
        structure = min(1.0, len(_sentences(response)) / 4) if word_count >= 30 else (
            0.3 if word_count > 0 else 0.0
        )
        depth = min(1.0, word_count / 150)
        score = round(100 * (0.55 * coverage + 0.25 * structure + 0.20 * depth))

        question_results.append(
            {
                "question_id": question["id"],
                "competency": question.get("competency", ""),
                "score": score,
                "covered_concepts": covered,
                "missing_concepts": missing,
                "word_count": word_count,
            }
        )
        if score >= 70:
            strengths.append(question.get("competency", question["id"]))
        elif score < 45:
            gaps.append(question.get("competency", question["id"]))

    answered = [q for q in question_results if q["word_count"] > 0]
    overall = round(
        sum(q["score"] for q in question_results) / len(question_results)
    ) if question_results else 0

    coverage_avg = (
        sum(
            len(q["covered_concepts"])
            / max(1, len(q["covered_concepts"]) + len(q["missing_concepts"]))
            for q in question_results
        )
        / len(question_results)
        if question_results
        else 0.0
    )
    structure_avg = (
        sum(min(100, q["score"] + 10) for q in question_results) / len(question_results)
        if question_results
        else 0.0
    )

    dimension_scores = []
    for dimension in rubric_dimensions:
        if dimension["id"] == "domain_correctness":
            value = round(100 * coverage_avg)
        elif dimension["id"] == "structure":
            value = round(min(100.0, structure_avg))
        else:
            value = overall
        dimension_scores.append(
            {
                "dimension_id": dimension["id"],
                "label": dimension.get("label", dimension["id"]),
                "score": value,
            }
        )

    return {
        "evaluator_version": EVALUATOR_VERSION,
        "pack_id": pack_id,
        "pack_version": pack_version,
        "rubric_dimensions": rubric_dimensions,
        "overall_score": overall,
        "dimension_scores": dimension_scores,
        "question_results": question_results,
        "strengths": sorted(set(strengths)),
        "gaps": sorted(set(gaps)),
        "answered_questions": len(answered),
        "total_questions": len(question_results),
        "requires_human_decision": True,
    }
