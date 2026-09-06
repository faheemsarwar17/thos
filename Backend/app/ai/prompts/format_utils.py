"""Helpers for safely injecting dynamic text into str.format templates."""

from typing import Any


def escape_format_braces(value: Any) -> str:
    """Escape curly braces so user/LLM content cannot break .format() templates."""
    if value is None:
        return ""
    return str(value).replace("{", "{{").replace("}", "}}")


def escape_format_kwargs(data: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with all values stringified and brace-escaped for .format()."""
    return {key: escape_format_braces(value) for key, value in data.items()}
