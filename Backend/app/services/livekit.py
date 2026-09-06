from datetime import timedelta

from livekit import api

from app.core.config import Settings
from app.core.errors import IntegrationConfigurationError
from app.schemas.interview import InterviewTokenResponse


class LiveKitTokenService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def issue(self, *, room_name: str, identity: str) -> InterviewTokenResponse:
        if not (
            self.settings.livekit_url
            and self.settings.livekit_api_key
            and self.settings.livekit_api_secret
        ):
            raise IntegrationConfigurationError("LiveKit")

        token = (
            api.AccessToken(
                self.settings.livekit_api_key,
                self.settings.livekit_api_secret.get_secret_value(),
            )
            .with_identity(identity)
            .with_name(identity)
            .with_ttl(timedelta(seconds=self.settings.livekit_token_ttl_seconds))
            .with_grants(api.VideoGrants(room_join=True, room=room_name))
            .to_jwt()
        )
        return InterviewTokenResponse(
            server_url=self.settings.livekit_url,
            token=token,
            identity=identity,
            expires_in_seconds=self.settings.livekit_token_ttl_seconds,
        )
