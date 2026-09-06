"""Tenant-editable email templates for stage progression updates.

Every pipeline stage change emails the candidate. Content is predefined
per template key (stage_update / acceptance / rejection) and can be
customized per organization from the admin panel; unresolved placeholders
are left untouched so partial templates never crash rendering.
"""

from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.db import store
from app.db.database import Connection
from app.services.mail import OutboundMessage, get_mail_adapter

TEMPLATE_STAGE_UPDATE = "stage_update"
TEMPLATE_ACCEPTANCE = "acceptance"
TEMPLATE_REJECTION = "rejection"

TEMPLATE_KEYS = (TEMPLATE_STAGE_UPDATE, TEMPLATE_ACCEPTANCE, TEMPLATE_REJECTION)

TEMPLATE_LABELS = {
    TEMPLATE_STAGE_UPDATE: "Stage progression update",
    TEMPLATE_ACCEPTANCE: "Acceptance (hired / selected)",
    TEMPLATE_REJECTION: "Rejection",
}

# Placeholders available in subject and body:
#   {candidate_name} {job_title} {organization_name} {stage_label}
#   {status} {decision} {message} {applications_url}
DEFAULT_TEMPLATES: dict[str, dict[str, str]] = {
    TEMPLATE_STAGE_UPDATE: {
        "subject": "Application update: {job_title} at {organization_name}",
        "body": (
            "Hello {candidate_name},\n\n"
            "Your application for {job_title} at {organization_name} has moved "
            "to the next stage: {stage_label}.\n\n"
            "Current status: {status}.\n\n"
            "You can follow your application progress here: {applications_url}\n\n"
            "Best regards,\nThe {organization_name} Team"
        ),
    },
    TEMPLATE_ACCEPTANCE: {
        "subject": "Great news: {job_title} at {organization_name}",
        "body": (
            "Hello {candidate_name},\n\n"
            "Congratulations! We are pleased to let you know that your application "
            "for {job_title} at {organization_name} was successful.\n\n"
            "{message}\n\n"
            "Best regards,\nThe {organization_name} Team"
        ),
    },
    TEMPLATE_REJECTION: {
        "subject": "Update on your application: {job_title} at {organization_name}",
        "body": (
            "Hello {candidate_name},\n\n"
            "Thank you for the time you invested in your application for "
            "{job_title} at {organization_name}.\n\n"
            "After careful consideration we will not be moving forward with your "
            "application at this time.\n\n"
            "{message}\n\n"
            "We wish you the best in your search.\n\n"
            "Best regards,\nThe {organization_name} Team"
        ),
    },
}


class _SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render(template_text: str, context: dict[str, Any]) -> str:
    """Render {placeholders}; unknown keys are preserved literally."""
    safe = _SafeDict({key: ("" if value is None else str(value)) for key, value in context.items()})
    try:
        return template_text.format_map(safe)
    except (ValueError, IndexError, KeyError):
        # Malformed braces in a custom template: return text as stored.
        return template_text


def resolve_templates(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    """All known template keys merged with this tenant's saved overrides."""
    overrides = {
        row["template_key"]: row for row in store.list_email_templates(conn, tenant_id=tenant_id)
    }
    resolved: list[dict[str, Any]] = []
    for key in TEMPLATE_KEYS:
        row = overrides.get(key)
        default = DEFAULT_TEMPLATES[key]
        resolved.append(
            {
                "template_key": key,
                "label": TEMPLATE_LABELS[key],
                "subject": row["subject"] if row else default["subject"],
                "body": row["body"] if row else default["body"],
                "is_custom": row is not None,
                "default_subject": default["subject"],
                "default_body": default["body"],
                "updated_at": row["updated_at"] if row else None,
            }
        )
    return resolved


def get_template(conn: Connection, *, tenant_id: str, template_key: str) -> dict[str, str]:
    """Effective (subject, body) for one key — tenant override or default."""
    row = store.get_email_template(conn, tenant_id=tenant_id, template_key=template_key)
    if row:
        return {"subject": row["subject"], "body": row["body"]}
    return DEFAULT_TEMPLATES[template_key]


async def send_templated_email(
    conn: Connection,
    *,
    tenant_id: str,
    template_key: str,
    to_email: str,
    context: dict[str, Any],
    settings: Settings | None = None,
) -> None:
    """Render the tenant's template and send it through the mail adapter."""
    template = get_template(conn, tenant_id=tenant_id, template_key=template_key)
    adapter = get_mail_adapter(settings)
    await adapter.send(
        OutboundMessage(
            to_email=to_email,
            subject=render(template["subject"], context),
            body=render(template["body"], context),
        )
    )
