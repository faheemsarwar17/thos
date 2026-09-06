from typing import Annotated, Any

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from app.api.dependencies import (
    CorrelationIdDependency,
    CurrentUserDependency,
    DbDependency,
    EmployerContextDependency,
)
from app.core.errors import ApiError
from app.core.ids import new_id
from app.db import store
from app.db.database import utc_now

router = APIRouter(tags=["messages"])


class CreateConversationRequest(BaseModel):
    candidate_id: str
    application_id: str | None = None
    posting_id: str | None = None
    subject: str = Field(default="")
    initial_message: str | None = None


class SendMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=10000)


def _resolve_caller_role(
    conn: Any, user: dict[str, Any], conversation: dict[str, Any]
) -> tuple[str, str]:
    """Verify that caller belongs to the conversation and return (role, display_name)."""
    memberships = store.list_memberships_for_user(conn, user["id"])
    employer_match = next((m for m in memberships if m["tenant_id"] == conversation["tenant_id"]), None)

    candidate = conn.execute(
        "SELECT * FROM candidates WHERE id=? AND user_id=?",
        (conversation["candidate_id"], user["id"]),
    ).fetchone()

    if employer_match:
        return "employer", user.get("display_name", "Recruiter")
    if candidate:
        return "candidate", user.get("display_name", "Candidate")

    raise ApiError(
        status_code=403,
        code="forbidden",
        message="You do not have access to this conversation.",
    )


@router.get("/conversations")
async def list_conversations(
    conn: DbDependency,
    user: CurrentUserDependency,
    organization_id: Annotated[str | None, Header(alias="X-Organization-Id")] = None,
) -> dict[str, Any]:
    """List conversations for current user based on active context."""
    memberships = store.list_memberships_for_user(conn, user["id"])
    
    if organization_id:
        active_membership = next((m for m in memberships if m["tenant_id"] == organization_id), None)
    else:
        active_membership = memberships[0] if memberships else None

    if active_membership:
        conversations = store.list_conversations_for_tenant(
            conn, tenant_id=active_membership["tenant_id"]
        )
        return {"conversations": conversations, "context_role": "employer"}

    # Fallback to candidate conversations
    cand = conn.execute(
        "SELECT id FROM candidates WHERE user_id=?", (user["id"],)
    ).fetchone()
    if cand:
        conversations = store.list_conversations_for_candidate(conn, candidate_id=cand["id"])
        return {"conversations": conversations, "context_role": "candidate"}

    return {"conversations": [], "context_role": "unknown"}


@router.get("/candidates/me/conversations")
async def list_candidate_conversations(
    conn: DbDependency,
    user: CurrentUserDependency,
) -> dict[str, Any]:
    cand = conn.execute(
        "SELECT id FROM candidates WHERE user_id=?", (user["id"],)
    ).fetchone()
    if not cand:
        return {"conversations": []}
    conversations = store.list_conversations_for_candidate(conn, candidate_id=cand["id"])
    return {"conversations": conversations}


@router.post("/conversations")
async def create_or_get_conversation(
    payload: CreateConversationRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    existing = store.find_conversation(
        conn,
        tenant_id=context.tenant_id,
        candidate_id=payload.candidate_id,
        application_id=payload.application_id,
    )
    if existing:
        if payload.initial_message:
            store.create_message(
                conn,
                conversation_id=existing["id"],
                sender_user_id=context.user["id"],
                sender_role="employer",
                sender_name=context.user.get("display_name", "Recruiter"),
                body=payload.initial_message,
            )
        conn.commit()
        return {"conversation": existing}

    subject = payload.subject
    if not subject and payload.posting_id:
        posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=payload.posting_id)
        if posting:
            subject = f"Conversation re: {posting['title']}"

    conv = store.create_conversation(
        conn,
        tenant_id=context.tenant_id,
        candidate_id=payload.candidate_id,
        application_id=payload.application_id,
        posting_id=payload.posting_id,
        subject=subject or "Application Conversation",
        last_message_preview=payload.initial_message[:80] if payload.initial_message else "",
    )

    if payload.initial_message:
        store.create_message(
            conn,
            conversation_id=conv["id"],
            sender_user_id=context.user["id"],
            sender_role="employer",
            sender_name=context.user.get("display_name", "Recruiter"),
            body=payload.initial_message,
        )

    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="conversation.created",
        resource_type="conversation",
        resource_id=conv["id"],
        new_state=conv,
    )
    conn.commit()
    return {"conversation": conv}


