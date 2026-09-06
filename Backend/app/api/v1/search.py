from typing import Any

from fastapi import APIRouter, Query

from app.api.dependencies import (
    CurrentUserDependency,
    DbDependency,
    EmployerContextDependency,
    PackRegistryDependency,
)
from app.db import store

router = APIRouter(tags=["search"])


@router.get("/search")
async def search_workspace(
    conn: DbDependency,
    context: EmployerContextDependency,
    q: str = Query(default="", max_length=200),
) -> dict[str, Any]:
    query = q.strip()
    if len(query) < 2:
        return {"query": query, "postings": [], "applications": []}
    results = store.search_workspace(conn, tenant_id=context.tenant_id, query=query)
    return {"query": query, **results}


@router.get("/talent")
async def search_talent(
    conn: DbDependency,
    context: EmployerContextDependency,
    q: str = Query(default="", max_length=200),
    pack_id: str | None = Query(default=None, max_length=100),
    min_score: float | None = Query(default=None, ge=0, le=100),
) -> dict[str, Any]:
    """Consent- and tenant-safe Talent Discovery (SEARCH-01 pilot)."""
    results = store.search_talent(
        conn,
        tenant_id=context.tenant_id,
        query=q,
        pack_id=pack_id,
        min_score=min_score,
    )
    return {
        "query": q.strip(),
        "pack_id": pack_id,
        "min_score": min_score,
        "results": results,
        "count": len(results),
    }


@router.get("/packs/catalog")
async def list_pack_catalog(
    registry: PackRegistryDependency,
    _user: CurrentUserDependency,
) -> dict[str, Any]:
    """Installed domain packs available for Profile Interviews and job focus."""
    return {
        "packs": [
            {
                "pack_id": manifest["pack_id"],
                "pack_version": manifest["pack_version"],
                "display_name": manifest["display_name"],
                "domain": manifest.get("domain", ""),
                "skills": manifest.get("ontology", {}).get("skills", [])[:8],
            }
            for manifest in registry.available_packs()
        ]
    }
