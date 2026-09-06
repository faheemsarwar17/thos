"""Tenant-scoped persistence helpers.

Every employer-side query takes an explicit tenant_id; candidate
self-service queries are scoped by candidate ownership. Audit records,
outbox events, and idempotency records are written in the same
transaction as the mutation they describe.
"""

from typing import Any

from app.core.ids import new_id
from app.db.database import Connection, from_json, to_json, utc_now

# --- users ---------------------------------------------------------------


def identity_from_email(email: str) -> str:
    local = email.strip().lower().split("@", 1)[0]
    slug = "".join(ch if ch.isalnum() else "-" for ch in local).strip("-")
    return (slug or "user")[:64]


def get_or_create_user(conn: Connection, identity: str) -> dict[str, Any]:
    """Dev-header helper: find or create a passwordless active user."""
    row = conn.execute("SELECT * FROM users WHERE identity = ?", (identity,)).fetchone()
    if row:
        return dict(row)
    email = f"{identity}@example.test"
    existing_email = get_user_by_email(conn, email)
    if existing_email:
        return existing_email
    user = {
        "id": new_id("usr"),
        "identity": identity,
        "display_name": identity.replace("-", " ").replace("_", " ").title(),
        "email": email,
        "password_hash": None,
        "status": "active",
        "email_verified_at": None,
        "is_superadmin": 0,
        "created_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO users
           (id, identity, display_name, email, password_hash, status,
            email_verified_at, is_superadmin, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            user["id"],
            user["identity"],
            user["display_name"],
            user["email"],
            user["password_hash"],
            user["status"],
            user["email_verified_at"],
            user["is_superadmin"],
            user["created_at"],
        ),
    )
    conn.commit()
    return user


