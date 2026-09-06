from typing import Protocol

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.schemas.ai import GeneratedQuestionSet, InterviewQuestionGenerationRequest


class QuestionGenerationAdapter(Protocol):
    provider_name: str
    model_name: str

    async def generate(
        self, request: InterviewQuestionGenerationRequest
    ) -> GeneratedQuestionSet: ...


class LangChainOpenAIAdapter:
    provider_name = "openai"

    def __init__(self, *, api_key: str, model: str, timeout_seconds: int) -> None:
        self.model_name = model
        chat_model = ChatOpenAI(
            api_key=api_key,
            model=model,
            temperature=0,
            timeout=timeout_seconds,
            max_retries=1,
        )
        self._structured_model = chat_model.with_structured_output(GeneratedQuestionSet)

    async def generate(
        self, request: InterviewQuestionGenerationRequest
    ) -> GeneratedQuestionSet:
        system_prompt = (
            "You generate interview questions only from supplied domain-pack context. "
            "Do not infer protected characteristics or introduce domain facts not in the context. "
            "Return exactly the requested number of concise questions. Each question must map "
            "to one supplied competency."
        )
        human_prompt = (
            f"Domain-pack context:\n{request.domain_context}\n\n"
            f"Competencies: {', '.join(request.competencies)}\n"
            f"Question count: {request.question_count}"
        )
        result = await self._structured_model.ainvoke(
            [SystemMessage(content=system_prompt), HumanMessage(content=human_prompt)]
        )
        return GeneratedQuestionSet.model_validate(result)
