"""Interview type / status enums used by the voice agent stack."""

from enum import StrEnum


class InterviewType(StrEnum):
    PROFILE_SCREENING = "profile_screening"
    JOB_INTERVIEW = "job_interview"


class InterviewStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ANALYZED = "evaluated"
    FAILED = "failed"
