from uuid import UUID, uuid4

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def _safe_uuid(value: str | None) -> str | None:
    if value is None or len(value) > 36:
        return None
    try:
        return str(UUID(value))
    except ValueError:
        return None


class RequestContextMiddleware:
    """Attach opaque UUID context without retaining caller-provided free text."""

    def __init__(
        self,
        app: ASGIApp,
        request_id_header: str = "X-Request-ID",
        correlation_id_header: str = "X-Correlation-ID",
    ) -> None:
        self.app = app
        self.request_id_header = request_id_header
        self.correlation_id_header = correlation_id_header

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        request_id = _safe_uuid(request.headers.get(self.request_id_header)) or str(uuid4())
        correlation_id = (
            _safe_uuid(request.headers.get(self.correlation_id_header)) or request_id
        )
        scope.setdefault("state", {})["request_id"] = request_id
        scope["state"]["correlation_id"] = correlation_id

        async def send_with_context(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (self.request_id_header.lower().encode(), request_id.encode()),
                        (self.correlation_id_header.lower().encode(), correlation_id.encode()),
                    ]
                )
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_context)
