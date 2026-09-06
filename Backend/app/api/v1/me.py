from typing import Annotated, Any

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

from app.api.dependencies import CurrentUserDependency, DbDependency, SettingsDependency
from app.core.errors import ApiError
from app.db import store
from app.services.avatars import remove_avatar, resolve_avatar, save_avatar

router = APIRouter(tags=["identity"])


def _avatar_fields(user: dict[str, Any]) -> dict[str, Any]:
    has_avatar = bool(user.get("avatar_path"))
    return {
        "has_avatar": has_avatar,
        "avatar_url": "/api/v1/me/avatar" if has_avatar else None,
    }


@router.get("/me")
async def get_me(conn: DbDependency, user: CurrentUserDependency) -> dict[str, Any]:
    memberships = store.list_memberships_for_user(conn, user["id"])
    applications = store.list_org_applications_for_user(conn, user["id"])
    candidate = None
    if not memberships:
        candidate = store.get_or_create_candidate(conn, user_id=user["id"])
    return {
        "user": {
            "id": user["id"],
            "identity": user["identity"],
            "display_name": user["display_name"],
            "email": user["email"],
            "is_superadmin": bool(user.get("is_superadmin")),
            **_avatar_fields(user),
        },
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
        "candidate_id": candidate["id"] if candidate else None,
        "is_superadmin": bool(user.get("is_superadmin")),
        "has_employer_membership": bool(memberships),
    }


@router.post("/me/avatar", status_code=201)
async def upload_my_avatar(
    conn: DbDependency,
    user: CurrentUserDependency,
    settings: SettingsDependency,
    file: Annotated[UploadFile, File()],
) -> dict[str, Any]:
    """Upload or replace the caller's profile photo (PFP)."""
    data = await file.read()
    file_name = save_avatar(
        settings, user_id=user["id"], data=data, content_type=file.content_type
    )
    store.set_user_avatar(conn, user_id=user["id"], avatar_path=file_name)
    store.write_audit(
        conn,
        tenant_id=user["id"],
        actor_user_id=user["id"],
        action="user.avatar_updated",
        resource_type="user",
        resource_id=user["id"],
    )
    conn.commit()
    return {"avatar": {"has_avatar": True, "avatar_url": "/api/v1/me/avatar"}}


@router.get("/me/avatar")
async def get_my_avatar(
    user: CurrentUserDependency, settings: SettingsDependency
) -> FileResponse:
    resolved = resolve_avatar(settings, avatar_path=user.get("avatar_path"))
    if resolved is None:
        raise ApiError(
            status_code=404, code="avatar_not_found", message="No profile photo on file."
        )
    path, content_type = resolved
    return FileResponse(path, media_type=content_type)


@router.delete("/me/avatar")
async def delete_my_avatar(
    conn: DbDependency, user: CurrentUserDependency, settings: SettingsDependency
) -> dict[str, Any]:
    remove_avatar(settings, avatar_path=user.get("avatar_path"))
    store.set_user_avatar(conn, user_id=user["id"], avatar_path=None)
    conn.commit()
    return {"avatar": {"has_avatar": False, "avatar_url": None}}
