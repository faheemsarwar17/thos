"""Synthetic demo data for local development.

All names and content are fictional (rules.md §9.5). Seeding runs only
when the database has no users, so restarts never duplicate data.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

from app.ai.sandbox import fallback_coding_problem
from app.core.config import Settings
from app.core.ids import new_id
from app.db import store
from app.db.database import Connection, connect, utc_now
from app.domain.evaluation import evaluate_scenario_responses
from app.domain.stages import default_candidate_status_mapping, default_stage_dicts
from app.services.packs import PackRegistry
from app.services.passwords import hash_password

SEED_CORRELATION = "seed"
DEMO_PASSWORD = "Password123!"

# Hira's submitted solution for the seeded "merge-schedules" sandbox problem.
HIRA_SANDBOX_CODE = '''def merge_intervals(intervals: list[list[int]]) -> list[list[int]]:
    """Return the sorted list of merged, non-overlapping intervals."""
    merged: list[list[int]] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged
'''


def _user(
    conn: Connection,
    identity: str,
    name: str,
    email: str,
    *,
    is_superadmin: bool = False,
) -> dict[str, Any]:
    existing = store.get_user_by_email(conn, email)
    if existing:
        return existing
    existing_identity = store.get_user_by_identity(conn, identity)
    if existing_identity:
        store.set_user_password(
            conn,
            user_id=existing_identity["id"],
            password_hash=hash_password(DEMO_PASSWORD),
        )
        return existing_identity
    user = store.create_user(
        conn,
        email=email,
        password_hash=hash_password(DEMO_PASSWORD),
        display_name=name,
        is_superadmin=is_superadmin,
    )
    # Keep stable demo identities for X-Development-Identity fallback.
    conn.execute("UPDATE users SET identity=? WHERE id=?", (identity, user["id"]))
    user["identity"] = identity
    return user


def _rich_response(concepts: list[str], topic: str) -> str:
    lines = [
        f"My approach to {topic} starts with understanding the context before acting.",
    ]
    for concept in concepts:
        lines.append(
            f"I would focus on {concept} early, because {concept} directly shapes how "
            "students experience the course and how the department measures success."
        )
    lines.append(
        "Finally, I would review the results each term, gather feedback, and adjust the "
        "plan so improvements are sustained rather than one-off fixes."
    )
    return " ".join(lines)


def seed_if_empty(settings: Settings) -> None:
    conn = connect(settings.database)
    try:
        row = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()
        if row["n"] > 0:
            # Backfill demo passwords for existing rows after auth migration.
            hashed = hash_password(DEMO_PASSWORD)
            conn.execute(
                "UPDATE users SET password_hash=? WHERE password_hash IS NULL",
                (hashed,),
            )
            conn.commit()
            return
        _seed(conn, settings)
    finally:
        conn.close()


def _seed(conn: Connection, settings: Settings) -> None:
    registry = PackRegistry(settings.domain_packs_path)
    try:
        manifest = registry.load("education")
    except Exception:
        manifest = None

    # --- staff -------------------------------------------------------------
    store.create_user(
        conn,
        email="superadmin@thos.local",
        password_hash=hash_password(DEMO_PASSWORD),
        display_name="Platform Superadmin",
        is_superadmin=True,
    )
    developer = _user(
        conn,
        settings.development_identity,
        "Ayesha Khan",
        "ayesha.khan@nut.edu.pk",
    )
    bilal = _user(conn, "bilal-hassan", "Bilal Hassan", "bilal.hassan@nut.edu.pk")
    samira = _user(conn, "samira-iqbal", "Samira Iqbal", "samira.iqbal@nut.edu.pk")
    tariq = _user(conn, "tariq-mahmood", "Tariq Mahmood", "tariq.mahmood@riverside.edu.pk")

    org_a = store.create_organization(
        conn,
        name="National University of Technology",
        org_type="university",
        creator_user_id=developer["id"],
        verification_status="verified",
        legal_name="National University of Technology",
        trading_name="NUT",
        domain="nut.edu.pk",
        contact_email="hr@nut.edu.pk",
        contact_phone="+92-51-111-111-111",
        address="Islamabad, Pakistan",
        create_membership=True,
    )
    store.add_member(conn, tenant_id=org_a["id"], user_id=bilal["id"], role="recruiter")
    store.add_member(conn, tenant_id=org_a["id"], user_id=samira["id"], role="hiring_manager")
    cs_unit = store.create_unit(
        conn, tenant_id=org_a["id"], name="Faculty of Computing", parent_unit_id=None
    )
    store.create_unit(
        conn, tenant_id=org_a["id"], name="Computer Science", parent_unit_id=cs_unit["id"]
    )
    store.create_unit(
        conn, tenant_id=org_a["id"], name="Data Science", parent_unit_id=cs_unit["id"]
    )

    org_b = store.create_organization(
        conn,
        name="Riverside College",
        org_type="university",
        creator_user_id=tariq["id"],
        verification_status="verified",
        legal_name="Riverside College",
        trading_name="Riverside",
        domain="riverside.edu.pk",
        contact_email="hr@riverside.edu.pk",
        contact_phone="+92-42-222-222-222",
        address="Lahore, Pakistan",
        create_membership=True,
    )
    store.create_unit(
        conn, tenant_id=org_b["id"], name="School of Business", parent_unit_id=None
    )

    for org, actor in ((org_a, developer), (org_b, tariq)):
        store.write_audit(
            conn,
            tenant_id=org["id"],
            actor_user_id=actor["id"],
            action="organization.created",
            resource_type="organization",
            resource_id=org["id"],
            new_state={"name": org["name"]},
        )
        if manifest:
            store.activate_pack(
                conn, tenant_id=org["id"], manifest=manifest, actor_user_id=actor["id"]
            )
            store.write_audit(
                conn,
                tenant_id=org["id"],
                actor_user_id=actor["id"],
                action="domain_pack.activated",
                resource_type="domain_pack",
                resource_id=manifest["pack_id"],
                new_state={"pack_version": manifest["pack_version"]},
            )
        workflow = store.create_workflow_version(
            conn,
            tenant_id=org["id"],
            template_name="default",
            stages=default_stage_dicts(),
            mapping=default_candidate_status_mapping(),
            actor_user_id=actor["id"],
        )
        store.publish_workflow(conn, tenant_id=org["id"], workflow_id=workflow["id"])
        store.write_audit(
            conn,
            tenant_id=org["id"],
            actor_user_id=actor["id"],
            action="workflow.published",
            resource_type="workflow_version",
            resource_id=workflow["id"],
            new_state={"version": workflow["version"]},
        )

    workflow_a = store.get_published_workflow(conn, tenant_id=org_a["id"])
    workflow_b = store.get_published_workflow(conn, tenant_id=org_b["id"])

    # --- postings -----------------------------------------------------------
    def make_posting(
        *,
        org: dict[str, Any],
        workflow: dict[str, Any] | None,
        actor: dict[str, Any],
        title: str,
        description: str,
        location: str,
        status: str,
        sandbox: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        pool = None
        pool_status = "not_generated"
        if manifest and status == "published":
            block = manifest["applied_interview"]
            pool = {
                "version": 1,
                "status": "locked",
                "task_style": block.get("task_style", "scenario"),
                "questions": block["questions"][:4],
                "rubric_dimensions": manifest["evaluation_rubric"]["dimensions"],
                "generated_at": utc_now(),
                "locked_at": utc_now(),
            }
            pool_status = "locked"
        posting = {
            "id": new_id("pst"),
            "tenant_id": org["id"],
            "unit_id": None,
            "title": title,
            "description": description,
            "location": location,
            "employment_type": "full_time",
            "status": status,
            "pack_id": manifest["pack_id"] if manifest else None,
            "pack_version": manifest["pack_version"] if manifest else None,
            "workflow_version_id": workflow["id"] if workflow else None,
            "workflow_snapshot": (
                {
                    "stages": workflow["stages"],
                    "candidate_status_mapping": workflow["candidate_status_mapping"],
                    "version": workflow["version"],
                }
                if workflow
                else None
            ),
            "question_pool": pool,
            "pool_status": pool_status,
            "sandbox_required": sandbox is not None,
            "sandbox_config": sandbox,
            "created_by": actor["id"],
            "created_at": utc_now(),
            "published_at": utc_now() if status == "published" else None,
            "closed_at": None,
            "version": 1,
        }
        store.create_posting(conn, posting)
        return posting

    posting_cs = make_posting(
        org=org_a,
        workflow=workflow_a,
        actor=samira,
        title="Assistant Professor, Computer Science",
        description=(
            "Teach core computer science courses, supervise final-year projects, and "
            "contribute to curriculum review under the semester system. PhD preferred; "
            "MPhil with strong teaching experience considered."
        ),
        location="Islamabad · On campus",
        status="published",
        sandbox={"type": "coding", "difficulty": "medium", "time_limit_minutes": 30},
    )
    posting_ds = make_posting(
        org=org_a,
        workflow=workflow_a,
        actor=samira,
        title="Lecturer, Data Science",
        description=(
            "Deliver undergraduate data science courses including statistics and machine "
            "learning fundamentals. Involves lab supervision and student mentoring."
        ),
        location="Lahore · On campus",
        status="published",
        sandbox={"type": "written", "difficulty": "medium", "time_limit_minutes": 30},
    )
    make_posting(
        org=org_a,
        workflow=workflow_a,
        actor=samira,
        title="Visiting Faculty, Cybersecurity",
        description="Part-time visiting position covering network security fundamentals.",
        location="Karachi · Visiting",
        status="draft",
    )
    make_posting(
        org=org_b,
        workflow=workflow_b,
        actor=tariq,
        title="Lecturer, Business Analytics",
        description="Teach business analytics with hands-on casework.",
        location="Faisalabad · On campus",
        status="published",
    )

    # --- candidates ----------------------------------------------------------
    candidate_specs = [
        ("hira-ahmed", "Hira Ahmed", "hira.ahmed@gmail.com",
         "PhD Computer Science, 6 years teaching",
         ["curriculum design", "student assessment", "machine learning"]),
        ("daniyal-raza", "Daniyal Raza", "daniyal.raza@gmail.com",
         "MPhil Data Science, 4 years industry + teaching",
         ["data science", "statistics", "lesson planning"]),
        ("nadia-omar", "Nadia Omar", "nadia.omar@gmail.com",
         "PhD candidate, research assistant",
         ["academic writing", "research supervision", "pedagogy"]),
        ("mahnoor-waheed", "Mahnoor Waheed", "mahnoor.waheed@gmail.com",
         "Lecturer with 3 years experience",
         ["classroom management", "educational technology", "student mentoring"]),
        ("omar-farooq", "Omar Farooq", "omar.farooq@gmail.com",
         "Fresh PhD graduate",
         ["machine learning", "course development", "statistics"]),
    ]
    candidates: dict[str, dict[str, Any]] = {}
    for identity, name, email, headline, skills in candidate_specs:
        user = _user(conn, identity, name, email)
        candidate = store.get_or_create_candidate(conn, user_id=user["id"])
        store.update_candidate(
            conn,
            candidate_id=candidate["id"],
            profile={
                "headline": headline,
                "summary": f"{name} is an educator focused on {', '.join(skills[:2])}.",
                "skills": skills,
                "credentials": ["PhD" if "PhD" in headline else "MPhil"],
                "experiences": [headline],
                "availability": "open",
            },
            consents={"discovery": True, "application_processing": True},
            target_domains=["education"],
        )
        candidates[identity] = store.get_candidate(conn, candidate["id"])  # refreshed

    # --- profile interviews ----------------------------------------------------
    if manifest:
        block = manifest["profile_interview"]
        questions = block["questions"][:4]
        for index, (identity, candidate) in enumerate(candidates.items()):
            if identity == "omar-farooq":
                continue  # one candidate without an interview yet
            responses = {
                q["id"]: _rich_response(
                    q.get("expected_concepts", [])[: 3 + index % 3], q["competency"]
                )
                for q in questions
            }
            attempt = store.create_profile_attempt(
                conn,
                candidate_id=candidate["id"],
                pack_id=manifest["pack_id"],
                pack_version=manifest["pack_version"],
                attempt_number=1,
                questions=questions,
            )
            store.save_profile_attempt_responses(
                conn, attempt_id=attempt["id"], responses=responses
            )
            evaluation = evaluate_scenario_responses(
                questions=questions,
                responses=responses,
                rubric_dimensions=manifest["evaluation_rubric"]["dimensions"],
                pack_id=manifest["pack_id"],
                pack_version=manifest["pack_version"],
            )
            store.submit_profile_attempt(conn, attempt_id=attempt["id"], evaluation=evaluation)

    # --- applications ------------------------------------------------------------
    stage_plan = [
        ("hira-ahmed", posting_cs, ["screened", "shortlisted", "applied_interview"]),
        ("daniyal-raza", posting_ds, ["screened", "shortlisted", "applied_interview"]),
        ("nadia-omar", posting_cs, ["screened"]),
        ("mahnoor-waheed", posting_ds, []),
        ("omar-farooq", posting_cs, []),
    ]
    stage_categories = {s["id"]: s["category"] for s in default_stage_dicts()}

    for identity, posting, path in stage_plan:
        candidate = candidates[identity]
        score = store.best_profile_score(conn, candidate_id=candidate["id"])
        final_stage = path[-1] if path else "received"
        application = {
            "id": new_id("app"),
            "tenant_id": posting["tenant_id"],
            "posting_id": posting["id"],
            "candidate_id": candidate["id"],
            "stage_id": final_stage,
            "stage_category": stage_categories[final_stage],
            "stage_version": len(path) + 1,
            "profile_snapshot": candidate["profile"],
            "profile_interview_score": score,
            "answers": {},
            "created_at": utc_now(),
            "updated_at": utc_now(),
        }
        store.create_application(conn, application)
        previous = "received"
        for stage_id in path:
            store.record_transition(
                conn,
                tenant_id=posting["tenant_id"],
                application_id=application["id"],
                from_stage_id=previous,
                to_stage_id=stage_id,
                reason_code="meets_requirements",
                note="",
                actor_user_id=bilal["id"],
            )
            previous = stage_id

    # Hira gets an Applied Interview invitation and has submitted it.
    hira_application = store.find_application(
        conn, posting_id=posting_cs["id"], candidate_id=candidates["hira-ahmed"]["id"]
    )
    if hira_application and posting_cs.get("question_pool"):
        pool = posting_cs["question_pool"]
        responses = {
            q["id"]: _rich_response(q.get("expected_concepts", [])[:4], q["competency"])
            for q in pool["questions"]
        }
        evaluation = evaluate_scenario_responses(
            questions=pool["questions"],
            responses=responses,
            rubric_dimensions=pool["rubric_dimensions"],
            pack_id=posting_cs["pack_id"],
            pack_version=posting_cs["pack_version"],
        )
        store.create_applied_attempt(
            conn,
            {
                "id": new_id("aia"),
                "tenant_id": org_a["id"],
                "application_id": hira_application["id"],
                "candidate_id": candidates["hira-ahmed"]["id"],
                "posting_id": posting_cs["id"],
                "pool_version": pool["version"],
                "status": "evaluated",
                "questions": pool["questions"],
                "responses": responses,
                "evaluation": evaluation,
                "invited_at": utc_now(),
                "started_at": utc_now(),
                "submitted_at": utc_now(),
            },
        )
        store.create_notification(
            conn,
            tenant_id=org_a["id"],
            recipient_user_id=developer["id"],
            title="Applied Interview submitted",
            body=(
                "Hira Ahmed completed the Applied Interview for "
                "Assistant Professor, Computer Science."
            ),
            link="/pipeline",
        )

    store.create_notification(
        conn,
        tenant_id=org_a["id"],
        recipient_user_id=developer["id"],
        title="3 candidates waiting on review",
        body="Applications in Received are waiting longer than your 24-hour target.",
        link="/pipeline",
    )
    conn.commit()
