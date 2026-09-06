"""Sandbox content generation: coding problems and written exercises.

Coding sandboxes get an original DSA-style problem scaled to the configured
difficulty and grounded in the job description; written sandboxes get 2-3
long-form prompts grounded in the pack competencies. When no AI key is
configured (or the chain fails) a deterministic fallback bank is used so dev
and tests never touch the network.
"""

from __future__ import annotations

import hashlib
from typing import Any

from app.core.config import Settings
from app.logging import logger

from .models import SandboxExample, SandboxProblem, WrittenExercise, WrittenPrompt

_CODING_RULES = """\
Rules for the problem you author:
- It must be ORIGINAL: inspired by classic DSA patterns but not a verbatim
  copy of a well-known puzzle; rename the domain and rephrase the story.
- The statement must be fully self-contained (no external references) and
  unambiguous about inputs, outputs, and edge cases.
- Provide 1-2 worked examples with a short explanation each.
- List explicit constraints (input sizes, value ranges) that make the
  expected complexity target fair.
- starter_code is a single Python function or class skeleton with a docstring
  and `pass` body; language_hint stays "python".
- rubric holds 4-6 concrete, checkable grading criteria (correctness,
  approach, complexity, edge cases, readability).
- Scale to the requested difficulty:
  * easy: one pass or a hash map; solvable in ~15 minutes.
  * medium: a known data-structure pattern (intervals, LRU, heaps, two
    pointers); solvable in ~25 minutes.
  * hard: graphs (topological order, shortest path) or dynamic programming;
    solvable in ~40 minutes.
- id is a short lowercase slug (words joined by hyphens).
"""

_WRITTEN_RULES = """\
Rules for the exercise you author:
- Produce 2-3 long-form written prompts; each must target ONE of the listed
  competencies by name and be answerable from the candidate's own experience.
- Prompts demand specifics: context, the candidate's personal actions, and
  measurable outcomes (STAR). No generic opinion questions.
- min_words is 120-250 per prompt, proportional to the prompt's depth.
- rubric holds 4-6 concrete, checkable grading criteria (relevance, depth,
  specificity, structure, language quality, word count).
- ids are stable: w1, w2, w3.
"""


def _chat_model(settings: Settings) -> Any:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.plan_generation_model,
        api_key=settings.ai_api_key.get_secret_value() if settings.ai_api_key else None,
        timeout=float(settings.ai_timeout_seconds),
    )


def _coding_chain(settings: Settings) -> Any:
    """LangChain chain producing a SandboxProblem (module-level for testability)."""
    from langchain_core.prompts import ChatPromptTemplate

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You author original programming assessment problems for a "
                "proctored hiring sandbox.\n" + _CODING_RULES,
            ),
            (
                "human",
                "Role: {job_title}\n\nJob description:\n{job_description}\n\n"
                "Candidate profile:\n{candidate_profile}\n\n"
                "Difficulty: {difficulty}\n\n"
                "Return one original coding problem at exactly this difficulty, "
                "themed around the role's domain where natural.",
            ),
        ]
    )
    return prompt | _chat_model(settings).with_structured_output(SandboxProblem)


def _written_chain(settings: Settings) -> Any:
    """LangChain chain producing a WrittenExercise (module-level for testability)."""
    from langchain_core.prompts import ChatPromptTemplate

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You author written assessment exercises for a proctored hiring "
                "sandbox.\n" + _WRITTEN_RULES,
            ),
            (
                "human",
                "Role: {job_title}\n\nJob description:\n{job_description}\n\n"
                "Candidate profile:\n{candidate_profile}\n\n"
                "Competencies to assess: {competencies}\n"
                "Difficulty: {difficulty}\n\n"
                "Return the written exercise for this role.",
            ),
        ]
    )
    return prompt | _chat_model(settings).with_structured_output(WrittenExercise)


# --- Fallback bank: 3 curated problems per difficulty -------------------------

