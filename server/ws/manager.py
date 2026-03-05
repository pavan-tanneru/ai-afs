"""WebSocket connection manager for real-time pipeline progress updates."""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import WebSocket
from core.logging_config import get_logger

logger = get_logger(__name__)


class ConnectionManager:
    """Manages per-session WebSocket connections and queued messages."""

    def __init__(self) -> None:
        # session_id → active WebSocket
        self._connections: dict[str, WebSocket] = {}
        # session_id → buffered messages (in case client reconnects)
        self._message_buffer: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[session_id] = websocket
        logger.info("ws_connected", session_id=session_id)

        # Flush buffered messages
        buffered = self._message_buffer.pop(session_id, [])
        for msg in buffered:
            await self._send(session_id, msg)

    async def disconnect(self, session_id: str) -> None:
        async with self._lock:
            self._connections.pop(session_id, None)
        logger.info("ws_disconnected", session_id=session_id)

    async def send(self, session_id: str, message: dict[str, Any]) -> None:
        """Send a message to a specific session. Buffers if client not yet connected."""
        if session_id in self._connections:
            await self._send(session_id, message)
        else:
            # Buffer for when client connects / reconnects
            self._message_buffer[session_id].append(message)

    async def _send(self, session_id: str, message: dict[str, Any]) -> None:
        ws = self._connections.get(session_id)
        if ws is None:
            self._message_buffer[session_id].append(message)
            return
        try:
            await ws.send_json(message)
        except Exception as e:
            logger.warning("ws_send_error", session_id=session_id, error=str(e))
            async with self._lock:
                self._connections.pop(session_id, None)
            self._message_buffer[session_id].append(message)


# Singleton used across the entire application
manager = ConnectionManager()
