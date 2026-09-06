---
kind: external_dependency
name: LiveKit real-time voice interview rooms
slug: livekit
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
scope:
    - '**'
---

THOS uses LiveKit as the real-time media server for candidate voice interviews. The backend creates LiveKit rooms and issues short-lived tokens (THOS_LIVEKIT_TOKEN_TTL_SECONDS); the frontend joins via @livekit/components-react + livekit-client. Voice transcription and agent conversation are handled by LiveKit Agents with the OpenAI Realtime plugin (livekit-plugins-openai), so the AI provider is OpenAI but the transport layer is LiveKit's agent runtime rather than a direct OpenAI chat stream.
- Integration points: `Backend/app/services/livekit.py` (room/token creation), `Backend/app/api/v1/voice_interview.py` (voice endpoints), `Frontend/components/interviews/livekit-interview-room.tsx` (client room).
- Configuration: THOS_LIVEKIT_URL, THOS_LIVEKIT_API_KEY, THOS_LIVEKIT_API_SECRET must be set; without them `voice_interview_ready` is false and voice start returns a configuration error.
- Verify exact token-scoping and room lifecycle against the LiveKit Python SDK / Agent docs.