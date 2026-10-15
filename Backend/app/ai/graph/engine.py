"""TurnEngine: the deterministic interview state machine (LangGraph).

Graph: ingest_answer -> assess -> router -> [follow_up | advance | redirect |
wrap_up | wait]. Utterances are composed deterministically (short bridge +
exact planned question text) so the only LLM call per turn is the assessment.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from langgraph.graph import END, StateGraph

from app.ai.plan.models import InterviewPlan, PlannedQuestion
from app.logging import logger

from .assess import AnswerAssessment, AssessFn, heuristic_assessment
from .state import TurnState, new_turn_state

_BRIDGES = ("Thank you.", "Got it.", "I see, thank you.", "Understood, thanks.")
_REDIRECT = "That's interesting, but I'd like to stay on the question."
_WAIT = "Take your time — whenever you're ready, please go ahead."
_RESUME = "Welcome back — let's pick up where we left off."


class TurnEngine:
    """Walks the interview plan one candidate answer at a time."""

    def __init__(
        self,
        plan: InterviewPlan,
        *,
        assess: AssessFn | None = None,
        noise_threshold_words: int = 12,
    ) -> None:
        self._plan = plan
        self._assess: AssessFn = assess or heuristic_assessment(
            min_words=noise_threshold_words
        )
        self._noise_threshold = noise_threshold_words
        self._graph = self._build_graph()
        self._state = new_turn_state(
            plan, started_at=datetime.now(UTC).isoformat()
        )

    # ------------------------------------------------------------------ API

    @property
    def state(self) -> TurnState:
        return self._state

    @property
    def is_done(self) -> bool:
        return self._state.get("phase") == "done"

    def current_question(self) -> PlannedQuestion | None:
        """The question the candidate is currently answering (or next to answer)."""
        return self._current_question(self._state)

    async def opening(self) -> str:
        """Scripted greeting + first question. Zero LLM calls.

        After `restore_coverage` (resume) this re-asks the *current* question
        instead of restarting the plan; a fully covered plan returns "".
        """
        phase = self._state.get("phase")
        if phase == "done":
            return ""
        question = self._current_question(self._state)
        parts: list[str] = []
        if phase == "questioning":
            # Resume: the greeting was already heard before the disconnect.
            parts.append(_RESUME)
        elif self._plan.greeting.strip():
            parts.append(self._plan.greeting.strip())
        if question is not None:
            parts.append(question.question)
            self._state["phase"] = "questioning"
        else:
            if self._plan.closing.strip():
                parts.append(self._plan.closing.strip())
            self._state["phase"] = "done"
        utterance = "\n\n".join(parts)
        self._state["utterance"] = utterance
        return utterance

    async def handle_answer(self, text: str) -> str:
        """Process one candidate answer; return the next utterance to speak."""
        if self._state.get("phase") in ("closing", "done"):
            return ""
        answer = (text or "").strip()
        if not answer:
            self._state["utterance"] = _WAIT
            return _WAIT
        result = await self._graph.ainvoke({**self._state, "answer": answer})
        self._state = TurnState(result)
        return self._state.get("utterance", "")

    async def force_wrap(self) -> str:
        """Timer/user-driven end: jump straight to the closing."""
        closing = self._plan.closing.strip() or "Thank you for your time. Goodbye."
        self._state["phase"] = "done"
        self._state["utterance"] = closing
        return closing

    # -------------------------------------------------------------- graph

    def _build_graph(self) -> Any:
        graph = StateGraph(TurnState)
        graph.add_node("ingest_answer", self._ingest_answer)
        graph.add_node("assess", self._assess_node)
        graph.add_node("follow_up", self._follow_up_node)
        graph.add_node("advance", self._advance_node)
        graph.add_node("clarify", self._clarify_node)
        graph.add_node("redirect", self._redirect_node)
        graph.add_node("wrap_up", self._wrap_up_node)
        graph.add_node("wait", self._wait_node)
        graph.set_entry_point("ingest_answer")
        graph.add_edge("ingest_answer", "assess")
        graph.add_conditional_edges(
            "assess",
            self._route,
            {
                "follow_up": "follow_up",
                "advance": "advance",
                "clarify": "clarify",
                "redirect": "redirect",
                "wrap_up": "wrap_up",
                "wait": "wait",
            },
        )
        for node in (
            "follow_up",
            "advance",
            "clarify",
            "redirect",
            "wrap_up",
            "wait",
        ):
            graph.add_edge(node, END)
        return graph.compile()

    # -------------------------------------------------------------- nodes

    def _current_question(self, state: TurnState) -> PlannedQuestion | None:
        questions = state["plan"].questions
        index = state.get("question_index", 0)
        return questions[index] if 0 <= index < len(questions) else None

    def _ingest_answer(self, state: TurnState) -> dict[str, Any]:
        answer = state.get("answer", "")
        tokens = [
            w.strip(".,!?;:\"'()").lower()
            for w in answer.split()
            if w.strip(".,!?;:\"'()")
        ]
        fillers = {"uh", "um", "hmm", "hm", "ah", "er", "oh", "huh", "mm"}
        if not tokens or (len(tokens) <= 2 and all(t in fillers for t in tokens)):
            return {"verdict": "noise", "intent": "need_time"}
        return {"verdict": "", "intent": ""}

    async def _assess_node(self, state: TurnState) -> dict[str, Any]:
        if state.get("verdict") == "noise":
            return {"spoken_response": _WAIT}
        question = self._current_question(state)
        if question is None:
            return {"verdict": "sufficient", "intent": "answer"}

        next_idx = state.get("question_index", 0) + 1
        questions = state["plan"].questions
        next_question = (
            questions[next_idx] if 0 <= next_idx < len(questions) else None
        )

        try:
            assessment: AnswerAssessment = await self._assess(
                question,
                state["answer"],
                next_question=next_question,
                persona=state["plan"].persona,
                history=state.get("assessments", []),
                language=state["plan"].language,
            )
        except TypeError:
            assessment = await self._assess(question, state["answer"])

        log = list(state.get("assessments", []))
        log.append(
            {
                "question_id": question.id,
                "question_text": question.question,
                "answer": state["answer"],
                "intent": assessment.intent,
                "verdict": assessment.verdict,
                "missing_point": assessment.missing_point,
                "suggested_followup": assessment.suggested_followup,
                "spoken_response": assessment.spoken_response,
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )
        return {
            "intent": assessment.intent,
            "verdict": assessment.verdict,
            "missing_point": assessment.missing_point,
            "suggested_followup": assessment.suggested_followup,
            "spoken_response": assessment.spoken_response,
            "assessments": log,
        }

    def _route(self, state: TurnState) -> str:
        intent = state.get("intent", "answer")
        verdict = state.get("verdict", "sufficient")

        if intent == "ask_to_end":
            return "wrap_up"
        if intent == "clarification_question":
            return "clarify"
        if intent == "need_time" or verdict == "noise":
            return "wait"
        if intent == "off_topic" or verdict == "off_topic":
            return "redirect"

        question = self._current_question(state)
        if question is None:
            return "wrap_up"

        is_last = (
            state.get("question_index", 0) >= len(state["plan"].questions) - 1
        )

        if intent == "skip_question":
            return "wrap_up" if is_last else "advance"

        used = state.get("followups_used", {}).get(question.id, 0)
        if verdict == "needs_followup" and used < question.max_followups:
            return "follow_up"

        return "wrap_up" if is_last else "advance"

    def _clarify_node(self, state: TurnState) -> dict[str, Any]:
        response = state.get("spoken_response", "").strip()
        if not response:
            question = self._current_question(state)
            q_text = question.question if question else ""
            response = (
                f"Certainly. To clarify: {q_text} "
                "Please feel free to answer whenever you are ready."
            )
        return {"utterance": response}

    def _follow_up_node(self, state: TurnState) -> dict[str, Any]:
        question = self._current_question(state)
        used = dict(state.get("followups_used", {}))
        if question is not None:
            used[question.id] = used.get(question.id, 0) + 1
        followup = (
            state.get("spoken_response", "").strip()
            or state.get("suggested_followup", "").strip()
            or "Could you give me a specific example of that?"
        )
        return {"followups_used": used, "utterance": followup}

    def _advance_node(self, state: TurnState) -> dict[str, Any]:
        coverage = dict(state.get("coverage", {}))
        question = self._current_question(state)
        if question is not None:
            coverage[question.id] = True
        next_index = state.get("question_index", 0) + 1
        questions = state["plan"].questions
        if next_index >= len(questions):
            return {
                "coverage": coverage,
                "question_index": next_index,
                "phase": "closing",
            }

        next_q = questions[next_index].question
        response = state.get("spoken_response", "").strip()

        # If the LLM has generated an intelligent spoken response:
        # Check if the next question text is already embedded, or if it's a transition that needs the next question
        if response:
            if next_q.lower() in response.lower() or "?" in response:
                utterance = response
            else:
                utterance = f"{response} {next_q}"
        else:
            bridge = _BRIDGES[next_index % len(_BRIDGES)]
            utterance = f"{bridge} {next_q}"

        return {
            "coverage": coverage,
            "question_index": next_index,
            "utterance": utterance,
            "phase": "questioning",
        }

    def _redirect_node(self, state: TurnState) -> dict[str, Any]:
        question = self._current_question(state)
        if question is None:
            return {"utterance": state["plan"].closing}
        response = state.get("spoken_response", "").strip()
        if response:
            return {"utterance": response}
        return {"utterance": f"{_REDIRECT} {question.question}"}

    def _wrap_up_node(self, state: TurnState) -> dict[str, Any]:
        coverage = dict(state.get("coverage", {}))
        question = self._current_question(state)
        if question is not None:
            coverage[question.id] = True

        response = state.get("spoken_response", "").strip()
        closing = (
            state["plan"].closing.strip()
            or "Thank you for your time today. Goodbye."
        )
        if response:
            utterance = response
        else:
            utterance = closing

        return {"coverage": coverage, "utterance": utterance, "phase": "done"}

    def _wait_node(self, state: TurnState) -> dict[str, Any]:
        response = state.get("spoken_response", "").strip()
        return {"utterance": response or _WAIT}


def restore_coverage(engine: TurnEngine, assessments: list[dict[str, Any]]) -> None:
    """Resume support: rebuild the engine position from the persisted log.

    Per planned question, the persisted verdicts decide coverage: any
    "sufficient" verdict covers it, and a needs_followup count past the
    question's follow-up limit means the live engine had already advanced
    past it. The interview resumes at the first uncovered question (with its
    follow-up counter restored); a fully covered plan restores to phase
    "done" so nothing is re-asked.
    """
    state = engine.state
    verdicts_by_question: dict[str, list[str]] = {}
    for entry in assessments:
        qid = str(entry.get("question_id") or "")
        verdict = str(entry.get("verdict") or "sufficient")
        if not qid or verdict == "noise":
            continue
        verdicts_by_question.setdefault(qid, []).append(verdict)

    coverage: dict[str, bool] = dict(state.get("coverage", {}))
    followups: dict[str, int] = dict(state.get("followups_used", {}))
    questions = state["plan"].questions
    resume_index = len(questions)
    for idx, question in enumerate(questions):
        verdicts = verdicts_by_question.get(question.id, [])
        used = sum(1 for verdict in verdicts if verdict == "needs_followup")
        if used:
            followups[question.id] = used
        if any(v == "sufficient" for v in verdicts) or used > question.max_followups:
            coverage[question.id] = True
            continue
        resume_index = idx
        break

    state["coverage"] = coverage
    state["followups_used"] = followups
    state["question_index"] = resume_index
    if resume_index >= len(questions):
        state["phase"] = "done"
    elif state.get("phase") == "greeting":
        state["phase"] = "questioning"
    logger.debug(
        f"Restored engine coverage: {len(coverage)} covered, index={resume_index}"
    )
