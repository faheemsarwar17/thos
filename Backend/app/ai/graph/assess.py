"""Per-answer assessment: one fast structured LLM call per candidate turn.

The chain judges the answer against the current planned question's
sufficiency criteria. When no AI key is configured a deterministic
word-count heuristic keeps the engine fully functional in dev/tests.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Literal

from pydantic import BaseModel

from app.ai.plan.models import PlannedQuestion
from app.core.config import Settings
from app.logging import logger


class AnswerAssessment(BaseModel):
    """Structured verdict, intent, and spoken response for one candidate turn."""

    intent: Literal[
        "answer",
        "ask_to_end",
        "skip_question",
        "clarification_question",
        "need_time",
        "off_topic",
    ] = "answer"
    verdict: Literal["sufficient", "needs_followup", "off_topic"] = "sufficient"
    missing_point: str = ""
    suggested_followup: str = ""
    spoken_response: str = ""


# Async callable: (question, answer, ...) -> AnswerAssessment
AssessFn = Callable[..., Awaitable[AnswerAssessment]]


def heuristic_assessment(*, min_words: int = 2) -> AssessFn:
    """Deterministic fallback assessor (no AI key): detects user intent and sufficiency."""

    async def _assess(
        question: PlannedQuestion,
        answer: str,
        *,
        next_question: PlannedQuestion | None = None,
        persona: Any = None,
        history: list[dict[str, Any]] | None = None,
        language: str = "English",
        **kwargs: Any,
    ) -> AnswerAssessment:
        clean = (answer or "").strip().lower()

        # Check for candidate asking to end
        if any(
            phrase in clean
            for phrase in (
                "end the interview",
                "stop the interview",
                "conclude the interview",
                "wrap up",
                "finish the interview",
                "can we stop",
                "can we end",
                "want to stop",
                "want to end",
                "i have to go",
                "i have to leave",
                "end here",
                "end now",
                "that's all",
                "ختم کریں",
                "بند کریں",
            )
        ):
            return AnswerAssessment(
                intent="ask_to_end",
                verdict="sufficient",
                spoken_response=(
                    "Understood! We can conclude the interview here. Thank you so much for your time "
                    "today; your responses have been recorded. Have a great day!"
                ),
            )

        # Check for candidate asking to skip / pass
        if any(
            phrase in clean
            for phrase in (
                "skip this",
                "skip question",
                "next question",
                "move on",
                "don't know",
                "dont know",
                "no experience",
                "haven't worked",
                "havent worked",
                "pass on this",
                "اگلا سوال",
            )
        ):
            next_text = next_question.question if next_question else ""
            return AnswerAssessment(
                intent="skip_question",
                verdict="sufficient",
                spoken_response=(
                    f"No problem at all! Let's move on to the next topic. {next_text}"
                    if next_text
                    else "No problem at all! Let's move to our closing remarks."
                ),
            )

        # Check for candidate asking a question or clarification
        if any(
            phrase in clean
            for phrase in (
                "what should i achieve",
                "what do you mean",
                "could you clarify",
                "can you clarify",
                "what is the role",
                "repeat the question",
                "could you repeat",
                "explain what you mean",
                "تکنیک بتا دیں",
                "بتا دیں",
            )
        ):
            return AnswerAssessment(
                intent="clarification_question",
                verdict="sufficient",
                spoken_response=(
                    f"To clarify: {question.sufficiency_criteria or question.question} "
                    "Please take your time and answer whenever you are ready."
                ),
            )

        # Check for candidate asking for time
        if any(
            phrase in clean
            for phrase in (
                "give me a second",
                "give me a moment",
                "let me think",
                "hold on",
                "one second",
                "one moment",
            )
        ):
            return AnswerAssessment(
                intent="need_time",
                verdict="sufficient",
                spoken_response="Take all the time you need, let me know when you're ready.",
            )

        # Candidate answering
        tokens = [w for w in clean.split() if w]
        if len(tokens) >= min_words:
            return AnswerAssessment(
                intent="answer",
                verdict="sufficient",
                spoken_response="",
            )

        return AnswerAssessment(
            intent="answer",
            verdict="needs_followup",
            missing_point="detail",
            suggested_followup="Could you share a specific example of that?",
            spoken_response="Could you give me a specific example of that?",
        )

    return _assess


def build_assessment_chain(settings: Settings) -> AssessFn | None:
    """LangChain structured-output assessor; None when no AI key is configured."""
    if not settings.ai_is_configured:
        return None

    from langchain_core.prompts import ChatPromptTemplate
    from langchain_openai import ChatOpenAI

    system_template = (
        "You are {persona_name}, a {persona_role} conducting a professional, live spoken interview.\n"
        "Your interviewing style is {persona_style}, and your tone is {persona_tone}.\n"
        "Interview language: {language}.\n\n"
        "You are in full intellectual and conversational control of this interview:\n"
        "You listen attentively to what the candidate actually said, evaluate their depth, and speak naturally like an empathetic human interviewer in a real voice call.\n\n"
        "STEP 1: Determine the candidate's INTENT:\n"
        "- 'ask_to_end': Candidate wants to end, finish, or stop the interview (e.g. 'can we end the interview?', 'I want to stop', 'I have to leave', 'let's wrap up here', or similar in any language).\n"
        "- 'skip_question': Candidate cannot answer, lacks experience, or asks to move on (e.g. 'I don't know', 'I haven't used this', 'can we skip this question?', 'next question please', 'let's move on').\n"
        "- 'clarification_question': Candidate is asking a question or requesting clarification/guidance (e.g. 'what should I achieve?', 'what do you mean by that?', 'could you clarify the scenario?', 'can you repeat the question?').\n"
        "- 'need_time': Candidate is asking for a pause or moment to think ('give me a second', 'let me think', 'one moment').\n"
        "- 'off_topic': Candidate is talking about completely unrelated personal things or non sequiturs.\n"
        "- 'answer': Candidate is addressing or answering the interview question.\n\n"
        "STEP 2: If intent is 'answer', determine VERDICT:\n"
        "- 'sufficient': The answer addresses the question with relevant details, technical explanation, or concrete experience.\n"
        "- 'needs_followup': The answer is relevant but too brief, vague, or missing concrete examples, technical decisions, or outcomes.\n"
        "- 'off_topic': Does not address the topic.\n\n"
        "STEP 3: Compose your SPOKEN RESPONSE ('spoken_response'):\n"
        "Compose 1 to 3 spoken sentences to be synthesized directly by Text-To-Speech. It must sound completely natural, engaging, and conversational:\n"
        "- If 'ask_to_end': Warmly and graciously conclude: 'Understood! We can conclude the interview here. Thank you so much for your time today; your answers have been recorded. Have a wonderful day!'\n"
        "- If 'skip_question': Reassure them supportively and smoothly introduce the next question: 'No problem at all! Let's move on to the next topic. [Introduce next question naturally]'\n"
        "- If 'clarification_question': Directly, clearly, and helpfully answer their question in 1-2 sentences, then politely re-invite them to share their experience.\n"
        "- If 'need_time': Say warmly: 'Take all the time you need, please go ahead whenever you are ready.'\n"
        "- If 'answer' and 'needs_followup': Acknowledge what they shared with a brief human touch, then ask a targeted, specific follow-up probing deeper into the exact project, technology, or trade-off they mentioned.\n"
        "- If 'answer' and 'sufficient': Provide a brief, genuine acknowledgment of their answer (e.g. 'That is a great explanation of how you handled database partitioning under load.') and smoothly transition into the next topic/question: '[Next Question]'. If this is the final question, warmly thank them and conclude.\n"
        "- If 'off_topic': Gently acknowledge and steer them back to the current topic.\n\n"
        "CRITICAL RULES:\n"
        "- Never be rigid, robotic, or repetitive. Never use generic canned strings.\n"
        "- Never say 'Take your time' if the candidate asked to end, asked a question, or asked to skip.\n"
        "- Keep responses concise (1 to 3 sentences) suitable for spoken audio playout."
    )

    human_template = (
        "Recent Interview Exchanges:\n{history}\n\n"
        "Current Question: {question}\n"
        "Competency: {competency}\n"
        "Sufficiency Criteria: {criteria}\n"
        "Next Question (if any): {next_question}\n\n"
        "Candidate Just Spoke: {answer}"
    )

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", system_template),
            ("human", human_template),
        ]
    )
    llm = ChatOpenAI(
        model=settings.turn_assessment_model,
        max_tokens=settings.turn_assessment_max_tokens,
        api_key=settings.ai_api_key.get_secret_value() if settings.ai_api_key else None,
        timeout=float(settings.ai_timeout_seconds),
    )
    chain = prompt | llm.with_structured_output(AnswerAssessment)

    async def _assess(
        question: PlannedQuestion,
        answer: str,
        *,
        next_question: PlannedQuestion | None = None,
        persona: Any = None,
        history: list[dict[str, Any]] | None = None,
        language: str = "English",
        **kwargs: Any,
    ) -> AnswerAssessment:
        p_name = getattr(persona, "name", "Interviewer") if persona else "Interviewer"
        p_role = getattr(persona, "role", "Hiring Specialist") if persona else "Hiring Specialist"
        p_style = getattr(persona, "style", "warm and professional") if persona else "warm and professional"
        p_tone = getattr(persona, "tone", "curious and supportive") if persona else "curious and supportive"

        # Format recent history (last 3 exchanges)
        history_lines: list[str] = []
        if history:
            for item in history[-3:]:
                q_text = item.get("question_text") or item.get("question_id") or "Question"
                cand_ans = item.get("answer") or ""
                agent_resp = item.get("spoken_response") or ""
                if cand_ans:
                    history_lines.append(f"- Candidate: \"{cand_ans[:120]}\"")
                if agent_resp:
                    history_lines.append(f"- Interviewer: \"{agent_resp[:120]}\"")
        history_text = "\n".join(history_lines) if history_lines else "None yet (opening of interview)."

        next_q_text = (
            next_question.question
            if next_question
            else "None (this is the final question in the interview plan)"
        )

        try:
            return await chain.ainvoke(
                {
                    "persona_name": p_name,
                    "persona_role": p_role,
                    "persona_style": p_style,
                    "persona_tone": p_tone,
                    "language": language or "English",
                    "history": history_text,
                    "question": question.question,
                    "competency": getattr(question, "competency", "") or "General",
                    "criteria": question.sufficiency_criteria or "Addresses the question with concrete detail.",
                    "next_question": next_q_text,
                    "answer": answer,
                }
            )
        except Exception as err:
            logger.warning(
                f"Answer assessment failed for question {question.id}; "
                f"falling back: {err}",
                exc_info=True,
            )
            fallback = heuristic_assessment(min_words=settings.answer_max_words_followup_threshold)
            return await fallback(
                question,
                answer,
                next_question=next_question,
                persona=persona,
                history=history,
                language=language,
            )

    return _assess
