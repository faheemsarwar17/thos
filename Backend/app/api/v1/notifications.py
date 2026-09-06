from typing import Any

from fastapi import APIRouter

from app.api.dependencies import CurrentUserDependency, DbDependency
from app.db import store

router = APIRouter(tags=["notifications"])


@router.get("/notifications")
async def list_notifications(conn: DbDependency, user: CurrentUserDependency) -> dict[str, Any]:
    notifications = store.list_notifications(conn, user_id=user["id"])
    return {
        "notifications": notifications,
        "unread_count": sum(1 for n in notifications if not n["read"]),
    }


@router.post("/notifications/mark-read")
async def mark_notifications_read(
    conn: DbDependency, user: CurrentUserDependency
) -> dict[str, Any]:
    conn.execute("UPDATE notifications SET read=1 WHERE recipient_user_id=?", (user["id"],))
    conn.commit()
    return {"marked_read": True}