def create_user(
    conn: Connection,
    *,
    email: str,
    password_hash: str,
    display_name: str,
    is_superadmin: bool = False,
) -> dict[str, Any]:
    normalized = email.strip().lower()
    identity = identity_from_email(normalized)
    # Ensure unique identity if collision
    base = identity
    suffix = 1
    while get_user_by_identity(conn, identity):
        identity = f"{base}-{suffix}"[:64]
        suffix += 1
    user = {
        "id": new_id("usr"),
        "identity": identity,
        "display_name": display_name.strip(),
        "email": normalized,
        "password_hash": password_hash,
        "status": "active",
        "email_verified_at": utc_now(),
        "is_superadmin": 1 if is_superadmin else 0,
        "created_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO users
           (id, identity, display_name, email, password_hash, status,
            email_verified_at, is_superadmin, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (
            user["id"],
            user["identity"],
            user["display_name"],
            user["email"],
            user["password_hash"],
            user["status"],
            user["email_verified_at"],
            user["is_superadmin"],
            user["created_at"],
        ),
    )
    return user


def get_user(conn: Connection, user_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_identity(conn: Connection, identity: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM users WHERE identity = ?", (identity,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(conn: Connection, email: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM users WHERE lower(email) = ?", (email.strip().lower(),)
    ).fetchone()
    return dict(row) if row else None


def set_user_password(conn: Connection, *, user_id: str, password_hash: str) -> None:
    conn.execute(
        "UPDATE users SET password_hash=? WHERE id=?",
        (password_hash, user_id),
    )


def user_has_employer_membership(conn: Connection, user_id: str) -> bool:
    row = conn.execute(
        """SELECT 1 FROM memberships m
           JOIN organizations o ON o.id = m.tenant_id
           WHERE m.user_id=? AND m.status='active'
             AND o.verification_status='verified' LIMIT 1""",
        (user_id,),
    ).fetchone()
    return row is not None


def set_user_avatar(conn: Connection, *, user_id: str, avatar_path: str | None) -> None:
    """Set or clear the user's profile photo (PFP) storage path."""
    conn.execute(
        "UPDATE users SET avatar_path=? WHERE id=?",
        (avatar_path, user_id),
    )


# --- refresh tokens ------------------------------------------------------


def create_refresh_token(
    conn: Connection,
    *,
    user_id: str,
    token_hash: str,
    expires_at: str,
) -> dict[str, Any]:
    record = {
        "id": new_id("rtk"),
        "user_id": user_id,
        "token_hash": token_hash,
        "expires_at": expires_at,
        "revoked_at": None,
        "replaced_by": None,
        "created_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO refresh_tokens
           (id, user_id, token_hash, expires_at, revoked_at, replaced_by, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (
            record["id"],
            record["user_id"],
            record["token_hash"],
            record["expires_at"],
            record["revoked_at"],
            record["replaced_by"],
            record["created_at"],
        ),
    )
    return record


def get_refresh_token_by_hash(conn: Connection, token_hash: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM refresh_tokens WHERE token_hash=?", (token_hash,)
    ).fetchone()
    return dict(row) if row else None


def revoke_refresh_token(
    conn: Connection, *, token_id: str, replaced_by: str | None = None
) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at=?, replaced_by=? WHERE id=?",
        (utc_now(), replaced_by, token_id),
    )


def revoke_all_refresh_tokens_for_user(conn: Connection, user_id: str) -> None:
    conn.execute(
        "UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
        (utc_now(), user_id),
    )


# --- audit / events / idempotency / notifications ------------------------


def write_audit(
    conn: Connection,
    *,
    tenant_id: str,
    actor_user_id: str,
    action: str,
    resource_type: str,
    resource_id: str,
    old_state: Any = None,
    new_state: Any = None,
    reason: str = "",
) -> None:
    conn.execute(
        """INSERT INTO audit_records
           (id, tenant_id, actor_user_id, action, resource_type, resource_id,
            old_state, new_state, reason, occurred_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            new_id("aud"),
            tenant_id,
            actor_user_id,
            action,
            resource_type,
            resource_id,
            to_json(old_state) if old_state is not None else None,
            to_json(new_state) if new_state is not None else None,
            reason,
            utc_now(),
        ),
    )


def emit_event(
    conn: Connection,
    *,
    event_name: str,
    tenant_id: str,
    actor_user_id: str,
    correlation_id: str,
    resource_type: str,
    resource_id: str,
    payload: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """INSERT INTO outbox_events
           (id, event_name, event_version, tenant_id, actor_user_id, correlation_id,
            resource_type, resource_id, payload, occurred_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (
            new_id("evt"),
            event_name,
            1,
            tenant_id,
            actor_user_id,
            correlation_id,
            resource_type,
            resource_id,
            to_json(payload or {}),
            utc_now(),
        ),
    )


def find_idempotent_response(
    conn: Connection, *, key: str, tenant_id: str, operation: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT response_body FROM idempotency_records WHERE key=? AND tenant_id=? AND operation=?",
        (key, tenant_id, operation),
    ).fetchone()
    return from_json(row["response_body"]) if row else None


def save_idempotent_response(
    conn: Connection, *, key: str, tenant_id: str, operation: str, body: dict[str, Any]
) -> None:
    conn.execute(
        """INSERT INTO idempotency_records
           (key, tenant_id, operation, response_body, created_at) VALUES (?,?,?,?,?)
           ON CONFLICT DO NOTHING""",
        (key, tenant_id, operation, to_json(body), utc_now()),
    )


def create_notification(
    conn: Connection,
    *,
    tenant_id: str,
    recipient_user_id: str,
    title: str,
    body: str,
    link: str = "",
) -> None:
    conn.execute(
        """INSERT INTO notifications
           (id, tenant_id, recipient_user_id, title, body, link, read, created_at)
           VALUES (?,?,?,?,?,?,0,?)""",
        (new_id("ntf"), tenant_id, recipient_user_id, title, body, link, utc_now()),
    )


def list_notifications(conn: Connection, *, user_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM notifications WHERE recipient_user_id=? ORDER BY created_at DESC LIMIT 50",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


# --- organizations / units / memberships ----------------------------------


def create_organization(
    conn: Connection,
    *,
    name: str,
    org_type: str,
    creator_user_id: str,
    verification_status: str = "verified",
    legal_name: str = "",
    trading_name: str = "",
    domain: str = "",
    contact_email: str = "",
    contact_phone: str = "",
    address: str = "",
    registration_number: str = "",
    pending_owner_user_id: str | None = None,
    create_membership: bool = True,
) -> dict[str, Any]:
    org = {
        "id": new_id("org"),
        "name": name,
        "org_type": org_type,
        "verification_status": verification_status,
        "legal_name": legal_name or name,
        "trading_name": trading_name or name,
        "domain": domain.strip().lower(),
        "contact_email": contact_email.strip().lower(),
        "contact_phone": contact_phone,
        "address": address,
        "registration_number": registration_number,
        "pending_owner_user_id": pending_owner_user_id,
        "verified_at": utc_now() if verification_status == "verified" else None,
        "verified_by_user_id": None,
        "rejection_reason": "",
        "created_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO organizations
           (id, name, org_type, verification_status, legal_name, trading_name, domain,
            contact_email, contact_phone, address, registration_number,
            pending_owner_user_id, verified_at, verified_by_user_id, rejection_reason,
            created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            org["id"],
            org["name"],
            org["org_type"],
            org["verification_status"],
            org["legal_name"],
            org["trading_name"],
            org["domain"],
            org["contact_email"],
            org["contact_phone"],
            org["address"],
            org["registration_number"],
            org["pending_owner_user_id"],
            org["verified_at"],
            org["verified_by_user_id"],
            org["rejection_reason"],
            org["created_at"],
        ),
    )
    if create_membership and verification_status == "verified":
        conn.execute(
            """INSERT INTO memberships
               (id, tenant_id, user_id, role, unit_scope_ids, status, created_at)
               VALUES (?,?,?,?,?,?,?)""",
            (
                new_id("mem"),
                org["id"],
                creator_user_id,
                "administrator",
                "[]",
                "active",
                utc_now(),
            ),
        )
    return org


def get_organization(conn: Connection, org_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM organizations WHERE id = ?", (org_id,)).fetchone()
    return dict(row) if row else None


def list_pending_organizations(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT * FROM organizations
           WHERE verification_status='pending' ORDER BY created_at"""
    ).fetchall()
    return [dict(row) for row in rows]


def list_org_applications_for_user(conn: Connection, user_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT * FROM organizations
           WHERE pending_owner_user_id=? ORDER BY created_at DESC""",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_organization_by_domain(conn: Connection, domain: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM organizations WHERE lower(domain)=? LIMIT 1",
        (domain.strip().lower(),),
    ).fetchone()
    return dict(row) if row else None


def verify_organization(
    conn: Connection,
    *,
    org_id: str,
    verified_by_user_id: str,
) -> dict[str, Any]:
    now = utc_now()
    conn.execute(
        """UPDATE organizations
           SET verification_status='verified', verified_at=?, verified_by_user_id=?,
               rejection_reason=''
           WHERE id=?""",
        (now, verified_by_user_id, org_id),
    )
    org = get_organization(conn, org_id)
    assert org is not None
    owner_id = org.get("pending_owner_user_id")
    if owner_id and not get_membership(conn, tenant_id=org_id, user_id=owner_id):
        add_member(conn, tenant_id=org_id, user_id=owner_id, role="administrator")
    return org


def reject_organization(
    conn: Connection, *, org_id: str, reason: str, verified_by_user_id: str
) -> dict[str, Any]:
    conn.execute(
        """UPDATE organizations
           SET verification_status='rejected', rejection_reason=?,
               verified_by_user_id=?, verified_at=?
           WHERE id=?""",
        (reason, verified_by_user_id, utc_now(), org_id),
    )
    org = get_organization(conn, org_id)
    assert org is not None
    return org


def list_memberships_for_user(conn: Connection, user_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT m.*, o.name AS organization_name, o.verification_status,
                  o.domain AS organization_domain
           FROM memberships m
           JOIN organizations o ON o.id = m.tenant_id
           WHERE m.user_id = ? AND m.status = 'active'
             AND o.verification_status = 'verified'
           ORDER BY m.created_at""",
        (user_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_membership(
    conn: Connection, *, tenant_id: str, user_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM memberships WHERE tenant_id=? AND user_id=? AND status='active'",
        (tenant_id, user_id),
    ).fetchone()
    return dict(row) if row else None


def list_members(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT m.id, m.role, m.status, m.created_at, u.id AS user_id,
                  u.display_name, u.email, u.identity
           FROM memberships m JOIN users u ON u.id = m.user_id
           WHERE m.tenant_id = ? ORDER BY m.created_at""",
        (tenant_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def add_member(
    conn: Connection, *, tenant_id: str, user_id: str, role: str
) -> dict[str, Any]:
    membership = {
        "id": new_id("mem"),
        "tenant_id": tenant_id,
        "user_id": user_id,
        "role": role,
        "unit_scope_ids": "[]",
        "status": "active",
        "created_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO memberships
           (id, tenant_id, user_id, role, unit_scope_ids, status, created_at)
           VALUES (?,?,?,?,?,?,?)""",
        tuple(membership.values()),
    )
    return membership


def update_member_role(
    conn: Connection, *, tenant_id: str, membership_id: str, role: str
) -> dict[str, Any] | None:
    conn.execute(
        "UPDATE memberships SET role=? WHERE id=? AND tenant_id=?",
        (role, membership_id, tenant_id),
    )
    row = conn.execute(
        "SELECT * FROM memberships WHERE id=? AND tenant_id=?",
        (membership_id, tenant_id),
    ).fetchone()
    return dict(row) if row else None


def create_organization_invitation(
    conn: Connection,
    *,
    tenant_id: str,
    email: str,
    display_name: str,
    role: str,
    invited_by_user_id: str,
    temp_password_hash: str,
    expires_at: str,
) -> dict[str, Any]:
    invitation = {
        "id": new_id("inv"),
        "tenant_id": tenant_id,
        "email": email.strip().lower(),
        "display_name": display_name,
        "role": role,
        "invited_by_user_id": invited_by_user_id,
        "status": "pending",
        "temp_password_hash": temp_password_hash,
        "expires_at": expires_at,
        "accepted_at": None,
        "created_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO organization_invitations
           (id, tenant_id, email, display_name, role, invited_by_user_id, status,
            temp_password_hash, expires_at, accepted_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (
            invitation["id"],
            invitation["tenant_id"],
            invitation["email"],
            invitation["display_name"],
            invitation["role"],
            invitation["invited_by_user_id"],
            invitation["status"],
            invitation["temp_password_hash"],
            invitation["expires_at"],
            invitation["accepted_at"],
            invitation["created_at"],
        ),
    )
    return invitation


def list_organization_invitations(
    conn: Connection, *, tenant_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT id, tenant_id, email, display_name, role, status, expires_at, created_at
           FROM organization_invitations WHERE tenant_id=? ORDER BY created_at DESC""",
        (tenant_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def create_unit(
    conn: Connection, *, tenant_id: str, name: str, parent_unit_id: str | None
) -> dict[str, Any]:
    unit = {
        "id": new_id("unt"),
        "tenant_id": tenant_id,
        "parent_unit_id": parent_unit_id,
        "name": name,
        "created_at": utc_now(),
    }
    conn.execute(
        "INSERT INTO units (id, tenant_id, parent_unit_id, name, created_at) VALUES (?,?,?,?,?)",
        tuple(unit.values()),
    )
    return unit


def list_units(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM units WHERE tenant_id=? ORDER BY created_at", (tenant_id,)
    ).fetchall()
    return [dict(row) for row in rows]


def get_unit(conn: Connection, *, tenant_id: str, unit_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM units WHERE tenant_id=? AND id=?", (tenant_id, unit_id)
    ).fetchone()
    return dict(row) if row else None


def list_audit_records(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM audit_records WHERE tenant_id=? ORDER BY occurred_at DESC LIMIT 100",
        (tenant_id,),
    ).fetchall()
    records = []
    for row in rows:
        record = dict(row)
        record["old_state"] = from_json(record["old_state"])
        record["new_state"] = from_json(record["new_state"])
        records.append(record)
    return records


# --- domain packs ----------------------------------------------------------


def activate_pack(
    conn: Connection,
    *,
    tenant_id: str,
    manifest: dict[str, Any],
    actor_user_id: str,
) -> dict[str, Any]:
    activation = {
        "id": new_id("dpa"),
        "tenant_id": tenant_id,
        "pack_id": manifest["pack_id"],
        "pack_version": manifest["pack_version"],
        "manifest": to_json(manifest),
        "activated_by": actor_user_id,
        "activated_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO domain_pack_activations
           (id, tenant_id, pack_id, pack_version, manifest, activated_by, activated_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT (tenant_id, pack_id) DO UPDATE SET
             pack_version=excluded.pack_version, manifest=excluded.manifest,
             activated_by=excluded.activated_by, activated_at=excluded.activated_at""",
        tuple(activation.values()),
    )
    return activation


def get_active_pack(conn: Connection, *, tenant_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """SELECT * FROM domain_pack_activations WHERE tenant_id=?
           ORDER BY activated_at DESC LIMIT 1""",
        (tenant_id,),
    ).fetchone()
    if not row:
        return None
    activation = dict(row)
    activation["manifest"] = from_json(activation["manifest"])
    return activation


def create_tenant_pack(
    conn: Connection,
    *,
    tenant_id: str,
    manifest: dict[str, Any],
    actor_user_id: str,
) -> dict[str, Any]:
    now = utc_now()
    record = {
        "id": new_id("tdp"),
        "tenant_id": tenant_id,
        "pack_id": manifest["pack_id"],
        "pack_version": manifest["pack_version"],
        "manifest": to_json(manifest),
        "created_by": actor_user_id,
        "created_at": now,
        "updated_at": now,
    }
    conn.execute(
        """INSERT INTO tenant_domain_packs
           (id, tenant_id, pack_id, pack_version, manifest, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        tuple(record.values()),
    )
    return {
        "id": record["id"],
        "tenant_id": tenant_id,
        "pack_id": manifest["pack_id"],
        "pack_version": manifest["pack_version"],
        "manifest": manifest,
        "created_by": actor_user_id,
        "created_at": now,
        "updated_at": now,
        "source": "custom",
    }


def list_tenant_packs(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT * FROM tenant_domain_packs WHERE tenant_id=?
           ORDER BY created_at DESC""",
        (tenant_id,),
    ).fetchall()
    packs = []
    for row in rows:
        record = dict(row)
        record["manifest"] = from_json(record["manifest"])
        record["source"] = "custom"
        packs.append(record)
    return packs


def get_tenant_pack(
    conn: Connection, *, tenant_id: str, pack_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM tenant_domain_packs WHERE tenant_id=? AND pack_id=?",
        (tenant_id, pack_id),
    ).fetchone()
    if not row:
        return None
    record = dict(row)
    record["manifest"] = from_json(record["manifest"])
    record["source"] = "custom"
    return record


def update_tenant_pack(
    conn: Connection,
    *,
    tenant_id: str,
    pack_id: str,
    manifest: dict[str, Any],
) -> dict[str, Any] | None:
    existing = get_tenant_pack(conn, tenant_id=tenant_id, pack_id=pack_id)
    if existing is None:
        return None
    now = utc_now()
    conn.execute(
        """UPDATE tenant_domain_packs
           SET pack_version=?, manifest=?, updated_at=?
           WHERE tenant_id=? AND pack_id=?""",
        (manifest["pack_version"], to_json(manifest), now, tenant_id, pack_id),
    )
    return get_tenant_pack(conn, tenant_id=tenant_id, pack_id=pack_id)


def delete_tenant_pack(conn: Connection, *, tenant_id: str, pack_id: str) -> bool:
    cursor = conn.execute(
        "DELETE FROM tenant_domain_packs WHERE tenant_id=? AND pack_id=?",
        (tenant_id, pack_id),
    )
    return cursor.rowcount == 1


def count_postings_for_pack(conn: Connection, *, tenant_id: str, pack_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM postings WHERE tenant_id=? AND pack_id=?",
        (tenant_id, pack_id),
    ).fetchone()
    return int(row["c"] if row else 0)


# --- workflows ---------------------------------------------------------------


def create_workflow_version(
    conn: Connection,
    *,
    tenant_id: str,
    template_name: str,
    stages: list[dict[str, Any]],
    mapping: dict[str, str],
    actor_user_id: str,
    status: str = "draft",
) -> dict[str, Any]:
    row = conn.execute(
        """SELECT COALESCE(MAX(version), 0) AS v FROM workflow_versions
           WHERE tenant_id=? AND template_name=?""",
        (tenant_id, template_name),
    ).fetchone()
    now = utc_now()
    workflow = {
        "id": new_id("wfv"),
        "tenant_id": tenant_id,
        "template_name": template_name,
        "version": row["v"] + 1,
        "status": status,
        "stages": to_json(stages),
        "candidate_status_mapping": to_json(mapping),
        "created_by": actor_user_id,
        "created_at": now,
        "published_at": now if status == "published" else None,
    }
    conn.execute(
        """INSERT INTO workflow_versions
           (id, tenant_id, template_name, version, status, stages, candidate_status_mapping,
            created_by, created_at, published_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        tuple(workflow.values()),
    )
    return _workflow_row_to_dict(workflow)


def _workflow_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    workflow = dict(row)
    if isinstance(workflow["stages"], str):
        workflow["stages"] = from_json(workflow["stages"])
    if isinstance(workflow["candidate_status_mapping"], str):
        workflow["candidate_status_mapping"] = from_json(workflow["candidate_status_mapping"])
    return workflow


def get_workflow_version(
    conn: Connection, *, tenant_id: str, workflow_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM workflow_versions WHERE tenant_id=? AND id=?", (tenant_id, workflow_id)
    ).fetchone()
    return _workflow_row_to_dict(dict(row)) if row else None


def list_workflow_versions(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM workflow_versions WHERE tenant_id=? ORDER BY created_at DESC",
        (tenant_id,),
    ).fetchall()
    return [_workflow_row_to_dict(dict(row)) for row in rows]


def get_company_workflow(conn: Connection, *, tenant_id: str) -> dict[str, Any] | None:
    """One hiring workflow per company — the latest non-archived company template."""
    row = conn.execute(
        """SELECT * FROM workflow_versions
           WHERE tenant_id=? AND template_name='company' AND status!='archived'
           ORDER BY version DESC LIMIT 1""",
        (tenant_id,),
    ).fetchone()
    if row:
        return _workflow_row_to_dict(dict(row))
    # Legacy fallback: latest published, else latest any non-archived
    row = conn.execute(
        """SELECT * FROM workflow_versions
           WHERE tenant_id=? AND status='published'
           ORDER BY published_at DESC LIMIT 1""",
        (tenant_id,),
    ).fetchone()
    if row:
        return _workflow_row_to_dict(dict(row))
    row = conn.execute(
        """SELECT * FROM workflow_versions
           WHERE tenant_id=? AND status!='archived'
           ORDER BY created_at DESC LIMIT 1""",
        (tenant_id,),
    ).fetchone()
    return _workflow_row_to_dict(dict(row)) if row else None


def get_or_create_company_workflow(
    conn: Connection,
    *,
    tenant_id: str,
    actor_user_id: str,
    stages: list[dict[str, Any]] | None = None,
    mapping: dict[str, str] | None = None,
) -> dict[str, Any]:
    existing = get_company_workflow(conn, tenant_id=tenant_id)
    if existing is not None:
        return existing
    from app.domain import stages as stage_domain

    stage_dicts = stages or stage_domain.default_stage_dicts()
    resolved_mapping = mapping or {
        stage["id"]: stage_domain.CANDIDATE_STATUS_BY_CATEGORY.get(stage["category"], "Decision")
        for stage in stage_dicts
    }
    return create_workflow_version(
        conn,
        tenant_id=tenant_id,
        template_name="company",
        stages=stage_dicts,
        mapping=resolved_mapping,
        actor_user_id=actor_user_id,
        status="published",
    )


def update_company_workflow(
    conn: Connection,
    *,
    tenant_id: str,
    stages: list[dict[str, Any]],
    mapping: dict[str, str],
    actor_user_id: str,
) -> dict[str, Any]:
    """Replace the company workflow; prior versions are archived (jobs keep their snapshot)."""
    current = get_company_workflow(conn, tenant_id=tenant_id)
    conn.execute(
        """UPDATE workflow_versions SET status='archived'
           WHERE tenant_id=? AND status!='archived'""",
        (tenant_id,),
    )
    if current is None:
        return create_workflow_version(
            conn,
            tenant_id=tenant_id,
            template_name="company",
            stages=stages,
            mapping=mapping,
            actor_user_id=actor_user_id,
            status="published",
        )
    return create_workflow_version(
        conn,
        tenant_id=tenant_id,
        template_name="company",
        stages=stages,
        mapping=mapping,
        actor_user_id=actor_user_id,
        status="published",
    )


def get_published_workflow(conn: Connection, *, tenant_id: str) -> dict[str, Any] | None:
    return get_company_workflow(conn, tenant_id=tenant_id)


def publish_workflow(conn: Connection, *, tenant_id: str, workflow_id: str) -> None:
    conn.execute(
        """UPDATE workflow_versions SET status='published', published_at=?
           WHERE tenant_id=? AND id=?""",
        (utc_now(), tenant_id, workflow_id),
    )


def update_draft_workflow(
    conn: Connection,
    *,
    tenant_id: str,
    workflow_id: str,
    stages: list[dict[str, Any]],
    mapping: dict[str, str],
    template_name: str | None = None,
) -> dict[str, Any] | None:
    workflow = get_workflow_version(conn, tenant_id=tenant_id, workflow_id=workflow_id)
    if workflow is None:
        return None
    if workflow["status"] != "draft":
        return None
    name = template_name if template_name is not None else workflow["template_name"]
    conn.execute(
        """UPDATE workflow_versions
           SET template_name=?, stages=?, candidate_status_mapping=?
           WHERE tenant_id=? AND id=? AND status='draft'""",
        (name, to_json(stages), to_json(mapping), tenant_id, workflow_id),
    )
    return get_workflow_version(conn, tenant_id=tenant_id, workflow_id=workflow_id)


def search_workspace(
    conn: Connection, *, tenant_id: str, query: str, limit: int = 20
) -> dict[str, list[dict[str, Any]]]:
    needle = f"%{query.strip().lower()}%"
    postings = [
        dict(row)
        for row in conn.execute(
            """SELECT id, title, status, location, employment_type
               FROM postings
               WHERE tenant_id=? AND (
                 lower(title) LIKE ? OR lower(coalesce(description,'')) LIKE ?
                 OR lower(coalesce(location,'')) LIKE ?
               )
               ORDER BY created_at DESC
               LIMIT ?""",
            (tenant_id, needle, needle, needle, limit),
        ).fetchall()
    ]
    applications = [
        dict(row)
        for row in conn.execute(
            """SELECT a.id, a.posting_id, a.stage_id, a.stage_category,
                      p.title AS job_title,
                      u.display_name AS candidate_name,
                      u.email AS candidate_email
               FROM applications a
               JOIN postings p ON p.id = a.posting_id
               JOIN candidates c ON c.id = a.candidate_id
               JOIN users u ON u.id = c.user_id
               WHERE a.tenant_id=? AND (
                 lower(u.display_name) LIKE ? OR lower(u.email) LIKE ?
                 OR lower(p.title) LIKE ? OR lower(a.stage_id) LIKE ?
               )
               ORDER BY a.updated_at DESC
               LIMIT ?""",
            (tenant_id, needle, needle, needle, needle, limit),
        ).fetchall()
    ]
    return {"postings": postings, "applications": applications}


def search_talent(
    conn: Connection,
    *,
    tenant_id: str,
    query: str = "",
    pack_id: str | None = None,
    min_score: float | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Talent Discovery for a tenant.

    Returns candidates who either applied to this tenant's jobs or granted
    discovery consent. Scoring and explanations are computed in Python so the
    query stays portable across SQLite and PostgreSQL.
    """
    rows = conn.execute(
        """SELECT c.id AS candidate_id, u.display_name, u.email,
                  c.profile, c.consents, c.target_domains,
                  (
                    SELECT COUNT(*) FROM applications a
                    WHERE a.tenant_id = ? AND a.candidate_id = c.id
                  ) AS application_count
           FROM candidates c
           JOIN users u ON u.id = c.user_id""",
        (tenant_id,),
    ).fetchall()

    needle = query.strip().lower()
    results: list[dict[str, Any]] = []
    for row in rows:
        record = dict(row)
        profile = (
            from_json(record["profile"])
            if isinstance(record["profile"], str)
            else record["profile"]
        )
        consents = (
            from_json(record["consents"])
            if isinstance(record["consents"], str)
            else (record["consents"] or {})
        )
        domains = (
            from_json(record["target_domains"])
            if isinstance(record.get("target_domains"), str)
            else (record.get("target_domains") or [])
        )
        applied = int(record.get("application_count") or 0) > 0
        discovery = bool(consents.get("discovery"))
        if not applied and not discovery:
            continue

        attempts = list_profile_attempts(conn, candidate_id=record["candidate_id"])
        evaluated = [
            attempt
            for attempt in attempts
            if attempt["status"] == "evaluated" and attempt.get("evaluation")
            and (pack_id is None or attempt["pack_id"] == pack_id)
        ]
        best = max(
            evaluated,
            key=lambda attempt: float(attempt["evaluation"]["overall_score"]),
            default=None,
        )
        score = float(best["evaluation"]["overall_score"]) if best else None
        if min_score is not None and (score is None or score < min_score):
            continue

        haystack = " ".join(
            [
                record["display_name"],
                record["email"],
                str(profile.get("headline", "")),
                str(profile.get("summary", "")),
                " ".join(profile.get("skills") or []),
                " ".join(domains),
            ]
        ).lower()
        if needle and needle not in haystack:
            continue

        results.append(
            {
                "candidate_id": record["candidate_id"],
                "display_name": record["display_name"],
                "email": record["email"] if applied else None,
                "headline": profile.get("headline", ""),
                "skills": (profile.get("skills") or [])[:12],
                "target_domains": domains,
                "best_score": score,
                "best_pack_id": best["pack_id"] if best else None,
                "application_count": int(record.get("application_count") or 0),
                "discovery_consent": discovery,
                "why": _talent_explanation(
                    applied=applied,
                    discovery=discovery,
                    score=score,
                    pack_id=best["pack_id"] if best else None,
                    skills=profile.get("skills") or [],
                    query=query,
                ),
            }
        )

    results.sort(
        key=lambda item: (
            -(item["best_score"] if item["best_score"] is not None else -1.0),
            item["display_name"].lower(),
        )
    )
    return results[:limit]


def _talent_explanation(
    *,
    applied: bool,
    discovery: bool,
    score: Any,
    pack_id: str | None,
    skills: list[str],
    query: str,
) -> list[str]:
    reasons: list[str] = []
    if applied:
        reasons.append("Already applied to a job in your organization")
    if discovery:
        reasons.append("Granted talent discovery consent")
    if score is not None:
        pack_label = pack_id or "a domain pack"
        reasons.append(f"Profile Interview score {float(score):.0f} on {pack_label}")
    if query.strip():
        matched = [skill for skill in skills if query.strip().lower() in skill.lower()]
        if matched:
            reasons.append("Skills match: " + ", ".join(matched[:3]))
    return reasons or ["Visible under tenant and consent rules"]


# --- candidates ---------------------------------------------------------------


def get_or_create_candidate(conn: Connection, *, user_id: str) -> dict[str, Any]:
    row = conn.execute("SELECT * FROM candidates WHERE user_id=?", (user_id,)).fetchone()
    if row:
        return _candidate_row_to_dict(dict(row))
    now = utc_now()
    candidate = {
        "id": new_id("cnd"),
        "user_id": user_id,
        "profile": to_json(
            {
                "headline": "",
                "summary": "",
                "skills": [],
                "credentials": [],
                "experiences": [],
                "availability": "open",
            }
        ),
        "consents": to_json({"discovery": False, "application_processing": True}),
        "target_domains": to_json([]),
        "created_at": now,
        "updated_at": now,
    }
    conn.execute(
        """INSERT INTO candidates
           (id, user_id, profile, consents, target_domains, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?)""",
        tuple(candidate.values()),
    )
    conn.commit()
    return _candidate_row_to_dict(candidate)


def _candidate_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    candidate = dict(row)
    for key in ("profile", "consents", "target_domains", "parsed_cv", "embedding"):
        if key in candidate and isinstance(candidate[key], str):
            candidate[key] = from_json(candidate[key])
    return candidate


def get_candidate(conn: Connection, candidate_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM candidates WHERE id=?", (candidate_id,)).fetchone()
    return _candidate_row_to_dict(dict(row)) if row else None


def update_candidate(
    conn: Connection,
    *,
    candidate_id: str,
    profile: dict[str, Any] | None = None,
    consents: dict[str, Any] | None = None,
    target_domains: list[str] | None = None,
    parsed_cv: dict[str, Any] | None = None,
    embedding: list[float] | None = None,
    embedding_model: str | None = None,
    embedded_at: str | None = None,
) -> None:
    sets = ["updated_at = ?"]
    params: list[Any] = [utc_now()]
    if profile is not None:
        sets.append("profile = ?")
        params.append(to_json(profile))
    if consents is not None:
        sets.append("consents = ?")
        params.append(to_json(consents))
    if target_domains is not None:
        sets.append("target_domains = ?")
        params.append(to_json(target_domains))
    if parsed_cv is not None:
        sets.append("parsed_cv = ?")
        params.append(to_json(parsed_cv))
    if embedding is not None:
        sets.append("embedding = ?")
        params.append(to_json(embedding))
    if embedding_model is not None:
        sets.append("embedding_model = ?")
        params.append(embedding_model)
    if embedded_at is not None:
        sets.append("embedded_at = ?")
        params.append(embedded_at)
    params.append(candidate_id)
    conn.execute(f"UPDATE candidates SET {', '.join(sets)} WHERE id = ?", params)


# --- profile interviews ---------------------------------------------------------


def list_profile_attempts(
    conn: Connection, *, candidate_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM profile_interview_attempts WHERE candidate_id=? ORDER BY started_at DESC",
        (candidate_id,),
    ).fetchall()
    return [_attempt_row_to_dict(dict(row)) for row in rows]


def _attempt_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    attempt = dict(row)
    for key in (
        "questions",
        "responses",
        "evaluation",
        "transcripts",
        "identity_verification",
        "interview_plan",
        "answer_assessments",
    ):
        if isinstance(attempt.get(key), str):
            attempt[key] = from_json(attempt[key])
    if attempt.get("transcripts") is None:
        attempt["transcripts"] = []
    if attempt.get("answer_assessments") is None:
        attempt["answer_assessments"] = []
    return attempt


def create_profile_attempt(
    conn: Connection,
    *,
    candidate_id: str,
    pack_id: str,
    pack_version: str,
    attempt_number: int,
    questions: list[dict[str, Any]],
    room_name: str | None = None,
    duration_minutes: int = 10,
) -> dict[str, Any]:
    attempt_id = new_id("pia")
    attempt = {
        "id": attempt_id,
        "candidate_id": candidate_id,
        "pack_id": pack_id,
        "pack_version": pack_version,
        "attempt_number": attempt_number,
        "status": "in_progress",
        "questions": to_json(questions),
        "responses": to_json({}),
        "evaluation": None,
        "started_at": utc_now(),
        "submitted_at": None,
        "transcripts": to_json([]),
        "room_name": room_name or f"profile-screening-{attempt_id}",
        "started_via": "voice",
        "duration_minutes": duration_minutes,
    }
    conn.execute(
        """INSERT INTO profile_interview_attempts
           (id, candidate_id, pack_id, pack_version, attempt_number, status, questions,
            responses, evaluation, started_at, submitted_at, transcripts, room_name,
            started_via, duration_minutes)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        tuple(attempt.values()),
    )
    return _attempt_row_to_dict(attempt)


def get_profile_attempt(
    conn: Connection, *, attempt_id: str, candidate_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM profile_interview_attempts WHERE id=? AND candidate_id=?",
        (attempt_id, candidate_id),
    ).fetchone()
    return _attempt_row_to_dict(dict(row)) if row else None


def get_profile_attempt_by_id(
    conn: Connection, *, attempt_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM profile_interview_attempts WHERE id=?",
        (attempt_id,),
    ).fetchone()
    return _attempt_row_to_dict(dict(row)) if row else None


def update_profile_interview_voice(
    conn: Connection,
    *,
    attempt_id: str,
    status: str | None = None,
    transcripts: list[dict[str, Any]] | None = None,
    started_at: str | None = None,
    evaluation: dict[str, Any] | None = None,
    room_name: str | None = None,
    submitted_at: str | None = None,
) -> None:
    fields: dict[str, Any] = {}
    if status is not None:
        fields["status"] = status
    if transcripts is not None:
        fields["transcripts"] = to_json(transcripts)
    if started_at is not None:
        fields["started_at"] = started_at
    if evaluation is not None:
        fields["evaluation"] = to_json(evaluation)
    if room_name is not None:
        fields["room_name"] = room_name
    if submitted_at is not None:
        fields["submitted_at"] = submitted_at
    if not fields:
        return
    sets = ", ".join(f"{key}=?" for key in fields)
    conn.execute(
        f"UPDATE profile_interview_attempts SET {sets} WHERE id=?",
        (*fields.values(), attempt_id),
    )


def save_profile_attempt_responses(
    conn: Connection, *, attempt_id: str, responses: dict[str, str]
) -> None:
    conn.execute(
        "UPDATE profile_interview_attempts SET responses=? WHERE id=?",
        (to_json(responses), attempt_id),
    )


def set_profile_attempt_identity(
    conn: Connection, *, attempt_id: str, verification: dict[str, Any]
) -> None:
    """Record the live identity verification verdict on a profile attempt."""
    conn.execute(
        "UPDATE profile_interview_attempts SET identity_verification=? WHERE id=?",
        (to_json(verification), attempt_id),
    )


def set_profile_attempt_plan(
    conn: Connection, *, attempt_id: str, plan: dict[str, Any]
) -> None:
    """Persist the pre-generated interview plan on a profile attempt."""
    conn.execute(
        "UPDATE profile_interview_attempts SET interview_plan=? WHERE id=?",
        (to_json(plan), attempt_id),
    )


def append_profile_answer_assessment(
    conn: Connection, *, attempt_id: str, assessment: dict[str, Any]
) -> None:
    """Append one per-answer assessment to a profile attempt's log."""
    row = conn.execute(
        "SELECT answer_assessments FROM profile_interview_attempts WHERE id=?",
        (attempt_id,),
    ).fetchone()
    current = from_json(row["answer_assessments"]) if row and row["answer_assessments"] else []
    if not isinstance(current, list):
        current = []
    current.append(assessment)
    conn.execute(
        "UPDATE profile_interview_attempts SET answer_assessments=? WHERE id=?",
        (to_json(current), attempt_id),
    )


def set_applied_attempt_identity(
    conn: Connection, *, attempt_id: str, verification: dict[str, Any]
) -> None:
    """Record the live identity verification verdict on an applied attempt."""
    conn.execute(
        "UPDATE applied_interview_attempts SET identity_verification=? WHERE id=?",
        (to_json(verification), attempt_id),
    )


def set_applied_attempt_plan(
    conn: Connection, *, attempt_id: str, plan: dict[str, Any]
) -> None:
    """Persist the pre-generated interview plan on an applied attempt."""
    conn.execute(
        "UPDATE applied_interview_attempts SET interview_plan=? WHERE id=?",
        (to_json(plan), attempt_id),
    )


def set_applied_attempt_sandbox(
    conn: Connection, *, attempt_id: str, session: dict[str, Any] | None
) -> None:
    """Persist the whole proctored-sandbox session JSON on an applied attempt.

    The candidate is the single writer of their sandbox session, so a
    whole-document write is race-free and keeps the store layer trivial.
    """
    conn.execute(
        "UPDATE applied_interview_attempts SET sandbox_session=? WHERE id=?",
        (to_json(session) if session is not None else None, attempt_id),
    )


def append_applied_answer_assessment(
    conn: Connection, *, attempt_id: str, assessment: dict[str, Any]
) -> None:
    """Append one per-answer assessment to an applied attempt's log."""
    row = conn.execute(
        "SELECT answer_assessments FROM applied_interview_attempts WHERE id=?",
        (attempt_id,),
    ).fetchone()
    current = from_json(row["answer_assessments"]) if row and row["answer_assessments"] else []
    if not isinstance(current, list):
        current = []
    current.append(assessment)
    conn.execute(
        "UPDATE applied_interview_attempts SET answer_assessments=? WHERE id=?",
        (to_json(current), attempt_id),
    )


def submit_profile_attempt(
    conn: Connection, *, attempt_id: str, evaluation: dict[str, Any]
) -> None:
    conn.execute(
        """UPDATE profile_interview_attempts
           SET status='evaluated', evaluation=?, submitted_at=? WHERE id=?""",
        (to_json(evaluation), utc_now(), attempt_id),
    )


def best_profile_score(conn: Connection, *, candidate_id: str) -> float | None:
    attempts = list_profile_attempts(conn, candidate_id=candidate_id)
    scores = [
        attempt["evaluation"]["overall_score"]
        for attempt in attempts
        if attempt["status"] == "evaluated" and attempt.get("evaluation")
    ]
    return max(scores) if scores else None


def best_profile_score_for_pack(
    conn: Connection, *, candidate_id: str, pack_id: str
) -> float | None:
    attempts = list_profile_attempts(conn, candidate_id=candidate_id)
    scores = [
        float(attempt["evaluation"]["overall_score"])
        for attempt in attempts
        if attempt["status"] == "evaluated"
        and attempt.get("evaluation")
        and attempt["pack_id"] == pack_id
    ]
    return max(scores) if scores else None


def list_discoverable_candidates(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT c.*, u.display_name, u.email
           FROM candidates c
           JOIN users u ON u.id = c.user_id"""
    ).fetchall()
    results = []
    for row in rows:
        candidate = _candidate_row_to_dict(dict(row))
        if not (candidate.get("consents") or {}).get("discovery"):
            continue
        candidate["display_name"] = row["display_name"]
        candidate["email"] = row["email"]
        results.append(candidate)
    return results


def replace_posting_matches(
    conn: Connection,
    *,
    tenant_id: str,
    posting_id: str,
    matches: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    conn.execute("DELETE FROM posting_matches WHERE posting_id=?", (posting_id,))
    saved: list[dict[str, Any]] = []
    now = utc_now()
    for match in matches:
        record = {
            "id": new_id("mtc"),
            "tenant_id": tenant_id,
            "posting_id": posting_id,
            "candidate_id": match["candidate_id"],
            "score": match["score"],
            "skill_score": match.get("skill_score", 0),
            "interview_score": match.get("interview_score", 0),
            "reasons": to_json(match.get("reasons") or []),
            "notified": 0,
            "created_at": now,
        }
        conn.execute(
            """INSERT INTO posting_matches
               (id, tenant_id, posting_id, candidate_id, score, skill_score, interview_score,
                reasons, notified, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            tuple(record.values()),
        )
        saved.append(
            {
                **match,
                "id": record["id"],
                "reasons": match.get("reasons") or [],
                "notified": False,
                "created_at": now,
            }
        )
    return saved


def mark_match_notified(conn: Connection, *, match_id: str) -> None:
    conn.execute("UPDATE posting_matches SET notified=1 WHERE id=?", (match_id,))


def list_posting_matches(
    conn: Connection, *, tenant_id: str, posting_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT m.*, u.display_name, u.email, c.profile
           FROM posting_matches m
           JOIN candidates c ON c.id = m.candidate_id
           JOIN users u ON u.id = c.user_id
           WHERE m.tenant_id=? AND m.posting_id=?
           ORDER BY m.score DESC""",
        (tenant_id, posting_id),
    ).fetchall()
    results = []
    for row in rows:
        record = dict(row)
        profile = (
            from_json(record["profile"])
            if isinstance(record["profile"], str)
            else record["profile"]
        )
        results.append(
            {
                "id": record["id"],
                "candidate_id": record["candidate_id"],
                "display_name": record["display_name"],
                "email": record["email"],
                "headline": (profile or {}).get("headline", ""),
                "skills": ((profile or {}).get("skills") or [])[:8],
                "score": record["score"],
                "skill_score": record["skill_score"],
                "interview_score": record["interview_score"],
                "reasons": from_json(record["reasons"], []),
                "notified": bool(record["notified"]),
                "created_at": record["created_at"],
            }
        )
    return results


def list_matches_for_candidate(
    conn: Connection, *, candidate_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT m.*, p.title, p.status AS posting_status, p.location, p.pack_id, p.pack_version
           FROM posting_matches m
           JOIN postings p ON p.id = m.posting_id
           WHERE m.candidate_id=? AND p.status='published'
           ORDER BY m.score DESC""",
        (candidate_id,),
    ).fetchall()
    results = []
    for row in rows:
        record = dict(row)
        results.append(
            {
                "id": record["id"],
                "posting_id": record["posting_id"],
                "title": record["title"],
                "location": record["location"],
                "pack_id": record["pack_id"],
                "pack_version": record["pack_version"],
                "score": record["score"],
                "reasons": from_json(record["reasons"], []),
                "created_at": record["created_at"],
            }
        )
    return results


# --- postings -------------------------------------------------------------------


def _posting_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    posting = dict(row)
    for key in ("workflow_snapshot", "question_pool", "embedding", "sandbox_config"):
        if isinstance(posting.get(key), str):
            posting[key] = from_json(posting[key])
    posting["sandbox_required"] = bool(posting.get("sandbox_required"))
    return posting


def create_posting(conn: Connection, posting: dict[str, Any]) -> dict[str, Any]:
    stored = dict(posting)
    stored["workflow_snapshot"] = (
        to_json(stored["workflow_snapshot"]) if stored.get("workflow_snapshot") else None
    )
    stored["question_pool"] = (
        to_json(stored["question_pool"]) if stored.get("question_pool") else None
    )
    if "sandbox_config" in stored:
        stored["sandbox_config"] = (
            to_json(stored["sandbox_config"]) if stored.get("sandbox_config") else None
        )
    if "sandbox_required" in stored:
        stored["sandbox_required"] = 1 if stored["sandbox_required"] else 0
    columns = ", ".join(stored.keys())
    placeholders = ", ".join("?" for _ in stored)
    conn.execute(
        f"INSERT INTO postings ({columns}) VALUES ({placeholders})", tuple(stored.values())
    )
    return _posting_row_to_dict(posting)


def get_posting(
    conn: Connection, *, tenant_id: str, posting_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM postings WHERE tenant_id=? AND id=?", (tenant_id, posting_id)
    ).fetchone()
    return _posting_row_to_dict(dict(row)) if row else None


def get_published_posting(conn: Connection, posting_id: str) -> dict[str, Any] | None:
    """Cross-tenant read used only by candidate job discovery; published only."""
    row = conn.execute(
        "SELECT * FROM postings WHERE id=? AND status='published'", (posting_id,)
    ).fetchone()
    return _posting_row_to_dict(dict(row)) if row else None


def get_posting_by_id(conn: Connection, *, posting_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM postings WHERE id=?", (posting_id,)).fetchone()
    return _posting_row_to_dict(dict(row)) if row else None


def list_postings(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM postings WHERE tenant_id=? ORDER BY created_at DESC", (tenant_id,)
    ).fetchall()
    return [_posting_row_to_dict(dict(row)) for row in rows]


def list_published_postings(conn: Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM postings WHERE status='published' ORDER BY published_at DESC"
    ).fetchall()
    return [_posting_row_to_dict(dict(row)) for row in rows]


def update_posting(
    conn: Connection, *, tenant_id: str, posting_id: str, fields: dict[str, Any]
) -> None:
    stored = dict(fields)
    if "workflow_snapshot" in stored and stored["workflow_snapshot"] is not None:
        stored["workflow_snapshot"] = to_json(stored["workflow_snapshot"])
    if "question_pool" in stored and stored["question_pool"] is not None:
        stored["question_pool"] = to_json(stored["question_pool"])
    if "embedding" in stored and stored["embedding"] is not None:
        stored["embedding"] = to_json(stored["embedding"])
    if "sandbox_config" in stored and stored["sandbox_config"] is not None:
        stored["sandbox_config"] = to_json(stored["sandbox_config"])
    if "sandbox_required" in stored:
        stored["sandbox_required"] = 1 if stored["sandbox_required"] else 0
    sets = ", ".join(f"{key} = ?" for key in stored)
    conn.execute(
        f"UPDATE postings SET {sets} WHERE tenant_id = ? AND id = ?",
        (*stored.values(), tenant_id, posting_id),
    )


# --- applications ----------------------------------------------------------------


def _application_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    application = dict(row)
    for key in ("profile_snapshot", "answers"):
        if isinstance(application.get(key), str):
            application[key] = from_json(application[key])
    return application


def create_application(conn: Connection, application: dict[str, Any]) -> dict[str, Any]:
    stored = dict(application)
    stored["profile_snapshot"] = to_json(stored["profile_snapshot"])
    stored["answers"] = to_json(stored.get("answers") or {})
    columns = ", ".join(stored.keys())
    placeholders = ", ".join("?" for _ in stored)
    conn.execute(
        f"INSERT INTO applications ({columns}) VALUES ({placeholders})", tuple(stored.values())
    )
    return _application_row_to_dict(application)


def get_application(
    conn: Connection, *, tenant_id: str, application_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM applications WHERE tenant_id=? AND id=?", (tenant_id, application_id)
    ).fetchone()
    return _application_row_to_dict(dict(row)) if row else None


def get_application_for_candidate(
    conn: Connection, *, candidate_id: str, application_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM applications WHERE candidate_id=? AND id=?",
        (candidate_id, application_id),
    ).fetchone()
    return _application_row_to_dict(dict(row)) if row else None


def find_application(
    conn: Connection, *, posting_id: str, candidate_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM applications WHERE posting_id=? AND candidate_id=?",
        (posting_id, candidate_id),
    ).fetchone()
    return _application_row_to_dict(dict(row)) if row else None


def list_applications_for_tenant(
    conn: Connection, *, tenant_id: str, posting_id: str | None = None
) -> list[dict[str, Any]]:
    if posting_id:
        rows = conn.execute(
            "SELECT * FROM applications WHERE tenant_id=? AND posting_id=? ORDER BY created_at",
            (tenant_id, posting_id),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM applications WHERE tenant_id=? ORDER BY created_at", (tenant_id,)
        ).fetchall()
    return [_application_row_to_dict(dict(row)) for row in rows]


def list_applications_for_candidate(
    conn: Connection, *, candidate_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM applications WHERE candidate_id=? ORDER BY created_at DESC",
        (candidate_id,),
    ).fetchall()
    return [_application_row_to_dict(dict(row)) for row in rows]


def update_application_stage(
    conn: Connection,
    *,
    tenant_id: str,
    application_id: str,
    stage_id: str,
    stage_category: str,
    expected_version: int,
) -> bool:
    cursor = conn.execute(
        """UPDATE applications
           SET stage_id=?, stage_category=?, stage_version=stage_version+1, updated_at=?
           WHERE tenant_id=? AND id=? AND stage_version=?""",
        (stage_id, stage_category, utc_now(), tenant_id, application_id, expected_version),
    )
    return cursor.rowcount == 1


def update_application_feedback(
    conn: Connection,
    *,
    application_id: str,
    feedback: str,
) -> None:
    conn.execute(
        "UPDATE applications SET ai_improvement_feedback=?, updated_at=? WHERE id=?",
        (feedback, utc_now(), application_id),
    )


def record_transition(
    conn: Connection,
    *,
    tenant_id: str,
    application_id: str,
    from_stage_id: str,
    to_stage_id: str,
    reason_code: str,
    note: str,
    actor_user_id: str,
) -> dict[str, Any]:
    transition = {
        "id": new_id("trn"),
        "tenant_id": tenant_id,
        "application_id": application_id,
        "from_stage_id": from_stage_id,
        "to_stage_id": to_stage_id,
        "reason_code": reason_code,
        "note": note,
        "actor_user_id": actor_user_id,
        "occurred_at": utc_now(),
    }
    conn.execute(
        """INSERT INTO application_transitions
           (id, tenant_id, application_id, from_stage_id, to_stage_id, reason_code, note,
            actor_user_id, occurred_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        tuple(transition.values()),
    )
    return transition


def list_transitions(
    conn: Connection, *, application_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM application_transitions WHERE application_id=? ORDER BY occurred_at",
        (application_id,),
    ).fetchall()
    return [dict(row) for row in rows]


# --- applied interviews ------------------------------------------------------------


def _applied_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
    attempt = dict(row)
    for key in (
        "questions",
        "responses",
        "evaluation",
        "transcripts",
        "identity_verification",
        "interview_plan",
        "answer_assessments",
        "sandbox_session",
    ):
        if isinstance(attempt.get(key), str):
            attempt[key] = from_json(attempt[key])
    if attempt.get("transcripts") is None:
        attempt["transcripts"] = []
    if attempt.get("answer_assessments") is None:
        attempt["answer_assessments"] = []
    return attempt


def create_applied_attempt(conn: Connection, attempt: dict[str, Any]) -> dict[str, Any]:
    stored = dict(attempt)
    if "transcripts" not in stored:
        stored["transcripts"] = []
    if "started_via" not in stored:
        stored["started_via"] = "voice"
    if "duration_minutes" not in stored:
        stored["duration_minutes"] = 10
    if "room_name" not in stored:
        stored["room_name"] = f"job-interview-{stored['id']}"
    stored["questions"] = to_json(stored["questions"])
    stored["responses"] = to_json(stored.get("responses") or {})
    stored["evaluation"] = to_json(stored["evaluation"]) if stored.get("evaluation") else None
    stored["transcripts"] = to_json(stored.get("transcripts") or [])
    columns = ", ".join(stored.keys())
    placeholders = ", ".join("?" for _ in stored)
    conn.execute(
        f"INSERT INTO applied_interview_attempts ({columns}) VALUES ({placeholders})",
        tuple(stored.values()),
    )
    return _applied_row_to_dict(attempt)


def get_applied_attempt_by_application(
    conn: Connection, *, application_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM applied_interview_attempts WHERE application_id=?", (application_id,)
    ).fetchone()
    return _applied_row_to_dict(dict(row)) if row else None


def get_applied_attempt_for_candidate(
    conn: Connection, *, attempt_id: str, candidate_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM applied_interview_attempts WHERE id=? AND candidate_id=?",
        (attempt_id, candidate_id),
    ).fetchone()
    return _applied_row_to_dict(dict(row)) if row else None


def get_applied_attempt_by_id(
    conn: Connection, *, attempt_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM applied_interview_attempts WHERE id=?",
        (attempt_id,),
    ).fetchone()
    return _applied_row_to_dict(dict(row)) if row else None


def update_applied_interview_voice(
    conn: Connection,
    *,
    attempt_id: str,
    status: str | None = None,
    transcripts: list[dict[str, Any]] | None = None,
    started_at: str | None = None,
    evaluation: dict[str, Any] | None = None,
    room_name: str | None = None,
    submitted_at: str | None = None,
) -> None:
    fields: dict[str, Any] = {}
    if status is not None:
        fields["status"] = status
    if transcripts is not None:
        fields["transcripts"] = to_json(transcripts)
    if started_at is not None:
        fields["started_at"] = started_at
    if evaluation is not None:
        fields["evaluation"] = to_json(evaluation)
    if room_name is not None:
        fields["room_name"] = room_name
    if submitted_at is not None:
        fields["submitted_at"] = submitted_at
    if not fields:
        return
    sets = ", ".join(f"{key}=?" for key in fields)
    conn.execute(
        f"UPDATE applied_interview_attempts SET {sets} WHERE id=?",
        (*fields.values(), attempt_id),
    )


def list_applied_attempts_for_candidate(
    conn: Connection, *, candidate_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM applied_interview_attempts WHERE candidate_id=? ORDER BY invited_at DESC",
        (candidate_id,),
    ).fetchall()
    return [_applied_row_to_dict(dict(row)) for row in rows]


def update_applied_attempt(
    conn: Connection, *, attempt_id: str, fields: dict[str, Any]
) -> None:
    stored = dict(fields)
    for key in ("responses", "evaluation"):
        if key in stored and stored[key] is not None:
            stored[key] = to_json(stored[key])
    sets = ", ".join(f"{key} = ?" for key in stored)
    conn.execute(
        f"UPDATE applied_interview_attempts SET {sets} WHERE id = ?",
        (*stored.values(), attempt_id),
    )


# --- scorecards ----------------------------------------------------------------------


def create_scorecard(conn: Connection, scorecard: dict[str, Any]) -> dict[str, Any]:
    stored = dict(scorecard)
    stored["scores"] = to_json(stored["scores"])
    columns = ", ".join(stored.keys())
    placeholders = ", ".join("?" for _ in stored)
    conn.execute(
        f"INSERT INTO reviewer_scorecards ({columns}) VALUES ({placeholders})",
        tuple(stored.values()),
    )
    return scorecard


def list_scorecards(
    conn: Connection, *, tenant_id: str, application_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT s.*, u.display_name AS reviewer_name FROM reviewer_scorecards s
           JOIN users u ON u.id = s.reviewer_user_id
           WHERE s.tenant_id=? AND s.application_id=? ORDER BY s.created_at""",
        (tenant_id, application_id),
    ).fetchall()
    scorecards = []
    for row in rows:
        scorecard = dict(row)
        scorecard["scores"] = from_json(scorecard["scores"])
        scorecards.append(scorecard)
    return scorecards


# --- email templates -----------------------------------------------------------


def list_email_templates(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM email_templates WHERE tenant_id=? ORDER BY template_key",
        (tenant_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_email_template(
    conn: Connection, *, tenant_id: str, template_key: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM email_templates WHERE tenant_id=? AND template_key=?",
        (tenant_id, template_key),
    ).fetchone()
    return dict(row) if row else None


def upsert_email_template(
    conn: Connection,
    *,
    tenant_id: str,
    template_key: str,
    subject: str,
    body: str,
    updated_by: str,
) -> dict[str, Any]:
    now = utc_now()
    existing = get_email_template(conn, tenant_id=tenant_id, template_key=template_key)
    if existing:
        conn.execute(
            """UPDATE email_templates
               SET subject=?, body=?, updated_by=?, updated_at=?
               WHERE tenant_id=? AND template_key=?""",
            (subject, body, updated_by, now, tenant_id, template_key),
        )
        return get_email_template(conn, tenant_id=tenant_id, template_key=template_key)  # type: ignore[return-value]
    record = {
        "id": new_id("emt"),
        "tenant_id": tenant_id,
        "template_key": template_key,
        "subject": subject,
        "body": body,
        "updated_by": updated_by,
        "created_at": now,
        "updated_at": now,
    }
    conn.execute(
        """INSERT INTO email_templates
           (id, tenant_id, template_key, subject, body, updated_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        tuple(record.values()),
    )
    return record


# --- conversations & messaging ------------------------------------------------


def create_conversation(
    conn: Connection,
    *,
    tenant_id: str,
    candidate_id: str,
    application_id: str | None = None,
    posting_id: str | None = None,
    subject: str = "",
    last_message_preview: str = "",
) -> dict[str, Any]:
    now = utc_now()
    cid = new_id("cnv")
    record = {
        "id": cid,
        "tenant_id": tenant_id,
        "application_id": application_id,
        "posting_id": posting_id,
        "candidate_id": candidate_id,
        "subject": subject,
        "last_message_preview": last_message_preview,
        "last_message_at": now,
        "created_at": now,
    }
    conn.execute(
        """INSERT INTO conversations
           (id, tenant_id, application_id, posting_id, candidate_id,
            subject, last_message_preview, last_message_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        tuple(record.values()),
    )
    return record


def get_conversation(conn: Connection, *, conversation_id: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM conversations WHERE id=?", (conversation_id,)).fetchone()
    return dict(row) if row else None


def find_conversation_by_application(
    conn: Connection, *, tenant_id: str, application_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM conversations WHERE tenant_id=? AND application_id=?",
        (tenant_id, application_id),
    ).fetchone()
    return dict(row) if row else None


def find_conversation(
    conn: Connection, *, tenant_id: str, candidate_id: str, application_id: str | None = None
) -> dict[str, Any] | None:
    if application_id:
        row = conn.execute(
            "SELECT * FROM conversations WHERE tenant_id=? AND candidate_id=? AND application_id=?",
            (tenant_id, candidate_id, application_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM conversations WHERE tenant_id=? AND candidate_id=? ORDER BY last_message_at DESC LIMIT 1",
            (tenant_id, candidate_id),
        ).fetchone()
    return dict(row) if row else None


def list_conversations_for_tenant(
    conn: Connection, *, tenant_id: str, posting_id: str | None = None
) -> list[dict[str, Any]]:
    query = """
        SELECT c.*,
               u.display_name AS candidate_name,
               u.email AS candidate_email,
               p.title AS posting_title,
               (SELECT COUNT(*) FROM conversation_messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_role = 'candidate'
                  AND m.read_by_recipient = 0) AS unread_count
        FROM conversations c
        JOIN candidates cand ON cand.id = c.candidate_id
        JOIN users u ON u.id = cand.user_id
        LEFT JOIN postings p ON p.id = c.posting_id
        WHERE c.tenant_id = ?
    """
    params: list[Any] = [tenant_id]
    if posting_id:
        query += " AND c.posting_id = ?"
        params.append(posting_id)
    query += " ORDER BY c.last_message_at DESC"
    rows = conn.execute(query, tuple(params)).fetchall()
    return [dict(r) for r in rows]


def list_conversations_for_candidate(
    conn: Connection, *, candidate_id: str
) -> list[dict[str, Any]]:
    query = """
        SELECT c.*,
               o.name AS organization_name,
               p.title AS posting_title,
               (SELECT COUNT(*) FROM conversation_messages m
                WHERE m.conversation_id = c.id
                  AND m.sender_role = 'employer'
                  AND m.read_by_recipient = 0) AS unread_count
        FROM conversations c
        JOIN organizations o ON o.id = c.tenant_id
        LEFT JOIN postings p ON p.id = c.posting_id
        WHERE c.candidate_id = ?
        ORDER BY c.last_message_at DESC
    """
    rows = conn.execute(query, (candidate_id,)).fetchall()
    return [dict(r) for r in rows]


def create_message(
    conn: Connection,
    *,
    conversation_id: str,
    sender_user_id: str,
    sender_role: str,
    sender_name: str,
    body: str,
) -> dict[str, Any]:
    now = utc_now()
    mid = new_id("msg")
    record = {
        "id": mid,
        "conversation_id": conversation_id,
        "sender_user_id": sender_user_id,
        "sender_role": sender_role,
        "sender_name": sender_name,
        "body": body,
        "read_by_recipient": 0,
        "sent_at": now,
    }
    conn.execute(
        """INSERT INTO conversation_messages
           (id, conversation_id, sender_user_id, sender_role, sender_name,
            body, read_by_recipient, sent_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        tuple(record.values()),
    )
    preview = body[:80].replace("\n", " ")
    conn.execute(
        "UPDATE conversations SET last_message_at=?, last_message_preview=? WHERE id=?",
        (now, preview, conversation_id),
    )
    return record


def list_messages_for_conversation(
    conn: Connection, *, conversation_id: str
) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM conversation_messages WHERE conversation_id=? ORDER BY sent_at ASC",
        (conversation_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def mark_messages_read(
    conn: Connection, *, conversation_id: str, reader_user_id: str
) -> int:
    cur = conn.execute(
        """UPDATE conversation_messages
           SET read_by_recipient = 1
           WHERE conversation_id = ?
             AND sender_user_id != ?
             AND read_by_recipient = 0""",
        (conversation_id, reader_user_id),
    )
    return cur.rowcount


# --- automations -------------------------------------------------------------


def list_automation_rules(conn: Connection, *, tenant_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT r.*,
                  (SELECT COUNT(*) FROM automation_runs m WHERE m.rule_id = r.id) as run_count,
                  (SELECT m.executed_at FROM automation_runs m WHERE m.rule_id = r.id ORDER BY m.executed_at DESC LIMIT 1) as last_run_at
           FROM automation_rules r
           WHERE r.tenant_id=?
           ORDER BY r.created_at DESC""",
        (tenant_id,),
    ).fetchall()
    rules = []
    for r in rows:
        d = dict(r)
        d["trigger_config"] = from_json(d["trigger_config"])
        d["conditions"] = from_json(d["conditions"])
        d["actions"] = from_json(d["actions"])
        rules.append(d)
    return rules


def get_automation_rule(
    conn: Connection, *, tenant_id: str, rule_id: str
) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM automation_rules WHERE tenant_id=? AND id=?", (tenant_id, rule_id)
    ).fetchone()
    if not row:
        return None
    d = dict(row)
    d["trigger_config"] = from_json(d["trigger_config"])
    d["conditions"] = from_json(d["conditions"])
    d["actions"] = from_json(d["actions"])
    return d


def create_automation_rule(
    conn: Connection,
    *,
    tenant_id: str,
    name: str,
    description: str = "",
    trigger_event: str,
    trigger_config: dict[str, Any],
    conditions: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    created_by: str,
) -> dict[str, Any]:
    now = utc_now()
    rid = new_id("aut")
    record = {
        "id": rid,
        "tenant_id": tenant_id,
        "name": name,
        "description": description,
        "trigger_event": trigger_event,
        "trigger_config": to_json(trigger_config),
        "conditions": to_json(conditions),
        "actions": to_json(actions),
        "is_active": 1,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    conn.execute(
        """INSERT INTO automation_rules
           (id, tenant_id, name, description, trigger_event, trigger_config,
            conditions, actions, is_active, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        tuple(record.values()),
    )
    return get_automation_rule(conn, tenant_id=tenant_id, rule_id=rid)  # type: ignore[return-value]


def update_automation_rule(
    conn: Connection,
    *,
    tenant_id: str,
    rule_id: str,
    fields: dict[str, Any],
) -> dict[str, Any] | None:
    stored = dict(fields)
    for k in ("trigger_config", "conditions", "actions"):
        if k in stored and not isinstance(stored[k], str):
            stored[k] = to_json(stored[k])
    stored["updated_at"] = utc_now()

    sets = ", ".join(f"{k}=?" for k in stored)
    conn.execute(
        f"UPDATE automation_rules SET {sets} WHERE tenant_id=? AND id=?",
        (*stored.values(), tenant_id, rule_id),
    )
    return get_automation_rule(conn, tenant_id=tenant_id, rule_id=rule_id)


def delete_automation_rule(conn: Connection, *, tenant_id: str, rule_id: str) -> bool:
    cur = conn.execute("DELETE FROM automation_rules WHERE tenant_id=? AND id=?", (tenant_id, rule_id))
    return cur.rowcount > 0


def record_automation_run(
    conn: Connection,
    *,
    tenant_id: str,
    rule_id: str,
    trigger_resource_id: str,
    status: str,
    execution_log: str = "",
    error_message: str | None = None,
) -> dict[str, Any]:
    now = utc_now()
    run_id = new_id("run")
    conn.execute(
        """INSERT INTO automation_runs
           (id, tenant_id, rule_id, trigger_resource_id, status, execution_log, error_message, executed_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (run_id, tenant_id, rule_id, trigger_resource_id, status, execution_log, error_message, now),
    )
    return {
        "id": run_id,
        "tenant_id": tenant_id,
        "rule_id": rule_id,
        "trigger_resource_id": trigger_resource_id,
        "status": status,
        "execution_log": execution_log,
        "error_message": error_message,
        "executed_at": now,
    }


def list_automation_runs(
    conn: Connection, *, tenant_id: str, limit: int = 50
) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT m.*, r.name as rule_name
           FROM automation_runs m
           LEFT JOIN automation_rules r ON r.id = m.rule_id
           WHERE m.tenant_id=?
           ORDER BY m.executed_at DESC LIMIT ?""",
        (tenant_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


