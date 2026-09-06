"""Structured CV schema used for parsing once and embedding for matching."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CvSection(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    content: list[str] = Field(default_factory=list, max_length=200)


class ParsedCv(BaseModel):
    """Canonical CV representation stored on the candidate profile.

    Matching embeds this structure (not the raw file) so parse cost is paid
    once per upload/update, not per job.
    """

    sections: list[CvSection] = Field(default_factory=list, max_length=40)
    source_filename: str | None = Field(default=None, max_length=255)
    parser: str = Field(default="heuristic", max_length=40)
    parsed_at: str = ""


class ProfileHints(BaseModel):
    """Fields extracted from a parsed CV to seed the editable profile."""

    headline: str | None = None
    summary: str | None = None
    skills: list[str] = Field(default_factory=list)
    credentials: list[str] = Field(default_factory=list)
    experiences: list[str] = Field(default_factory=list)
