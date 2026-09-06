from fastapi import APIRouter
from pydantic import BaseModel

from app.api.dependencies import SettingsDependency

router = APIRouter(prefix="/health", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str


@router.get("/live", response_model=HealthResponse)
async def liveness(settings: SettingsDependency) -> HealthResponse:
    return HealthResponse(status="live", version=settings.app_version)


@router.get("/ready", response_model=HealthResponse)
async def readiness(settings: SettingsDependency) -> HealthResponse:
    return HealthResponse(status="ready", version=settings.app_version)
