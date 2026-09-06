"""Canonical application stage model.

Companies assemble a workflow from fixed anchors plus catalog components
(they cannot invent stages). Stage *category* is engine-defined and drives
transition policy and the candidate-facing mapping (architecture.md §11).
"""

from dataclasses import dataclass, field

CATEGORY_NEW = "new"
CATEGORY_REVIEW = "review"
CATEGORY_ASSESSMENT = "assessment"
CATEGORY_OFFER = "offer"
CATEGORY_HIRED = "hired"
CATEGORY_REJECTED = "rejected"
CATEGORY_WITHDRAWN = "withdrawn"
CATEGORY_CLOSED = "closed"

TERMINAL_CATEGORIES = {CATEGORY_HIRED, CATEGORY_REJECTED, CATEGORY_WITHDRAWN, CATEGORY_CLOSED}
HUMAN_APPROVAL_CATEGORIES = {CATEGORY_OFFER, CATEGORY_HIRED, CATEGORY_REJECTED}
VALID_CATEGORIES = {
    CATEGORY_NEW,
    CATEGORY_REVIEW,
    CATEGORY_ASSESSMENT,
    CATEGORY_OFFER,
    CATEGORY_HIRED,
    CATEGORY_REJECTED,
    CATEGORY_WITHDRAWN,
    CATEGORY_CLOSED,
}

# Candidates only ever see one of these four states (architecture.md §11.2).
CANDIDATE_STATUS_BY_CATEGORY = {
    CATEGORY_NEW: "Application received",
    CATEGORY_REVIEW: "Under review",
    CATEGORY_ASSESSMENT: "Interview",
    CATEGORY_OFFER: "Decision",
    CATEGORY_HIRED: "Decision",
    CATEGORY_REJECTED: "Decision",
    CATEGORY_WITHDRAWN: "Decision",
    CATEGORY_CLOSED: "Decision",
}

CANDIDATE_STATUS_ORDER = ["Application received", "Under review", "Interview", "Decision"]


@dataclass(frozen=True)
class Stage:
    id: str
    label: str
    category: str
    requires_reason: bool = False


# Fixed anchors every company workflow must include.
FIXED_STAGES: list[Stage] = [
    Stage(id="received", label="Received", category=CATEGORY_NEW),
    Stage(id="hired", label="Hired", category=CATEGORY_HIRED, requires_reason=True),
    Stage(id="rejected", label="Rejected", category=CATEGORY_REJECTED, requires_reason=True),
    Stage(id="withdrawn", label="Withdrawn", category=CATEGORY_WITHDRAWN, requires_reason=True),
]

FIXED_STAGE_IDS = {stage.id for stage in FIXED_STAGES}


@dataclass(frozen=True)
class WorkflowComponent:
    """A selectable workflow building block (companies cannot invent stages)."""

    id: str
    label: str
    description: str
    stage: Stage


# Optional components companies may enable/disable. Order defines pipeline order.
WORKFLOW_COMPONENTS: list[WorkflowComponent] = [
    WorkflowComponent(
        id="screening",
        label="Screening",
        description="Initial recruiter or hiring-manager screen of applications.",
        stage=Stage(id="screened", label="Screened", category=CATEGORY_REVIEW),
    ),
    WorkflowComponent(
        id="shortlisting",
        label="Shortlisting",
        description="Narrow the pool before interviews or assessments.",
        stage=Stage(id="shortlisted", label="Shortlisted", category=CATEGORY_REVIEW),
    ),
    WorkflowComponent(
        id="ai_interview",
        label="AI Interview",
        description="Applied Interview powered by the active domain pack.",
        stage=Stage(
            id="applied_interview",
            label="AI Interview",
            category=CATEGORY_ASSESSMENT,
        ),
    ),
    WorkflowComponent(
        id="offer",
        label="Offer",
        description="Human approval gate before hiring.",
        stage=Stage(id="offer", label="Offer", category=CATEGORY_OFFER, requires_reason=True),
    ),
]

COMPONENT_BY_ID = {component.id: component for component in WORKFLOW_COMPONENTS}
DEFAULT_COMPONENT_IDS = [component.id for component in WORKFLOW_COMPONENTS]


class WorkflowValidationError(ValueError):
    pass


def stage_to_dict(stage: Stage) -> dict:
    return {
        "id": stage.id,
        "label": stage.label,
        "category": stage.category,
        "requires_reason": stage.requires_reason,
    }


def component_catalog() -> list[dict]:
    return [
        {
            "id": component.id,
            "label": component.label,
            "description": component.description,
            "stage_id": component.stage.id,
            "category": component.stage.category,
        }
        for component in WORKFLOW_COMPONENTS
    ]


def build_stages_from_components(component_ids: list[str] | None = None) -> list[dict]:
    """Assemble a workflow from fixed anchors + selected optional components."""
    selected = list(DEFAULT_COMPONENT_IDS if component_ids is None else component_ids)
    seen: set[str] = set()
    ordered: list[str] = []
    for component_id in selected:
        if component_id in seen:
            continue
        if component_id not in COMPONENT_BY_ID:
            raise WorkflowValidationError(
                f"Unknown workflow component '{component_id}'. "
                "Choose from the provided components."
            )
        seen.add(component_id)
        ordered.append(component_id)

    # Preserve catalog order regardless of request order.
    ordered = [component.id for component in WORKFLOW_COMPONENTS if component.id in seen]

    stages = [stage_to_dict(FIXED_STAGES[0])]  # received
    for component_id in ordered:
        stages.append(stage_to_dict(COMPONENT_BY_ID[component_id].stage))
    stages.extend(stage_to_dict(stage) for stage in FIXED_STAGES[1:])  # hired/rejected/withdrawn
    return stages


