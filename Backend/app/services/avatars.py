"""Profile photo (PFP) storage on local disk.

Avatars live under ``settings.avatars_dir`` as ``<user_id>.<ext>``. The stored
``users.avatar_path`` holds the file name only, so the directory can move via
configuration without breaking existing rows.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import Settings
from app.core.errors import ApiError

MAX_AVATAR_BYTES = 5 * 1024 * 1024  # 5 MB

_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _avatars_root(settings: Settings) -> Path:
    root = Path(settings.avatars_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_avatar(
    settings: Settings, *, user_id: str, data: bytes, content_type: str | None
) -> str:
    """Validate and persist an avatar; returns the stored file name."""
    extension = _CONTENT_TYPES.get((content_type or "").split(";")[0].strip().lower())
    if extension is None:
        raise ApiError(
            status_code=422,
            code="unsupported_avatar_type",
            message="Profile photo must be a JPEG, PNG, or WebP image.",
        )
    if not data:
        raise ApiError(
            status_code=422,
            code="empty_avatar",
            message="The uploaded image is empty.",
        )
    if len(data) > MAX_AVATAR_BYTES:
        raise ApiError(
            status_code=422,
            code="avatar_too_large",
            message="Profile photo must be 5 MB or smaller.",
        )
    root = _avatars_root(settings)
    # Remove older uploads for this user regardless of extension.
    for old in root.glob(f"{user_id}.*"):
        old.unlink(missing_ok=True)
    file_name = f"{user_id}{extension}"
    (root / file_name).write_bytes(data)
    return file_name


def remove_avatar(settings: Settings, *, avatar_path: str | None) -> None:
    if not avatar_path:
        return
    root = _avatars_root(settings)
    target = (root / Path(avatar_path).name).resolve()
    if target.parent == root.resolve() and target.exists():
        target.unlink()


def resolve_avatar(
    settings: Settings, *, avatar_path: str | None
) -> tuple[Path, str] | None:
    """Resolve a stored avatar file name to (path, content_type)."""
    if not avatar_path:
        return None
    root = _avatars_root(settings)
    # Guard against path traversal: only plain file names are accepted.
    file_name = Path(avatar_path).name
    target = (root / file_name).resolve()
    if target.parent != root.resolve() or not target.exists():
        return None
    content_type = {
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(target.suffix.lower(), "application/octet-stream")
    return target, content_type
