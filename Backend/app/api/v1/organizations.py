import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.dependencies import (
    CorrelationIdDependency,
    CurrentUserDependency,
    DbDependency,
    EmployerContextDependency,
    SettingsDependency,
    require_capability,
    require_superadmin,
)
from app.core.errors import ApiError
from app.db import store
from app.domain.permissions import CAP_MANAGE_ORG, CAP_VIEW_AUDIT
from app.services import mail_templates
from app.services.mail import send_staff_credentials
from app.services.passwords import hash_password

router = APIRouter(tags=["organizations"])

_EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
EmployerRole = Literal["administrator", "hiring_manager", "recruiter", "reviewer"]


class CreateOrganizationRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    org_type: Literal["university", "company"] = "university"
    idempotency_key: str = Field(min_length=1, max_length=128)


class OrganizationApplicationRequest(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    org_type: Literal["university", "company"] = "company"
    legal_name: str = Field(min_length=2, max_length=200)
    trading_name: str = Field(default="", max_length=200)
    domain: str = Field(min_length=3, max_length=200)
    contact_email: str = Field(min_length=3, max_length=320, pattern=_EMAIL)
    contact_phone: str = Field(min_length=5, max_length=40)
    address: str = Field(min_length=5, max_length=500)
    registration_number: str = Field(default="", max_length=100)
    idempotency_key: str = Field(min_length=1, max_length=128)


class RejectOrganizationRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class CreateStaffRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320, pattern=_EMAIL)
    display_name: str = Field(min_length=1, max_length=200)
    role: EmployerRole


class UpdateMemberRoleRequest(BaseModel):
    role: EmployerRole


def _normalize_domain(domain: str) -> str:
    value = domain.strip().lower()
    if value.startswith("http://") or value.startswith("https://"):
        value = value.split("://", 1)[1]
    value = value.split("/", 1)[0]
    if value.startswith("www."):
        value = value[4:]
    return value


def _email_domain(email: str) -> str:
    return email.strip().lower().rsplit("@", 1)[-1]


@router.post("/organizations", status_code=201)
async def create_organization(
    payload: CreateOrganizationRequest,
    conn: DbDependency,
    user: CurrentUserDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    """Legacy quick-create for verified orgs (admins/tests). Prefer /applications."""
    cached = store.find_idempotent_response(
        conn, key=payload.idempotency_key, tenant_id="global", operation="create_organization"
    )
    if cached:
        return cached

    org = store.create_organization(
        conn,
        name=payload.name,
        org_type=payload.org_type,
        creator_user_id=user["id"],
        verification_status="verified",
        create_membership=True,
    )
    store.write_audit(
        conn,
        tenant_id=org["id"],
        actor_user_id=user["id"],
        action="organization.created",
        resource_type="organization",
        resource_id=org["id"],
        new_state={"name": org["name"], "org_type": org["org_type"]},
    )
    store.emit_event(
        conn,
        event_name="ORGANIZATION_CREATED",
        tenant_id=org["id"],
        actor_user_id=user["id"],
        correlation_id=correlation_id,
        resource_type="organization",
        resource_id=org["id"],
        payload={"name": org["name"]},
    )
    body = {"organization": org}
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id="global",
        operation="create_organization",
        body=body,
    )
    conn.commit()
    return body


