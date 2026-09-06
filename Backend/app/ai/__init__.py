"""AI module for interview platform.

LangGraph interview pipeline: plan generation (app.ai.plan), the deterministic
turn engine (app.ai.graph), and the LiveKit runtime (app.ai.runtime).
"""

from . import runtime
from .runtime import manager as AgentService  # backwards-compatible alias

__all__ = [
    "AgentService",
    "runtime",
]
