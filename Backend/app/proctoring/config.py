"""Proctoring thresholds, read once from settings (PRD §9). Fixed config: no admin UI."""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Any


@dataclass(frozen=True)
class ProctoringConfig:
    max_warnings: int
    strike_cooldown_seconds: float
    flag_dedup_seconds: float
    gaze_sustained_seconds: float
    glance_seconds: float
    glance_count: int
    glance_window_seconds: float
    reading_min_seconds: float
    reading_reversals: int
    face_missing_seconds: float
    multi_face_seconds: float
    multi_face_confidence: float
    question_grace_seconds: float
    ai_speaking_multiplier: float
    tab_hidden_seconds: float
    blur_seconds: float
    heartbeat_interval_seconds: float
    heartbeat_timeout_seconds: float
    envelope_margin_degrees: float
    fallback_yaw_degrees: float
    fallback_pitch_down_degrees: float
    fallback_pitch_up_degrees: float
    calibration_min_presence: float
    policy_version: str
    accommodation_email: str

    @classmethod
    def from_settings(cls, settings: Any) -> ProctoringConfig:
        # Every field maps 1:1 to a ``proctoring_<name>`` setting.
        return cls(**{f.name: getattr(settings, f"proctoring_{f.name}") for f in fields(cls)})

    def client_view(self) -> dict[str, Any]:
        """The thresholds the browser needs, in the camelCase the frontend uses."""
        return {
            "sustainedS": self.gaze_sustained_seconds,
            "glanceS": self.glance_seconds,
            "glanceCount": self.glance_count,
            "glanceWindowS": self.glance_window_seconds,
            "readingMinS": self.reading_min_seconds,
            "readingReversals": self.reading_reversals,
            "faceMissingS": self.face_missing_seconds,
            "multiFaceS": self.multi_face_seconds,
            "multiFaceConfidence": self.multi_face_confidence,
            "questionGraceS": self.question_grace_seconds,
            "aiSpeakingMultiplier": self.ai_speaking_multiplier,
            "tabHiddenS": self.tab_hidden_seconds,
            "blurS": self.blur_seconds,
            "heartbeatIntervalS": self.heartbeat_interval_seconds,
            "envelopeMarginDeg": self.envelope_margin_degrees,
            "fallbackYawDeg": self.fallback_yaw_degrees,
            "fallbackPitchDownDeg": self.fallback_pitch_down_degrees,
            "fallbackPitchUpDeg": self.fallback_pitch_up_degrees,
            "calibrationMinPresence": self.calibration_min_presence,
            "maxWarnings": self.max_warnings,
            "policyVersion": self.policy_version,
            "accommodationEmail": self.accommodation_email,
        }