_FALLBACK_BANK: dict[str, list[SandboxProblem]] = {
    "easy": [
        SandboxProblem(
            id="pair-sum",
            title="Pair Sum",
            statement=(
                "You are given a list of integers `nums` and an integer `target`. "
                "Return the 0-based indices of two distinct elements whose values add "
                "up to `target`, in ascending order. Exactly one valid pair exists."
            ),
            examples=[
                SandboxExample(
                    input="nums = [2, 7, 11, 15], target = 9",
                    output="[0, 1]",
                    explanation="nums[0] + nums[1] = 2 + 7 = 9.",
                ),
                SandboxExample(
                    input="nums = [3, 2, 4], target = 6",
                    output="[1, 2]",
                    explanation="nums[1] + nums[2] = 2 + 4 = 6.",
                ),
            ],
            constraints=[
                "2 <= len(nums) <= 10^4",
                "-10^9 <= nums[i], target <= 10^9",
                "Exactly one valid pair exists.",
            ],
            starter_code=(
                "def pair_sum(nums: list[int], target: int) -> list[int]:\n"
                "    \"\"\"Return ascending indices of the pair summing to target.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Returns the correct index pair for all valid inputs",
                "Handles negative values and duplicate numbers correctly",
                "Reaches O(n) time with a hash map, or clearly justifies a simpler approach",
                "Returns indices in ascending order as specified",
                "Code is readable with meaningful names",
            ],
        ),
        SandboxProblem(
            id="first-unique-character",
            title="First Unique Character",
            statement=(
                "Given a string `s` of lowercase letters, return the index of the "
                "first character that appears exactly once. Return -1 if no such "
                "character exists."
            ),
            examples=[
                SandboxExample(
                    input='s = "leetcode"',
                    output="0",
                    explanation="'l' appears once and is the first unique character.",
                ),
                SandboxExample(
                    input='s = "aabb"',
                    output="-1",
                    explanation="Every character repeats.",
                ),
            ],
            constraints=[
                "1 <= len(s) <= 10^5",
                "s contains only lowercase ASCII letters.",
            ],
            starter_code=(
                "def first_unique_char(s: str) -> int:\n"
                "    \"\"\"Return the index of the first non-repeating character, else -1.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Returns the correct index (or -1) for all inputs",
                "Uses an O(n) counting approach rather than nested scans",
                "Handles the all-repeating and single-character edge cases",
                "Code is readable with meaningful names",
            ],
        ),
        SandboxProblem(
            id="best-stock-profit",
            title="Best Stock Profit",
            statement=(
                "`prices[i]` is the price of a stock on day i. Return the maximum "
                "profit achievable by buying on one day and selling on a strictly "
                "later day. Return 0 if no profitable trade exists."
            ),
            examples=[
                SandboxExample(
                    input="prices = [7, 1, 5, 3, 6, 4]",
                    output="5",
                    explanation="Buy at 1 (day 1), sell at 6 (day 4): profit 5.",
                ),
                SandboxExample(
                    input="prices = [7, 6, 4, 3, 1]",
                    output="0",
                    explanation="Prices only fall, so no trade is profitable.",
                ),
            ],
            constraints=[
                "1 <= len(prices) <= 10^5",
                "0 <= prices[i] <= 10^4",
            ],
            starter_code=(
                "def max_profit(prices: list[int]) -> int:\n"
                "    \"\"\"Return the best profit from one buy followed by one sell.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Computes the maximum profit correctly for all inputs",
                "Solves it in one pass (O(n)) tracking the running minimum",
                "Returns 0 for monotonically decreasing prices",
                "Code is readable with meaningful names",
            ],
        ),
    ],
    "medium": [
        SandboxProblem(
            id="merge-schedules",
            title="Merge Schedules",
            statement=(
                "You are given a list of meeting intervals `intervals`, where each "
                "interval is [start, end). Merge all overlapping or touching intervals "
                "and return the merged list sorted by start time."
            ),
            examples=[
                SandboxExample(
                    input="intervals = [[1, 3], [2, 6], [8, 10], [15, 18]]",
                    output="[[1, 6], [8, 10], [15, 18]]",
                    explanation="[1, 3] and [2, 6] overlap and merge into [1, 6].",
                ),
                SandboxExample(
                    input="intervals = [[1, 4], [4, 5]]",
                    output="[[1, 5]]",
                    explanation="Touching intervals (end == next start) merge.",
                ),
            ],
            constraints=[
                "1 <= len(intervals) <= 10^4",
                "0 <= start < end <= 10^6",
            ],
            starter_code=(
                "def merge_intervals(intervals: list[list[int]]) -> list[list[int]]:\n"
                "    \"\"\"Return the sorted list of merged, non-overlapping intervals.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Merges overlapping and touching intervals correctly",
                "Sorts first and merges in a single pass: O(n log n) overall",
                "Handles unsorted input, nested intervals, and single-interval input",
                "Does not mutate the caller's list unexpectedly",
                "Code is readable with meaningful names",
            ],
        ),
        SandboxProblem(
            id="lru-cache",
            title="LRU Cache",
            statement=(
                "Design a class `LRUCache` with a fixed positive capacity. "
                "`get(key)` returns the value for `key` or -1 if absent. "
                "`put(key, value)` inserts or updates the entry; when the cache "
                "exceeds capacity it evicts the least recently used entry. Both "
                "operations must run in O(1) average time."
            ),
            examples=[
                SandboxExample(
                    input=(
                        "cache = LRUCache(2); put(1, 1); put(2, 2); get(1); "
                        "put(3, 3); get(2)"
                    ),
                    output="1 then -1",
                    explanation=(
                        "get(1) makes key 1 most-recent; put(3, 3) evicts key 2, "
                        "so get(2) returns -1."
                    ),
                ),
            ],
            constraints=[
                "1 <= capacity <= 3000",
                "0 <= key, value <= 10^4",
                "At most 2 * 10^5 calls to get and put.",
            ],
            starter_code=(
                "class LRUCache:\n"
                "    def __init__(self, capacity: int):\n"
                "        pass\n\n"
                "    def get(self, key: int) -> int:\n"
                "        pass\n\n"
                "    def put(self, key: int, value: int) -> None:\n"
                "        pass\n"
            ),
            rubric=[
                "get and put are both correct, including updates of existing keys",
                "Evicts exactly the least recently used entry on overflow",
                "Achieves O(1) average operations (hash map + linked list, or an "
                "ordered map with a stated justification)",
                "Handles capacity 1 and repeated get/put interleavings",
                "API is clean and the code is readable",
            ],
        ),
        SandboxProblem(
            id="top-k-frequent-words",
            title="Top K Frequent Words",
            statement=(
                "Given a list of strings `words` and an integer `k`, return the k "
                "most frequent words. Order the result by frequency descending; "
                "break ties alphabetically (ascending)."
            ),
            examples=[
                SandboxExample(
                    input='words = ["i", "love", "coding", "i", "love", "cats"], k = 2',
                    output='["i", "love"]',
                    explanation='"i" and "love" both appear twice; ties break alphabetically.',
                ),
            ],
            constraints=[
                "1 <= len(words) <= 5 * 10^4",
                "1 <= k <= number of distinct words",
                "Words consist of lowercase ASCII letters.",
            ],
            starter_code=(
                "def top_k_frequent(words: list[str], k: int) -> list[str]:\n"
                "    \"\"\"Return the k most frequent words, ties broken alphabetically.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Counts frequencies correctly and returns exactly k words",
                "Applies the alphabetical tie-break exactly as specified",
                "Uses a heap or sorted structure with a stated complexity better "
                "than naive repeated scans",
                "Handles k equal to the distinct-word count",
                "Code is readable with meaningful names",
            ],
        ),
    ],
    "hard": [
        SandboxProblem(
            id="build-order",
            title="Build Order",
            statement=(
                "There are `n` tasks labelled 0..n-1. `prerequisites` holds pairs "
                "[a, b] meaning task b must complete before task a. Return any "
                "valid order in which all tasks can complete, or an empty list if "
                "a dependency cycle makes it impossible."
            ),
            examples=[
                SandboxExample(
                    input="n = 4, prerequisites = [[1, 0], [2, 0], [3, 1], [3, 2]]",
                    output="[0, 2, 1, 3]",
                    explanation="0 has no prerequisites; 3 needs both 1 and 2 done first.",
                ),
                SandboxExample(
                    input="n = 2, prerequisites = [[1, 0], [0, 1]]",
                    output="[]",
                    explanation="The cycle 0 -> 1 -> 0 makes ordering impossible.",
                ),
            ],
            constraints=[
                "1 <= n <= 2000",
                "0 <= len(prerequisites) <= 5000",
                "All pairs are distinct and reference valid tasks.",
            ],
            starter_code=(
                "def build_order(n: int, prerequisites: list[list[int]]) -> list[int]:\n"
                "    \"\"\"Return a valid completion order, or [] if a cycle exists.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Produces a valid topological order whenever one exists",
                "Detects cycles and returns [] exactly then",
                "Runs in O(n + len(prerequisites)) (Kahn's algorithm or DFS)",
                "Handles disconnected tasks and empty prerequisite lists",
                "Explains or clearly structures the chosen approach",
            ],
        ),
        SandboxProblem(
            id="coin-change-minimum",
            title="Coin Change Minimum",
            statement=(
                "Given coin denominations `coins` (positive integers) and an "
                "integer `amount`, return the fewest coins needed to make up "
                "exactly `amount`. You have unlimited coins of each denomination. "
                "Return -1 if the amount cannot be made."
            ),
            examples=[
                SandboxExample(
                    input="coins = [1, 2, 5], amount = 11",
                    output="3",
                    explanation="11 = 5 + 5 + 1.",
                ),
                SandboxExample(
                    input="coins = [2], amount = 3",
                    output="-1",
                    explanation="3 cannot be made from 2-value coins.",
                ),
            ],
            constraints=[
                "1 <= len(coins) <= 12",
                "1 <= coins[i] <= 2^31 - 1",
                "0 <= amount <= 10^4",
            ],
            starter_code=(
                "def min_coins(coins: list[int], amount: int) -> int:\n"
                "    \"\"\"Return the fewest coins making `amount`, or -1 if impossible.\"\"\"\n"
                "    pass\n"
            ),
            rubric=[
                "Returns the true minimum for all inputs, including 0",
                "Uses dynamic programming or BFS in O(amount * len(coins))",
                "Returns -1 exactly when the amount is unreachable",
                "Avoids exponential naive recursion (or memoizes it correctly)",
                "Code is readable with meaningful names",
            ],
        ),
        SandboxProblem(
            id="median-stream",
            title="Median of a Stream",
            statement=(
                "Design a class `MedianFinder`. `add_num(x)` adds integer x to the "
                "stream; `find_median()` returns the median of everything added so "
                "far — the middle value for an odd count, or the mean of the two "
                "middle values for an even count."
            ),
            examples=[
                SandboxExample(
                    input="add_num(1); add_num(2); find_median(); add_num(3); find_median()",
                    output="1.5 then 2.0",
                    explanation="Median of [1, 2] is 1.5; median of [1, 2, 3] is 2.",
                ),
            ],
            constraints=[
                "-10^5 <= x <= 10^5",
                "At most 5 * 10^4 calls across both methods.",
            ],
            starter_code=(
                "class MedianFinder:\n"
                "    def __init__(self):\n"
                "        pass\n\n"
                "    def add_num(self, x: int) -> None:\n"
                "        pass\n\n"
                "    def find_median(self) -> float:\n"
                "        pass\n"
            ),
            rubric=[
                "Reports the exact median for both even and odd counts",
                "Uses two heaps for O(log n) add and O(1) median, or justifies an "
                "alternative with stated complexity",
                "Keeps the two halves balanced across interleaved calls",
                "Handles negative values and duplicates",
                "API is clean and the code is readable",
            ],
        ),
    ],
}


