from fastapi import APIRouter

from app.api.dependencies import InterviewIdentityDependency, SettingsDependency
from app.api.v1.analytics import router as analytics_router
from app.api.v1.auth import router as auth_router
from app.api.v1.automations import router as automations_router
from app.api.v1.candidates import router as candidates_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.me import router as me_router
from app.api.v1.messages import router as messages_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.organizations import router as organizations_router
from app.api.v1.packs import router as packs_router
from app.api.v1.pipeline import router as pipeline_router
from app.api.v1.postings import router as postings_router
from app.api.v1.sandbox import router as sandbox_router
from app.api.v1.search import router as search_router
from app.api.v1.storage import router as storage_router
from app.api.v1.voice_interviews import router as voice_interviews_router
from app.api.v1.workflows import router as workflows_router
from app.schemas.ai import (
    InterviewQuestionGenerationRequest,
    InterviewQuestionGenerationResponse,
)
from app.schemas.interview import InterviewTokenRequest, InterviewTokenResponse
from app.services.ai.service import InterviewQuestionService
from app.services.livekit import LiveKitTokenService

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(me_router)
router.include_router(organizations_router)
router.include_router(packs_router)
router.include_router(workflows_router)
router.include_router(candidates_router)
router.include_router(voice_interviews_router)
router.include_router(postings_router)
router.include_router(jobs_router)
router.include_router(pipeline_router)
router.include_router(search_router)
router.include_router(notifications_router)
router.include_router(messages_router)
router.include_router(analytics_router)
router.include_router(automations_router)
router.include_router(storage_router)
router.include_router(sandbox_router)


@router.post(
    "/interviews/token",
    response_model=InterviewTokenResponse,
    tags=["interviews"],
)
async def create_interview_token(
    payload: InterviewTokenRequest,
    identity: InterviewIdentityDependency,
    settings: SettingsDependency,
) -> InterviewTokenResponse:
    return LiveKitTokenService(settings).issue(
        room_name=payload.room_name,
        identity=identity,
    )


@router.post(
    "/ai/interview-questions",
    response_model=InterviewQuestionGenerationResponse,
    tags=["ai"],
)
async def generate_interview_questions(
    payload: InterviewQuestionGenerationRequest,
    settings: SettingsDependency,
    _identity: InterviewIdentityDependency,
) -> InterviewQuestionGenerationResponse:
    service = InterviewQuestionService.from_settings(settings)
    return await service.generate(payload)
