"""Sandbox content models: coding problems, written exercises, and evaluations."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SandboxExample(BaseModel):
    """One worked example for a coding problem."""

    input: str
    output: str
    explanation: str = ""


class SandboxProblem(BaseModel):
    """A DSA-style coding problem plus the rubric used to grade submissions."""

    id: str
    title: str
    statement: str
    examples: list[SandboxExample] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    starter_code: str = ""
    language_hint: str = "python"
    rubric: list[str] = Field(default_factory=list)


class WrittenPrompt(BaseModel):
    """One long-form question with a minimum length expectation."""

    id: str
    question: str
    min_words: int = 150


class WrittenExercise(BaseModel):
    """A set of typed long-form prompts for non-technical roles."""

    prompts: list[WrittenPrompt] = Field(default_factory=list)
    rubric: list[str] = Field(default_factory=list)


class SandboxEvaluation(BaseModel):
    """LLM rubric evaluation of a sandbox submission (0-100)."""

    score: float = Field(default=0.0, ge=0.0, le=100.0)
    breakdown: dict[str, float] = Field(default_factory=dict)
    notes: str = ""
