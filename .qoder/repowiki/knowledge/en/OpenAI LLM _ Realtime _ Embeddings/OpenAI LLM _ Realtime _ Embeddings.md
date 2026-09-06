---
kind: external_dependency
name: OpenAI LLM / Realtime / Embeddings
slug: openai
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

OpenAI is the sole configured AI provider (`THOS_AI_PROVIDER=openai`). It powers three roles in THOS:
1. Post-session synthesis and evaluation of voice interviews (models gpt-4o/gpt-4o-mini).
2. Prompt/question generation for domain packs.
3. LiveKit Agent conversation via the OpenAI Realtime plugin (model gpt-realtime-mini) plus transcription (gpt-4o-mini-transcribe).
Embeddings use text-embedding-3-small for CV/job matching.
- Auth: API key injected via THOS_AI_API_KEY; without it identity checks record `unavailable` and voice start returns 503.
- Verify model names and realtime capabilities against the current OpenAI API docs before changing models.