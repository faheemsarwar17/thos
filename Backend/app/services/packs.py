"""Domain Pack Registry.

Loads pack manifests from the domain-packs directory, validates them
against the engine contract, and serves pack content to engine
services. Engine code never imports pack content directly (rules.md
§1.1); everything flows through this registry.
"""

import json
from pathlib import Path
from typing import Any

from app.core.errors import ApiError

REQUIRED_MANIFEST_KEYS = [
    "pack_id",
    "pack_version",
    "display_name",
    "ontology",
    "matching_weights",
    "profile_interview",
    "applied_interview",
    "evaluation_rubric",
]

SEMVER_PARTS = 3


class PackValidationError(ApiError):
    def __init__(self, message: str) -> None:
        super().__init__(status_code=422, code="invalid_domain_pack", message=message)


def validate_manifest(manifest: dict[str, Any]) -> None:
    for key in REQUIRED_MANIFEST_KEYS:
        if key not in manifest:
            raise PackValidationError(f"Manifest is missing required key '{key}'.")
    version = str(manifest["pack_version"])
    parts = version.split(".")
    if len(parts) != SEMVER_PARTS or not all(part.isdigit() for part in parts):
        raise PackValidationError(
            f"pack_version '{version}' must be a semantic version like 1.0.0."
        )
    for section in ("profile_interview", "applied_interview"):
        block = manifest[section]
        questions = block.get("questions")
        if not isinstance(questions, list) or not questions:
            raise PackValidationError(f"{section}.questions must be a non-empty list.")
        for question in questions:
            for key in ("id", "prompt", "competency"):
                if not question.get(key):
                    raise PackValidationError(
                        f"A question in {section} is missing required field '{key}'."
                    )
        if block.get("task_style") not in ("scenario", "code"):
            raise PackValidationError(
                f"{section}.task_style must be 'scenario' or 'code'."
            )
    dimensions = manifest["evaluation_rubric"].get("dimensions")
    if not isinstance(dimensions, list) or not dimensions:
        raise PackValidationError("evaluation_rubric.dimensions must be a non-empty list.")


class PackRegistry:
    def __init__(self, packs_path: str) -> None:
        self.packs_path = Path(packs_path)

    def available_packs(self) -> list[dict[str, Any]]:
        manifests = []
        if not self.packs_path.exists():
            return manifests
        for manifest_file in sorted(self.packs_path.glob("*/manifest.json")):
            try:
                manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
                validate_manifest(manifest)
            except (json.JSONDecodeError, ApiError):
                continue
            manifests.append(manifest)
        return manifests

    def load(self, pack_id: str) -> dict[str, Any]:
        manifest_file = self.packs_path / pack_id / "manifest.json"
        if not manifest_file.exists():
            raise ApiError(
                status_code=404,
                code="domain_pack_not_found",
                message=f"No domain pack named '{pack_id}' is installed.",
            )
        try:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise PackValidationError(
                f"The manifest for '{pack_id}' is not valid JSON."
            ) from exc
        validate_manifest(manifest)
        return manifest
