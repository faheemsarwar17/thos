"""WebSocket connection manager for voice-interview telemetry."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket

from app.logging import logger


class ConnectionManager:
    """Manages active websocket connections per interview session."""

    def __init__(self) -> None:
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.pending_messages: dict[str, list[dict[str, Any]]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.setdefault(session_id, []).append(websocket)
            active_count = len(self.active_connections[session_id])
            pending = self.pending_messages.pop(session_id, [])

        logger.info(f"WebSocket connected for session {session_id}. Active: {active_count}")

        for idx, message in enumerate(pending):
            try:
                await websocket.send_text(json.dumps(message))
            except Exception as exc:
                logger.error(f"Failed to flush pending websocket message: {exc}")
                async with self._lock:
                    self.pending_messages.setdefault(session_id, []).extend(pending[idx:])
                    self._trim_pending_locked(session_id)
                break

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        if session_id in self.active_connections:
            if websocket in self.active_connections[session_id]:
                self.active_connections[session_id].remove(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]
        logger.info(f"WebSocket disconnected from session {session_id}.")

    async def send_message(self, session_id: str, message: dict[str, Any]) -> None:
        async with self._lock:
            connections = list(self.active_connections.get(session_id, []))

        if not connections:
            await self._store_pending_message(session_id, message)
            return

        payload = json.dumps(message)
        failed: list[WebSocket] = []
        sent_count = 0

        for connection in connections:
            try:
                await connection.send_text(payload)
                sent_count += 1
            except Exception as exc:
                logger.error(f"Failed to send websocket message: {exc}")
                failed.append(connection)

        if failed:
            async with self._lock:
                active = self.active_connections.get(session_id, [])
                self.active_connections[session_id] = [
                    conn for conn in active if conn not in failed
                ]
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]

        if sent_count == 0:
            await self._store_pending_message(session_id, message)

    async def _store_pending_message(self, session_id: str, message: dict[str, Any]) -> None:
        async with self._lock:
            self.pending_messages.setdefault(session_id, []).append(dict(message))
            self._trim_pending_locked(session_id)

    def _trim_pending_locked(self, session_id: str) -> None:
        max_pending = 50
        if len(self.pending_messages.get(session_id, [])) > max_pending:
            self.pending_messages[session_id] = self.pending_messages[session_id][-max_pending:]


_manager = ConnectionManager()


def get_websocket_manager() -> ConnectionManager:
    return _manager
