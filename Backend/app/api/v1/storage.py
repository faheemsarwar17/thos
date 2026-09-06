from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid
import time
from app.api.dependencies import CandidateContextDependency
from app.services.storage import generate_presigned_url

router = APIRouter(tags=["Storage"])

class PresignedUrlRequest(BaseModel):
    content_type: str = "video/webm"
    prefix: str = "quiz_recordings"

class PresignedUrlResponse(BaseModel):
    upload_url: str
    object_key: str

@router.post("/storage/presigned-url", response_model=PresignedUrlResponse)
async def get_presigned_url(
    req: PresignedUrlRequest,
    context: CandidateContextDependency
):
    """Generate a presigned URL for candidate file uploads (e.g., quiz recordings)."""
    # Create a unique object key using timestamp and uuid
    timestamp = int(time.time())
    unique_id = str(uuid.uuid4())[:8]
    object_key = f"{req.prefix}/{context.user['id']}/{timestamp}_{unique_id}"

    url = generate_presigned_url(
        object_name=object_key,
        content_type=req.content_type,
        expiration=3600
    )
    
    if not url:
        raise HTTPException(status_code=500, detail="Could not generate presigned URL. S3 might not be configured.")

    return PresignedUrlResponse(upload_url=url, object_key=object_key)
