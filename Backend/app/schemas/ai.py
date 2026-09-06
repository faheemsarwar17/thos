from typing import Literal

from pydantic import BaseModel, Field, field_validator


class InterviewQuestionGenerationRequest(BaseModel):
    domain_context: str = Field(
        min_length=1,
        max_length=4000,
        description="Domain-pack context only; do not include candidate personal data.",
    )
    competencies: list[str] = Field(min_length=1, max_length=10)
    question_count: int = Field(default=5, ge=1, le=10)
    pack_version: str = Field(min_length=1, max_length=100)
    rubric_version: str = Field(min_length=1, max_length=100)

    @field_validator("competencies")
    @classmethod
    def validate_competencies(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 100 for value in cleaned):
            raise ValueError("each competency must contain 1 to 100 characters")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("competencies must be unique")
        return cleaned


class InterviewQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    competency: str = Field(min_length=1, max_length=100)


class GeneratedQuestionSet(BaseModel):
    questions: list[InterviewQuestion]


class GenerationMetadata(BaseModel):
    provider: str
    model: str
    prompt_version: str
    pack_version: str
    rubric_version: str
    policy_version: str


class InterviewQuestionGenerationResponse(BaseModel):
    status: Literal["generated", "disabled", "unavailable"]
    questions: list[InterviewQuestion]
    requires_human_review: bool
    reason: str | None = None
    metadata: GenerationMetadata