def _stable_pick(options: list[SandboxProblem], seed: str) -> SandboxProblem:
    """Deterministically pick a bank problem from a seed (posting id)."""
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    return options[int(digest, 16) % len(options)]


def fallback_coding_problem(difficulty: str, seed: str = "") -> SandboxProblem:
    """Deterministic bank problem used when no AI key is configured (tests/dev)."""
    bank = _FALLBACK_BANK.get(difficulty) or _FALLBACK_BANK["medium"]
    if not seed:
        return bank[0]
    return _stable_pick(bank, seed)


def fallback_written_exercise(
    competencies: list[str], job_title: str = ""
) -> WrittenExercise:
    """Deterministic template prompts used when no AI key is configured (tests/dev)."""
    topics = [c.strip() for c in competencies if str(c).strip()][:3]
    if not topics:
        topics = ["the core responsibilities of this role"]
    prompts = [
        WrittenPrompt(
            id=f"w{idx}",
            question=(
                f"Describe a specific situation from your experience that demonstrates "
                f"your ability in {topic}. Explain the context, the actions you "
                f"personally took, and the measurable outcome."
            ),
            min_words=150,
        )
        for idx, topic in enumerate(topics, start=1)
    ]
    if len(prompts) < 2:
        role = job_title or "this role"
        prompts.append(
            WrittenPrompt(
                id=f"w{len(prompts) + 1}",
                question=(
                    f"What do you consider the hardest part of succeeding as {role}, "
                    "and how have you prepared yourself to handle it? Support your "
                    "answer with concrete examples."
                ),
                min_words=150,
            )
        )
    return WrittenExercise(
        prompts=prompts,
        rubric=[
            "Directly addresses every part of the prompt",
            "Provides concrete, specific examples rather than generic claims",
            "Explains the candidate's personal actions and their measurable outcomes",
            "Writing is clear, structured, and professional",
            "Meets the stated minimum word count",
        ],
    )


