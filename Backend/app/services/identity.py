"""Live identity verification: compare a user's profile photo (PFP) with a
frame captured from the interview webcam.

The interview itself never blocks on the verdict — it continues exactly the
same. The verdict is recorded on the attempt and surfaced in the interview
report; an ambiguous result is stated explicitly rather than hidden.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime
from typing import Any

import openai

from app.core.config import Settings
from app.logging import logger

# Statuses stored on attempts:
#   match               — live frame appears to be the same person as the PFP
#   ambiguous           — could not determine with confidence (stated in report)
#   mismatch            — live frame appears to be a different person
#   no_reference_photo  — user has no PFP on file, nothing to compare against
#   unavailable         — AI comparison not configured / failed
IDENTITY_MATCH = "match"
IDENTITY_AMBIGUOUS = "ambiguous"
IDENTITY_MISMATCH = "mismatch"
IDENTITY_NO_REFERENCE = "no_reference_photo"
IDENTITY_UNAVAILABLE = "unavailable"

_PROMPT = (
    "You are verifying a remote interview participant's identity. The first "
    "image is the candidate's profile photo on file; the second image is a "
    "live webcam frame captured during the interview. Decide whether they "
    "show the same person. Be strict about clearly different people, but mark "
    "the result 'ambiguous' when lighting, angle, image quality, or occlusion "
    "prevent a confident decision. Never guess demographics. Respond with "
    'JSON only: {"verdict": "match" | "ambiguous" | "mismatch", '
    '"confidence": 0.0-1.0, "detail": "one short sentence explaining the decision"}.'
)


def _data_url(image: bytes, content_type: str) -> str:
    return f"data:{content_type};base64,{base64.b64encode(image).decode('ascii')}"


def build_verdict(
    status: str, *, confidence: float | None = None, detail: str = ""
) -> dict[str, Any]:
    return {
        "status": status,
        "confidence": confidence,
        "detail": detail,
        "checked_at": datetime.now(UTC).isoformat(),
    }


async def compare_live_image(
    *,
    settings: Settings,
    reference_image: bytes,
    reference_content_type: str,
    live_image: bytes,
    live_content_type: str,
) -> dict[str, Any]:
    """Compare PFP vs live frame with a vision model. Never raises."""
    if not settings.ai_is_configured:
        return build_verdict(
            IDENTITY_UNAVAILABLE, detail="Identity check skipped: AI is not configured."
        )
    try:
        client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.chat.completions.create(
            model=settings.analysis_model,
            messages=[
                {"role": "system", "content": _PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Reference profile photo:"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": _data_url(reference_image, reference_content_type)
                            },
                        },
                        {"type": "text", "text": "Live interview frame:"},
                        {
                            "type": "image_url",
                            "image_url": {"url": _data_url(live_image, live_content_type)},
                        },
                    ],
                },
            ],
            temperature=0,
            max_tokens=200,
            response_format={"type": "json_object"},
        )
        content = (response.choices[0].message.content or "").strip()
        payload = json.loads(content)
        verdict = str(payload.get("verdict") or "").lower()
        if verdict not in (IDENTITY_MATCH, IDENTITY_AMBIGUOUS, IDENTITY_MISMATCH):
            verdict = IDENTITY_AMBIGUOUS
        confidence_raw = payload.get("confidence")
        try:
            confidence = max(0.0, min(1.0, float(confidence_raw)))
        except (TypeError, ValueError):
            confidence = None
        detail = str(payload.get("detail") or "").strip()[:500]
        # Low-confidence matches are ambiguous by policy.
        if verdict == IDENTITY_MATCH and confidence is not None and confidence < 0.6:
            verdict = IDENTITY_AMBIGUOUS
        return build_verdict(verdict, confidence=confidence, detail=detail)
    except Exception as exc:  # network, decoding, quota — never block the interview
        logger.error(f"Identity verification failed: {exc}", exc_info=True)
        return build_verdict(
            IDENTITY_UNAVAILABLE, detail="Identity check could not be completed."
        )
