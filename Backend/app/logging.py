"""Stdlib logging facade compatible with PTS `from app.logging import logger`."""

from __future__ import annotations

import logging
from typing import Any


class _Logger:
    def __init__(self) -> None:
        self._log = logging.getLogger("thos.ai")
        if not self._log.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(
                logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
            )
            self._log.addHandler(handler)
            self._log.setLevel(logging.INFO)

    def debug(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log.debug(message, *args, **kwargs)

    def info(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log.info(message, *args, **kwargs)

    def warning(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log.warning(message, *args, **kwargs)

    def error(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log.error(message, *args, **kwargs)

    def exception(self, message: str, *args: Any, **kwargs: Any) -> None:
        self._log.exception(message, *args, **kwargs)


logger = _Logger()
