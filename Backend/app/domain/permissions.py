"""Role → capability matrix for employer actions."""

from __future__ import annotations

from app.core.errors import ApiError

ROLE_ADMINISTRATOR = "administrator"
ROLE_HIRING_MANAGER = "hiring_manager"
ROLE_RECRUITER = "recruiter"
ROLE_REVIEWER = "reviewer"

EMPLOYER_ROLES = {
    ROLE_ADMINISTRATOR,
    ROLE_HIRING_MANAGER,
    ROLE_RECRUITER,
    ROLE_REVIEWER,
}

CAP_MANAGE_ORG = "manage_org"
CAP_MANAGE_PACKS = "manage_packs"
CAP_MANAGE_JOBS = "manage_jobs"
CAP_PIPELINE = "pipeline"
CAP_INVITE_INTERVIEW = "invite_interview"
CAP_SCORECARD = "scorecard"
CAP_VIEW_AUDIT = "view_audit"

ROLE_PERMISSIONS: dict[str, set[str]] = {
    ROLE_ADMINISTRATOR: {
        CAP_MANAGE_ORG,
        CAP_MANAGE_PACKS,
        CAP_MANAGE_JOBS,
        CAP_PIPELINE,
        CAP_INVITE_INTERVIEW,
        CAP_SCORECARD,
        CAP_VIEW_AUDIT,
    },
    ROLE_HIRING_MANAGER: {
        CAP_MANAGE_JOBS,
        CAP_PIPELINE,
        CAP_INVITE_INTERVIEW,
        CAP_SCORECARD,
    },
    ROLE_RECRUITER: {
        CAP_PIPELINE,
        CAP_INVITE_INTERVIEW,
    },
    ROLE_REVIEWER: {
        CAP_SCORECARD,
    },
}


def role_has_permission(role: str, capability: str) -> bool:
    return capability in ROLE_PERMISSIONS.get(role, set())


def require_permission(role: str, capability: str) -> None:
    if not role_has_permission(role, capability):
        raise ApiError(
            status_code=403,
            code="forbidden",
            message="Your role does not permit this action.",
        )