@router.post("/organizations/applications", status_code=201)
async def apply_organization(
    payload: OrganizationApplicationRequest,
    conn: DbDependency,
    user: CurrentUserDependency,
    settings: SettingsDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    cached = store.find_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=user["id"],
        operation="organization_application",
    )
    if cached:
        return cached

    domain = _normalize_domain(payload.domain)
    if not domain or "." not in domain:
        raise ApiError(
            status_code=422,
            code="invalid_domain",
            message="Provide a valid company domain such as example.com.",
        )
    if store.get_organization_by_domain(conn, domain):
        raise ApiError(
            status_code=409,
            code="domain_already_registered",
            message="An organization with this domain already exists.",
        )
    contact = payload.contact_email.strip().lower()
    if _email_domain(contact) != domain:
        raise ApiError(
            status_code=422,
            code="contact_email_domain_mismatch",
            message="Contact email must use the company domain.",
        )

    status = "pending"
    create_membership = False
    if settings.auto_verify_organizations and settings.environment.value == "development":
        status = "verified"
        create_membership = True

    org = store.create_organization(
        conn,
        name=payload.name,
        org_type=payload.org_type,
        creator_user_id=user["id"],
        verification_status=status,
        legal_name=payload.legal_name,
        trading_name=payload.trading_name or payload.name,
        domain=domain,
        contact_email=contact,
        contact_phone=payload.contact_phone,
        address=payload.address,
        registration_number=payload.registration_number,
        pending_owner_user_id=user["id"],
        create_membership=create_membership,
    )
    store.write_audit(
        conn,
        tenant_id=org["id"],
        actor_user_id=user["id"],
        action="organization.application_submitted",
        resource_type="organization",
        resource_id=org["id"],
        new_state={"name": org["name"], "domain": domain, "status": status},
    )
    store.emit_event(
        conn,
        event_name="ORGANIZATION_APPLICATION_SUBMITTED",
        tenant_id=org["id"],
        actor_user_id=user["id"],
        correlation_id=correlation_id,
        resource_type="organization",
        resource_id=org["id"],
        payload={"domain": domain, "status": status},
    )
    body = {"organization": org}
    store.save_idempotent_response(
        conn,
        key=payload.idempotency_key,
        tenant_id=user["id"],
        operation="organization_application",
        body=body,
    )
    conn.commit()
    return body


@router.get("/organizations/applications/mine")
async def my_organization_applications(
    conn: DbDependency, user: CurrentUserDependency
) -> dict[str, Any]:
    return {"applications": store.list_org_applications_for_user(conn, user["id"])}


@router.get("/admin/organizations/pending")
async def list_pending_organizations(
    conn: DbDependency, user: CurrentUserDependency
) -> dict[str, Any]:
    require_superadmin(user)
    return {"organizations": store.list_pending_organizations(conn)}


@router.post("/admin/organizations/{org_id}/verify")
async def verify_organization(
    org_id: str,
    conn: DbDependency,
    user: CurrentUserDependency,
    correlation_id: CorrelationIdDependency,
) -> dict[str, Any]:
    require_superadmin(user)
    org = store.get_organization(conn, org_id)
    if org is None:
        raise ApiError(status_code=404, code="not_found", message="Organization not found.")
    if org["verification_status"] == "verified":
        return {"organization": org}
    if org["verification_status"] == "rejected":
        raise ApiError(
            status_code=409,
            code="organization_rejected",
            message="This application was rejected and cannot be verified.",
        )
    updated = store.verify_organization(
        conn, org_id=org_id, verified_by_user_id=user["id"]
    )
    store.write_audit(
        conn,
        tenant_id=org_id,
        actor_user_id=user["id"],
        action="organization.verified",
        resource_type="organization",
        resource_id=org_id,
        old_state={"verification_status": "pending"},
        new_state={"verification_status": "verified"},
    )
    store.emit_event(
        conn,
        event_name="ORGANIZATION_VERIFIED",
        tenant_id=org_id,
        actor_user_id=user["id"],
        correlation_id=correlation_id,
        resource_type="organization",
        resource_id=org_id,
        payload={},
    )
    owner_id = updated.get("pending_owner_user_id")
    if owner_id:
        store.create_notification(
            conn,
            tenant_id=org_id,
            recipient_user_id=owner_id,
            title="Organization verified",
            body=f"{updated['name']} is verified. You can now invite staff and publish jobs.",
            link="/admin",
        )
    conn.commit()
    return {"organization": updated}


@router.post("/admin/organizations/{org_id}/reject")
async def reject_organization(
    org_id: str,
    payload: RejectOrganizationRequest,
    conn: DbDependency,
    user: CurrentUserDependency,
) -> dict[str, Any]:
    require_superadmin(user)
    org = store.get_organization(conn, org_id)
    if org is None:
        raise ApiError(status_code=404, code="not_found", message="Organization not found.")
    updated = store.reject_organization(
        conn,
        org_id=org_id,
        reason=payload.reason,
        verified_by_user_id=user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=org_id,
        actor_user_id=user["id"],
        action="organization.rejected",
        resource_type="organization",
        resource_id=org_id,
        reason=payload.reason,
        new_state={"verification_status": "rejected"},
    )
    conn.commit()
    return {"organization": updated}