def components_from_stages(stages: list[dict]) -> list[str]:
    """Infer enabled components from a stored stage list."""
    stage_ids = {stage.get("id") for stage in stages}
    return [
        component.id
        for component in WORKFLOW_COMPONENTS
        if component.stage.id in stage_ids
    ]


def default_stage_dicts() -> list[dict]:
    return build_stages_from_components()


DEFAULT_STAGES: list[Stage] = [
    Stage(
        id=stage["id"],
        label=stage["label"],
        category=stage["category"],
        requires_reason=stage.get("requires_reason", False),
    )
    for stage in default_stage_dicts()
]


def default_candidate_status_mapping() -> dict[str, str]:
    return {
        stage["id"]: CANDIDATE_STATUS_BY_CATEGORY[stage["category"]]
        for stage in default_stage_dicts()
    }


@dataclass(frozen=True)
class WorkflowDefinition:
    """A published stage configuration used to evaluate transitions."""

    stages: list[dict] = field(default_factory=default_stage_dicts)

    def stage_by_id(self, stage_id: str) -> dict | None:
        for stage in self.stages:
            if stage["id"] == stage_id:
                return stage
        return None

    def pipeline_order(self) -> list[dict]:
        """Non-terminal stages in board order."""
        return [s for s in self.stages if s["category"] not in TERMINAL_CATEGORIES]

    def valid_destinations(self, from_stage_id: str) -> list[dict]:
        """Server-declared valid destinations for a transition.

        Forward/backward movement along the non-terminal pipeline is
        allowed one canonical step at a time; rejection and withdrawal
        are reachable from any non-terminal stage; hiring is reachable
        from Offer when that component is enabled, otherwise from the
        last pipeline stage. Terminal stages have no outbound transitions.
        """
        current = self.stage_by_id(from_stage_id)
        if current is None or current["category"] in TERMINAL_CATEGORIES:
            return []
        order = self.pipeline_order()
        index = next((i for i, s in enumerate(order) if s["id"] == from_stage_id), None)
        destinations: list[dict] = []
        if index is not None:
            if index + 1 < len(order):
                destinations.append(order[index + 1])
            if index > 0:
                destinations.append(order[index - 1])
        for stage in self.stages:
            if stage["category"] in {CATEGORY_REJECTED, CATEGORY_WITHDRAWN}:
                destinations.append(stage)
            elif stage["category"] == CATEGORY_HIRED:
                has_offer = any(s["category"] == CATEGORY_OFFER for s in self.stages)
                if has_offer:
                    if current["category"] == CATEGORY_OFFER:
                        destinations.append(stage)
                elif order and from_stage_id == order[-1]["id"]:
                    destinations.append(stage)
        return destinations


def validate_stages(stages: list[dict]) -> None:
    if not stages:
        raise WorkflowValidationError("A workflow needs at least one stage.")
    seen_ids: set[str] = set()
    categories: set[str] = set()
    for stage in stages:
        stage_id = stage.get("id", "")
        if not stage_id or not str(stage_id).strip():
            raise WorkflowValidationError("Every stage needs a non-empty id.")
        if stage_id in seen_ids:
            raise WorkflowValidationError(f"Stage id '{stage_id}' is duplicated.")
        seen_ids.add(stage_id)
        if not stage.get("label", "").strip():
            raise WorkflowValidationError(f"Stage '{stage_id}' needs a label.")
        category = stage.get("category")
        if category not in VALID_CATEGORIES:
            raise WorkflowValidationError(
                f"Stage '{stage_id}' has unknown category '{category}'."
            )
        categories.add(category)
    if CATEGORY_NEW not in categories:
        raise WorkflowValidationError("A workflow needs exactly one entry stage (category 'new').")
    if sum(1 for s in stages if s["category"] == CATEGORY_NEW) > 1:
        raise WorkflowValidationError("Only one stage may use category 'new'.")
    if CATEGORY_HIRED not in categories:
        raise WorkflowValidationError("A workflow needs a terminal 'hired' stage.")
    if CATEGORY_REJECTED not in categories:
        raise WorkflowValidationError("A workflow needs a terminal 'rejected' stage.")

    # Company workflows must be assembled from fixed anchors + catalog components.
    allowed_ids = FIXED_STAGE_IDS | {c.stage.id for c in WORKFLOW_COMPONENTS}
    unknown = seen_ids - allowed_ids
    if unknown:
        raise WorkflowValidationError(
            "Custom stages are not allowed. Unknown stage ids: "
            + ", ".join(sorted(unknown))
        )
    for fixed in FIXED_STAGES:
        if fixed.id not in seen_ids:
            raise WorkflowValidationError(
                f"Stage '{fixed.label}' is required and cannot be removed."
            )


def validate_candidate_status_mapping(stages: list[dict], mapping: dict[str, str]) -> None:
    for stage in stages:
        status = mapping.get(stage["id"])
        if status is None:
            raise WorkflowValidationError(
                f"Stage '{stage['id']}' is missing a candidate-facing status mapping."
            )
        if status not in CANDIDATE_STATUS_ORDER:
            raise WorkflowValidationError(
                f"Stage '{stage['id']}' maps to unknown candidate status '{status}'."
            )
