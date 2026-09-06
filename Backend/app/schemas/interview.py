from pydantic import BaseModel, Field


class InterviewTokenRequest(BaseModel):
    room_name: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_-]+$")


class InterviewTokenResponse(BaseModel):
    server_url: str
    token: str
    identity: str
    expires_in_seconds: int