def _posting_competencies(posting: dict[str, Any]) -> list[str]:
    """Distinct competency names from the posting's curated question pool."""
    pool = posting.get("question_pool")
    questions = pool.get("questions") if isinstance(pool, dict) else pool
    seen: list[str] = []
    for question in questions or []:
        if not isinstance(question, dict):
            continue
        name = str(question.get("competency") or question.get("theme") or "").strip()
        if name and name not in seen:
            seen.append(name)
    return seen


async def _generate_coding(
    *, posting: dict[str, Any], candidate_profile: str, difficulty: str, settings: Settings
) -> SandboxProblem:
    chain = _coding_chain(settings)
    problem: SandboxProblem = await chain.ainvoke(
        {
            "job_title": posting.get("title") or "Open role",
            "job_description": posting.get("description") or "No job description provided.",
            "candidate_profile": candidate_profile or "No profile details available.",
            "difficulty": difficulty,
        }
    )
    if not problem.id.strip():
        problem = problem.model_copy(update={"id": f"{difficulty}-sandbox"})
    return problem


async def _generate_written(
    *,
    posting: dict[str, Any],
    candidate_profile: str,
    competencies: list[str],
    difficulty: str,
    settings: Settings,
) -> WrittenExercise:
    chain = _written_chain(settings)
    exercise: WrittenExercise = await chain.ainvoke(
        {
            "job_title": posting.get("title") or "Open role",
            "job_description": posting.get("description") or "No job description provided.",
            "candidate_profile": candidate_profile or "No profile details available.",
            "competencies": ", ".join(competencies) or "general professional judgement",
            "difficulty": difficulty,
        }
    )
    if not exercise.prompts:
        raise ValueError("LLM returned a written exercise with no prompts")
    return exercise


