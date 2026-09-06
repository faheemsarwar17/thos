import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Header, Request

from app.core.config import Environment, Settings
from app.core.errors import ApiError
from app.db import store
from app.db.database import Connection, connect
from app.domain.permissions import EMPLOYER_ROLES, require_permission
from app.services.auth_tokens import decode_access_token
from app.services.packs import PackRegistry

IDENTITY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

ADMIN_ROLES = {"administrator"}
PIPELINE_ROLES = {"administrator", "hiring_manager", "recruiter"}


def settings_dependency(request: Request) -> Settings:
    return request.app.state.settings


SettingsDependency = Annotated[Settings, Depends(settings_dependency)]


def db_dependency(settings: SettingsDependency) -> Iterator[Connection]:
    conn = connect(settings.database)
    try:
        yield conn
    finally:
        conn.close()


DbDependency = Annotated[Connection, Depends(db_dependency)]


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def identity_dependency(
    settings: SettingsDependency,
    conn: DbDependency,
    authorization: Annotated[str | None, Header()] = None,
    development_identity: Annotated[
        str | None, Header(alias="X-Development-Identity")
    ] = None,
) -> str:
    """Resolve the caller identity from Bearer JWT, else development header."""
    token = _bearer_token(authorization)
    if token:
        payload = decode_access_token(settings, token)
        user = store.get_user(conn, payload["sub"])
        if user is None or user.get("status") != "active":
            raise ApiError(
                status_code=401,
                code="invalid_token",
                message="The access token is invalid.",
            )
        return user["identity"]

    if settings.environment in (Environment.DEVELOPMENT, Environment.TEST):
        identity = development_identity or settings.development_identity
        if not IDENTITY_PATTERN.fullmatch(identity):
            raise ApiError(
                status_code=422,
                code="invalid_development_identity",
                message=(
                    "Development identity must be 1-64 letters, numbers, "
                    "underscores, or hyphens."
                ),
            )
        return identity

    raise ApiError(
        status_code=401,
        code="authentication_required",
        message="Sign in to continue.",
    )


IdentityDependency = Annotated[str, Depends(identity_dependency)]


def current_user_dependency(
    conn: DbDependency,
    identity: IdentityDependency,
    settings: SettingsDependency,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    token = _bearer_token(authorization)
    if token:
        payload = decode_access_token(settings, token)
        user = store.get_user(conn, payload["sub"])
        if user is None or user.get("status") != "active":
            raise ApiError(
                status_code=401,
                code="invalid_token",
                message="The access token is invalid.",
            )
        return user
    # Development header path may still auto-create synthetic users.
    return store.get_or_create_user(conn, identity)


CurrentUserDependency = Annotated[dict[str, Any], Depends(current_user_dependency)]


@dataclass(frozen=True)
class EmployerContext:
    user: dict[str, Any]
    membership: dict[str, Any]
    tenant_id: str
    role: str


def employer_context_dependency(
    conn: DbDependency,
    user: CurrentUserDependency,
    organization_id: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> EmployerContext:
    memberships = store.list_memberships_for_user(conn, user["id"])
    if organization_id:
        membership = next((m for m in memberships if m["tenant_id"] == organization_id), None)
    else:
        membership = memberships[0] if memberships else None
    if membership is None:
        raise ApiError(
            status_code=403,
            code="forbidden",
            message="You do not have access to this organization.",
        )
    org = store.get_organization(conn, membership["tenant_id"])
    if org is None or org.get("verification_status") != "verified":
        raise ApiError(
            status_code=403,
            code="organization_not_verified",
            message="This organization is not verified yet.",
        )
    if membership["role"] not in EMPLOYER_ROLES:
        raise ApiError(
            status_code=403,
            code="forbidden",
            message="You do not have access to this organization.",
        )
    return EmployerContext(
        user=user,
        membership=membership,
        tenant_id=membership["tenant_id"],
        role=membership["role"],
    )


EmployerContextDependency = Annotated[EmployerContext, Depends(employer_context_dependency)]


def require_role(context: EmployerContext, allowed_roles: set[str]) -> None:
    if context.role not in allowed_roles:
        raise ApiError(
            status_code=403,
            code="forbidden",
            message="Your role does not permit this action.",
        )


def require_capability(context: EmployerContext, capability: str) -> None:
    require_permission(context.role, capability)


@dataclass(frozen=True)
class CandidateContext:
    user: dict[str, Any]
    candidate: dict[str, Any]


def candidate_context_dependency(
    conn: DbDependency, user: CurrentUserDependency
) -> CandidateContext:
    # Company staff who want to apply must use a separate personal account.
    if store.user_has_employer_membership(conn, user["id"]):
        raise ApiError(
            status_code=403,
            code="employer_account_cannot_be_candidate",
            message=(
                "This account is linked to an employer organization. "
                "Create a separate personal account with a different email to apply as a candidate."
            ),
        )
    candidate = store.get_or_create_candidate(conn, user_id=user["id"])
    return CandidateContext(user=user, candidate=candidate)


CandidateContextDependency = Annotated[CandidateContext, Depends(candidate_context_dependency)]


def pack_registry_dependency(settings: SettingsDependency) -> PackRegistry:
    return PackRegistry(settings.domain_packs_path)


PackRegistryDependency = Annotated[PackRegistry, Depends(pack_registry_dependency)]


def correlation_id_dependency(request: Request) -> str:
    return getattr(request.state, "correlation_id", None) or getattr(
        request.state, "request_id", "unavailable"
    )


CorrelationIdDependency = Annotated[str, Depends(correlation_id_dependency)]


def interview_identity_dependency(
    settings: SettingsDependency,
    conn: DbDependency,
    authorization: Annotated[str | None, Header()] = None,
    development_identity: Annotated[
        str | None, Header(alias="X-Development-Identity")
    ] = None,
) -> str:
    return identity_dependency(
        settings=settings,
        conn=conn,
        authorization=authorization,
        development_identity=development_identity,
    )


InterviewIdentityDependency = Annotated[str, Depends(interview_identity_dependency)]


def require_superadmin(user: dict[str, Any]) -> None:
    if not user.get("is_superadmin"):
        raise ApiError(
            status_code=403,
            code="forbidden",
            message="Platform administrator access is required.",
        )
