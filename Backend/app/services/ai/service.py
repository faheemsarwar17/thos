from app.core.config import Settings
from app.schemas.ai import (
    GenerationMetadata,
    InterviewQuestionGenerationRequest,
    InterviewQuestionGenerationResponse,
)
from app.services.ai.adapter import LangChainOpenAIAdapter, QuestionGenerationAdapter

PROMPT_VERSION = "interview-questions-v1"
POLICY_VERSION = "ai-safety-v1"


class InterviewQuestionService:
    def __init__(
        self,
        settings: Settings,
        adapter: QuestionGenerationAdapter | None = None,
    ) -> None:
        self.settings = settings
        self.adapter = adapter

    @classmethod
    def from_settings(cls, settings: Settings) -> "InterviewQuestionService":
        if not settings.ai_is_configured:
            return cls(settings=settings)
        adapter = LangChainOpenAIAdapter(
            api_key=settings.ai_api_key.get_secret_value(),  # type: ignore[union-attr]
            model=settings.ai_model,
            timeout_seconds=settings.ai_timeout_seconds,
        )
        return cls(settings=settings, adapter=adapter)

    def _metadata(self) -> GenerationMetadata:
        return GenerationMetadata(
            provider=self.adapter.provider_name if self.adapter else self.settings.ai_provider,
            model=self.adapter.model_name if self.adapter else self.settings.ai_model,
            prompt_version=PROMPT_VERSION,
            pack_version="not-supplied",
            rubric_version="not-supplied",
            policy_version=POLICY_VERSION,
        )

    async def generate(
        self, request: InterviewQuestionGenerationRequest
    ) -> InterviewQuestionGenerationResponse:
        metadata = self._metadata().model_copy(
            update={
                "pack_version": request.pack_version,
                "rubric_version": request.rubric_version,
            }
        )
        if self.adapter is None:
            return InterviewQuestionGenerationResponse(
                status="disabled",
                questions=[],
                requires_human_review=True,
                reason="AI question generation is disabled because no provider key is configured.",
                metadata=metadata,
            )

        try:
            generated = await self.adapter.generate(request)
            if len(generated.questions) != request.question_count:
                raise ValueError("provider returned an unexpected question count")
            allowed_competencies = set(request.competencies)
            if any(
                question.competency not in allowed_competencies
                for question in generated.questions
            ):
                raise ValueError("provider returned an unknown competency")
        except Exception:
            return InterviewQuestionGenerationResponse(
                status="unavailable",
                questions=[],
                requires_human_review=True,
                reason="AI output was unavailable or invalid; manual question review is required.",
                metadata=metadata,
            )

        return InterviewQuestionGenerationResponse(
            status="generated",
            questions=generated.questions,
            requires_human_review=False,
            metadata=metadata,
        )
