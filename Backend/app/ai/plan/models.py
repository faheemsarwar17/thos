"""Interview plan models: persona + ordered questions generated before the session."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

ALLOWED_TTS_VOICES = {
    "alloy",
    "echo",
    "fable",
    "onyx",
    "nova",
    "shimmer",
    "coral",
    "verse",
    "ballad",
    "ash",
    "sage",
    "marin",
    "cedar",
}


class InterviewerPersona(BaseModel):
    """Who the candidate hears: a consistent voice, style, and role."""

    name: str = "Ayesha"
    role: str = "Hiring Specialist"
    style: str = "warm and professional"
    tone: str = "curious, fair, never judgmental"
    pace: str = "steady and unhurried"
    voice: str = Field(
        default="sage",
        description="One of OpenAI TTS voices: alloy, echo, fable, onyx, nova, shimmer, coral, verse, ballad, ash, sage, marin, cedar",
    )

    @field_validator("voice", mode="before")
    @classmethod
    def sanitize_voice(cls, value: Any) -> str:
        if isinstance(value, str):
            clean = value.strip().lower()
            if clean in ALLOWED_TTS_VOICES:
                return clean
        return "sage"


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