@router.get("/organizations/current")
async def get_current_organization(
    conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    org = store.get_organization(conn, context.tenant_id)
    if org is None:
        raise ApiError(status_code=404, code="not_found", message="Organization not found.")
    return {
        "organization": org,
        "role": context.role,
        "units": store.list_units(conn, tenant_id=context.tenant_id),
    }


class CreateUnitRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_unit_id: str | None = None


@router.post("/organizations/current/units", status_code=201)
async def create_unit(
    payload: CreateUnitRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_capability(context, CAP_MANAGE_ORG)
    if payload.parent_unit_id is not None:
        parent = store.get_unit(
            conn, tenant_id=context.tenant_id, unit_id=payload.parent_unit_id
        )
        if parent is None:
            raise ApiError(
                status_code=422,
                code="invalid_parent_unit",
                message="The parent unit does not exist in this organization.",
            )
    unit = store.create_unit(
        conn,
        tenant_id=context.tenant_id,
        name=payload.name,
        parent_unit_id=payload.parent_unit_id,
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="unit.created",
        resource_type="unit",
        resource_id=unit["id"],
        new_state={"name": unit["name"], "parent_unit_id": unit["parent_unit_id"]},
    )
    conn.commit()
    return {"unit": unit}


@router.get("/organizations/current/members")
async def list_members(conn: DbDependency, context: EmployerContextDependency) -> dict[str, Any]:
    return {
        "members": store.list_members(conn, tenant_id=context.tenant_id),
        "invitations": store.list_organization_invitations(conn, tenant_id=context.tenant_id),
    }


@router.post("/organizations/current/members", status_code=201)
async def create_staff_member(
    payload: CreateStaffRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
    settings: SettingsDependency,
) -> dict[str, Any]:
    require_capability(context, CAP_MANAGE_ORG)
    org = store.get_organization(conn, context.tenant_id)
    assert org is not None
    email = payload.email.strip().lower()
    domain = (org.get("domain") or "").strip().lower()
    if domain and _email_domain(email) != domain:
        raise ApiError(
            status_code=422,
            code="staff_email_domain_mismatch",
            message=f"Staff accounts must use the @{domain} company email domain.",
        )

    existing = store.get_user_by_email(conn, email)
    temporary_password = secrets.token_urlsafe(10)
    if existing:
        if store.get_membership(
            conn, tenant_id=context.tenant_id, user_id=existing["id"]
        ):
            raise ApiError(
                status_code=409,
                code="member_already_exists",
                message=f"{existing['display_name']} is already a member of this organization.",
            )
        raise ApiError(
            status_code=409,
            code="email_already_registered",
            message=(
                "This email already belongs to a THOS account. "
                "Use a different company email for staff, or ask them to sign in."
            ),
        )

    member_user = store.create_user(
        conn,
        email=email,
        password_hash=hash_password(temporary_password),
        display_name=payload.display_name,
    )

    membership = store.add_member(
        conn, tenant_id=context.tenant_id, user_id=member_user["id"], role=payload.role
    )
    expires_at = (datetime.now(UTC) + timedelta(days=14)).isoformat()
    invitation = store.create_organization_invitation(
        conn,
        tenant_id=context.tenant_id,
        email=email,
        display_name=payload.display_name,
        role=payload.role,
        invited_by_user_id=context.user["id"],
        temp_password_hash=hash_password(temporary_password),
        expires_at=expires_at,
    )
    await send_staff_credentials(
        to_email=email,
        display_name=payload.display_name,
        organization_name=org["name"],
        role=payload.role,
        temporary_password=temporary_password,
        settings=settings,
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="membership.created",
        resource_type="membership",
        resource_id=membership["id"],
        new_state={"user_id": member_user["id"], "role": payload.role, "email": email},
    )
    store.create_notification(
        conn,
        tenant_id=context.tenant_id,
        recipient_user_id=member_user["id"],
        title="You were added to an organization",
        body=f"You now have the {payload.role.replace('_', ' ')} role at {org['name']}.",
        link="/",
    )
    conn.commit()
    return {
        "membership": membership,
        "invitation": {k: v for k, v in invitation.items() if k != "temp_password_hash"},
        "user": {
            "id": member_user["id"],
            "email": member_user["email"],
            "display_name": member_user["display_name"],
            "identity": member_user["identity"],
        },
    }


@router.post("/organizations/current/members/{membership_id}/roles")
async def update_member_role(
    membership_id: str,
    payload: UpdateMemberRoleRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_capability(context, CAP_MANAGE_ORG)
    updated = store.update_member_role(
        conn,
        tenant_id=context.tenant_id,
        membership_id=membership_id,
        role=payload.role,
    )
    if updated is None:
        raise ApiError(status_code=404, code="not_found", message="Member not found.")
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="membership.role_updated",
        resource_type="membership",
        resource_id=membership_id,
        new_state={"role": payload.role},
    )
    conn.commit()
    return {"membership": updated}


@router.get("/organizations/current/audit")
async def list_audit(conn: DbDependency, context: EmployerContextDependency) -> dict[str, Any]:
    require_capability(context, CAP_VIEW_AUDIT)
    records = store.list_audit_records(conn, tenant_id=context.tenant_id)
    users = {record["actor_user_id"] for record in records}
    names = {
        user_id: (store.get_user(conn, user_id) or {}).get("display_name", "Unknown")
        for user_id in users
    }
    for record in records:
        record["actor_name"] = names.get(record["actor_user_id"], "Unknown")
    return {"audit_records": records}


# --- email templates (stage progression / acceptance / rejection) ----------


class EmailTemplateUpdateRequest(BaseModel):
    subject: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=10, max_length=8000)


@router.get("/organizations/current/email-templates")
async def list_email_templates(
    conn: DbDependency, context: EmployerContextDependency
) -> dict[str, Any]:
    """Effective templates: tenant overrides merged over the predefined defaults."""
    require_capability(context, CAP_MANAGE_ORG)
    return {
        "templates": mail_templates.resolve_templates(conn, tenant_id=context.tenant_id),
        "placeholders": [
            "{candidate_name}",
            "{job_title}",
            "{organization_name}",
            "{stage_label}",
            "{status}",
            "{decision}",
            "{message}",
            "{applications_url}",
        ],
    }


@router.put("/organizations/current/email-templates/{template_key}")
async def update_email_template(
    template_key: str,
    payload: EmailTemplateUpdateRequest,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    require_capability(context, CAP_MANAGE_ORG)
    if template_key not in mail_templates.TEMPLATE_KEYS:
        raise ApiError(
            status_code=404,
            code="unknown_template",
            message=(
                "Unknown email template. Choose from: "
                + ", ".join(mail_templates.TEMPLATE_KEYS)
            ),
        )
    record = store.upsert_email_template(
        conn,
        tenant_id=context.tenant_id,
        template_key=template_key,
        subject=payload.subject,
        body=payload.body,
        updated_by=context.user["id"],
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="email_template.updated",
        resource_type="email_template",
        resource_id=template_key,
        new_state={"subject": payload.subject},
    )
    conn.commit()
    return {"template": record}


@router.delete("/organizations/current/email-templates/{template_key}")
async def reset_email_template(
    template_key: str,
    conn: DbDependency,
    context: EmployerContextDependency,
) -> dict[str, Any]:
    """Remove the tenant override so the predefined content is used again."""
    require_capability(context, CAP_MANAGE_ORG)
    if template_key not in mail_templates.TEMPLATE_KEYS:
        raise ApiError(
            status_code=404,
            code="unknown_template",
            message="Unknown email template.",
        )
    conn.execute(
        "DELETE FROM email_templates WHERE tenant_id=? AND template_key=?",
        (context.tenant_id, template_key),
    )
    store.write_audit(
        conn,
        tenant_id=context.tenant_id,
        actor_user_id=context.user["id"],
        action="email_template.reset",
        resource_type="email_template",
        resource_id=template_key,
    )
    conn.commit()
    default = mail_templates.DEFAULT_TEMPLATES[template_key]
    return {"template": {"template_key": template_key, **default, "is_custom": False}}