async def generate_sandbox_content(
    *,
    posting: dict[str, Any],
    candidate_profile: str,
    config: dict[str, Any],
    settings: Settings,
) -> SandboxProblem | WrittenExercise:
    """Generate the sandbox content, falling back to a deterministic bank/template."""
    sandbox_type = str(config.get("type") or "coding")
    difficulty = str(config.get("difficulty") or "medium")
    competencies = _posting_competencies(posting)
    seed = str(posting.get("id") or posting.get("title") or "")

    if not settings.ai_is_configured:
        logger.info("AI key not configured — using fallback sandbox content")
        if sandbox_type == "written":
            return fallback_written_exercise(competencies, str(posting.get("title") or ""))
        return fallback_coding_problem(difficulty, seed)

    try:
        if sandbox_type == "written":
            return await _generate_written(
                posting=posting,
                candidate_profile=candidate_profile,
                competencies=competencies,
                difficulty=difficulty,
                settings=settings,
            )
        return await _generate_coding(
            posting=posting,
            candidate_profile=candidate_profile,
            difficulty=difficulty,
            settings=settings,
        )
    except Exception as err:
        logger.error(
            f"Sandbox content generation failed, using fallback: {err}", exc_info=True
        )
        if sandbox_type == "written":
            return fallback_written_exercise(competencies, str(posting.get("title") or ""))
        return fallback_coding_problem(difficulty, seed)
