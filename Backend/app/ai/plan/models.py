"""Interview plan models: persona + ordered questions generated before the session."""

from __future__ import annotations

from pydantic import BaseModel, Field


class InterviewerPersona(BaseModel):
    """Who the candidate hears: a consistent voice, style, and role."""

    name: str = "Ayesha"
    role: str = "Hiring Specialist"
    style: str = "warm and professional"
    tone: str = "curious, fair, never judgmental"
    pace: str = "steady and unhurried"
    voice: str = "sage"


class PlannedQuestion(BaseModel):
    """One planned question with the criteria a good answer must satisfy."""

    id: str
    competency: str = ""
    question: str
    sufficiency_criteria: str = ""
    max_followups: int = 1


class InterviewPlan(BaseModel):
    """The full deterministic script the turn engine walks through."""

    persona: InterviewerPersona = Field(default_factory=InterviewerPersona)
    greeting: str = ""
    questions: list[PlannedQuestion] = Field(default_factory=list)
    closing: str = ""
    language: str = "English"
    duration_minutes: int = 10