@router.get("/conversations/by-application/{application_id}")
async def get_or_create_by_application(
    application_id: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    conv = store.find_conversation_by_application(
        conn, tenant_id=context.tenant_id, application_id=application_id
    )
    if conv:
        return {"conversation": conv}

    app = store.get_application(conn, tenant_id=context.tenant_id, application_id=application_id)
    if not app:
        raise ApiError(status_code=404, code="not_found", message="Application not found.")

    posting = store.get_posting(conn, tenant_id=context.tenant_id, posting_id=app["posting_id"])
    subject = f"Regarding {posting['title']}" if posting else "Application Discussion"

    conv = store.create_conversation(
        conn,
        tenant_id=context.tenant_id,
        candidate_id=app["candidate_id"],
        application_id=application_id,
        posting_id=app["posting_id"],
        subject=subject,
    )
    conn.commit()
    return {"conversation": conv}


@router.get("/conversations/{conversation_id}")
async def get_conversation_detail(
    conversation_id: str,
    conn: DbDependency,
    user: CurrentUserDependency,
) -> dict[str, Any]:
    conv = store.get_conversation(conn, conversation_id=conversation_id)
    if not conv:
        raise ApiError(status_code=404, code="not_found", message="Conversation not found.")

    role, _ = _resolve_caller_role(conn, user, conv)

    # Attach metadata
    posting = None
    if conv.get("posting_id"):
        p_row = conn.execute(
            "SELECT id, title FROM postings WHERE id=?", (conv["posting_id"],)
        ).fetchone()
        if p_row:
            posting = dict(p_row)

    cand_row = conn.execute(
        """SELECT c.id, u.display_name, u.email
           FROM candidates c JOIN users u ON u.id = c.user_id
           WHERE c.id = ?""",
        (conv["candidate_id"],),
    ).fetchone()
    candidate_info = dict(cand_row) if cand_row else None

    org_row = conn.execute(
        "SELECT id, name FROM organizations WHERE id = ?", (conv["tenant_id"],)
    ).fetchone()
    org_info = dict(org_row) if org_row else None

    return {
        "conversation": conv,
        "caller_role": role,
        "posting": posting,
        "candidate": candidate_info,
        "organization": org_info,
    }


@router.get("/conversations/{conversation_id}/messages")
async def get_conversation_messages(
    conversation_id: str,
    conn: DbDependency,
    user: CurrentUserDependency,
) -> dict[str, Any]:
    conv = store.get_conversation(conn, conversation_id=conversation_id)
    if not conv:
        raise ApiError(status_code=404, code="not_found", message="Conversation not found.")

    _resolve_caller_role(conn, user, conv)

    # Automatically mark unread messages sent by others as read
    store.mark_messages_read(conn, conversation_id=conversation_id, reader_user_id=user["id"])
    conn.commit()

    messages = store.list_messages_for_conversation(conn, conversation_id=conversation_id)
    return {"messages": messages}


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    payload: SendMessageRequest,
    conn: DbDependency,
    user: CurrentUserDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    conv = store.get_conversation(conn, conversation_id=conversation_id)
    if not conv:
        raise ApiError(status_code=404, code="not_found", message="Conversation not found.")

    role, display_name = _resolve_caller_role(conn, user, conv)

    msg = store.create_message(
        conn,
        conversation_id=conversation_id,
        sender_user_id=user["id"],
        sender_role=role,
        sender_name=display_name,
        body=payload.body.strip(),
    )

    # Send in-app notification to the other party
    if role == "employer":
        # Notify candidate
        cand_user = conn.execute(
            "SELECT user_id FROM candidates WHERE id=?", (conv["candidate_id"],)
        ).fetchone()
        if cand_user:
            conn.execute(
                """INSERT INTO notifications (id, tenant_id, recipient_user_id, title, body, link, read, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    new_id("notif"),
                    conv["tenant_id"],
                    cand_user["user_id"],
                    f"New message from {display_name}",
                    payload.body[:120],
                    f"/candidate/messages?conversation={conversation_id}",
                    0,
                    utc_now(),
                ),
            )
    else:
        # Notify employer hiring team members
        members = conn.execute(
            "SELECT user_id FROM memberships WHERE tenant_id=? AND role IN ('administrator', 'hiring_manager', 'recruiter')",
            (conv["tenant_id"],),
        ).fetchall()
        for m in members:
            conn.execute(
                """INSERT INTO notifications (id, tenant_id, recipient_user_id, title, body, link, read, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    new_id("notif"),
                    conv["tenant_id"],
                    m["user_id"],
                    f"Message from {display_name}",
                    payload.body[:120],
                    f"/messages?conversation={conversation_id}",
                    0,
                    utc_now(),
                ),
            )

    store.write_audit(
        conn,
        tenant_id=conv["tenant_id"],
        actor_user_id=user["id"],
        action="conversation.message_sent",
        resource_type="conversation_message",
        resource_id=msg["id"],
        new_state={"conversation_id": conversation_id, "body_preview": payload.body[:40]},
    )

    store.emit_event(
        conn,
        event_name="CONVERSATION_MESSAGE_SENT",
        tenant_id=conv["tenant_id"],
        actor_user_id=user["id"],
        correlation_id=correlation_id,
        resource_type="conversation",
        resource_id=conversation_id,
        payload={"message_id": msg["id"], "sender_role": role},
    )

    conn.commit()
    return {"message": msg}


@router.post("/conversations/{conversation_id}/read")
async def mark_conversation_read(
    conversation_id: str,
    conn: DbDependency,
    user: CurrentUserDependency,
) -> dict[str, Any]:
    conv = store.get_conversation(conn, conversation_id=conversation_id)
    if not conv:
        raise ApiError(status_code=404, code="not_found", message="Conversation not found.")

    _resolve_caller_role(conn, user, conv)
    marked = store.mark_messages_read(conn, conversation_id=conversation_id, reader_user_id=user["id"])
    conn.commit()
    return {"marked_read": marked}
