"""Authentication: register, login, refresh, logout."""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import CurrentUserDependency, DbDependency, SettingsDependency
from app.core.errors import ApiError
from app.db import store
from app.services import auth_tokens
from app.services.passwords import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

_EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=_EMAIL)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=_EMAIL)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=512)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=10, max_length=512)


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user["id"],
        "identity": user["identity"],
        "display_name": user["display_name"],
        "email": user["email"],
        "is_superadmin": bool(user.get("is_superadmin")),
    }


def _session_payload(
    conn: Any, user: dict[str, Any], tokens: dict[str, Any]
) -> dict[str, Any]:
    memberships = store.list_memberships_for_user(conn, user["id"])
    candidate_id = None
    if not memberships:
        candidate = store.get_or_create_candidate(conn, user_id=user["id"])
        candidate_id = candidate["id"]
    return {
        **tokens,
        "user": _public_user(user),
        "memberships": [
            {
                "id": m["id"],
                "organization_id": m["tenant_id"],
                "organization_name": m["organization_name"],
                "role": m["role"],
            }
            for m in memberships
        ],
        "candidate_id": candidate_id,
        "is_superadmin": bool(user.get("is_superadmin")),
        "has_employer_membership": bool(memberships),
    }


@router.post("/register", status_code=201)
async def register(
    payload: RegisterRequest,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    email = str(payload.email).strip().lower()
    if store.get_user_by_email(conn, email):
        raise ApiError(
            status_code=409,
            code="email_already_registered",
            message="An account with this email already exists. Sign in instead.",
        )
    # Staff emails on verified org domains must not also be personal candidate accounts
    # created outside company invite — allow register, but employer membership is separate.
    is_super = email in settings.superadmin_email_set
    user = store.create_user(
        conn,
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        is_superadmin=is_super,
    )
    store.get_or_create_candidate(conn, user_id=user["id"])
    tokens = auth_tokens.issue_token_pair(conn, settings, user=user)
    body = _session_payload(conn, user, tokens)
    conn.commit()
    return body


@router.post("/login")
async def login(
    payload: LoginRequest,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    email = str(payload.email).strip().lower()
    user = store.get_user_by_email(conn, email)
    if user is None or not verify_password(payload.password, user.get("password_hash")):
        raise ApiError(
            status_code=401,
            code="invalid_credentials",
            message="Email or password is incorrect.",
        )
    if user.get("status") != "active":
        raise ApiError(
            status_code=403,
            code="account_disabled",
            message="This account has been disabled.",
        )
    tokens = auth_tokens.issue_token_pair(conn, settings, user=user)
    body = _session_payload(conn, user, tokens)
    conn.commit()
    return body


@router.post("/refresh")
async def refresh(
    payload: RefreshRequest,
    conn: DbDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    tokens, user = auth_tokens.rotate_refresh_token(
        conn, settings, refresh_token=payload.refresh_token
    )
    body = _session_payload(conn, user, tokens)
    conn.commit()
    return body


@router.post("/logout")
async def logout(payload: LogoutRequest, conn: DbDependency) -> dict[str, str]:
    auth_tokens.revoke_refresh_token(conn, refresh_token=payload.refresh_token)
    conn.commit()
    return {"status": "ok"}


@router.get("/me")
async def auth_me(conn: DbDependency, user: CurrentUserDependency) -> dict[str, Any]:
    memberships = store.list_memberships_for_user(conn, user["id"])
    applications = store.list_org_applications_for_user(conn, user["id"])
    candidate_id = None
    if not memberships:
        candidate = store.get_or_create_candidate(conn, user_id=user["id"])
        candidate_id = candidate["id"]
    return {
        "user": _public_user(user),
        "memberships": [
            {
                "id": m["id"],
                "organization_id": m["tenant_id"],
                "organization_name": m["organization_name"],
                "role": m["role"],
            }
            for m in memberships
        ],
        "organization_applications": [
            {
                "id": o["id"],
                "name": o["name"],
                "verification_status": o["verification_status"],
                "domain": o.get("domain", ""),
                "rejection_reason": o.get("rejection_reason", ""),
                "created_at": o["created_at"],
            }
            for o in applications
        ],
        "candidate_id": candidate_id,
        "is_superadmin": bool(user.get("is_superadmin")),
        "has_employer_membership": bool(memberships),
    }
