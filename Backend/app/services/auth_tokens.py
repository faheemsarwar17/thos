"""JWT access tokens and opaque refresh tokens."""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.core.config import Settings
from app.core.errors import ApiError
from app.db import store
from app.db.database import Connection


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue_access_token(settings: Settings, *, user: dict[str, Any]) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "identity": user["identity"],
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_access_ttl_seconds)).timestamp()),
    }
    return jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def decode_access_token(settings: Settings, token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(
            status_code=401,
            code="token_expired",
            message="Your access token has expired. Refresh and try again.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError(
            status_code=401,
            code="invalid_token",
            message="The access token is invalid.",
        ) from exc
    if payload.get("typ") != "access" or not payload.get("sub"):
        raise ApiError(
            status_code=401,
            code="invalid_token",
            message="The access token is invalid.",
        )
    return payload


def issue_token_pair(
    conn: Connection, settings: Settings, *, user: dict[str, Any]
) -> dict[str, Any]:
    access_token = issue_access_token(settings, user=user)
    raw_refresh = secrets.token_urlsafe(48)
    expires_at = (
        datetime.now(UTC) + timedelta(seconds=settings.jwt_refresh_ttl_seconds)
    ).isoformat()
    store.create_refresh_token(
        conn,
        user_id=user["id"],
        token_hash=_hash_token(raw_refresh),
        expires_at=expires_at,
    )
    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": settings.jwt_access_ttl_seconds,
    }


def rotate_refresh_token(
    conn: Connection, settings: Settings, *, refresh_token: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    record = store.get_refresh_token_by_hash(conn, _hash_token(refresh_token))
    if record is None or record.get("revoked_at"):
        raise ApiError(
            status_code=401,
            code="invalid_refresh_token",
            message="The refresh token is invalid or has been revoked.",
        )
    if record["expires_at"] < datetime.now(UTC).isoformat():
        store.revoke_refresh_token(conn, token_id=record["id"])
        raise ApiError(
            status_code=401,
            code="refresh_token_expired",
            message="The refresh token has expired. Sign in again.",
        )
    user = store.get_user(conn, record["user_id"])
    if user is None or user.get("status") != "active":
        raise ApiError(
            status_code=401,
            code="invalid_refresh_token",
            message="The refresh token is invalid or has been revoked.",
        )
    pair = issue_token_pair(conn, settings, user=user)
    new_record = store.get_refresh_token_by_hash(conn, _hash_token(pair["refresh_token"]))
    store.revoke_refresh_token(
        conn,
        token_id=record["id"],
        replaced_by=new_record["id"] if new_record else None,
    )
    return pair, user


def revoke_refresh_token(conn: Connection, *, refresh_token: str) -> None:
    record = store.get_refresh_token_by_hash(conn, _hash_token(refresh_token))
    if record and not record.get("revoked_at"):
        store.revoke_refresh_token(conn, token_id=record["id"])
