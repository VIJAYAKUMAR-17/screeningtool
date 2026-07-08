import asyncio
import time
from typing import Any


class AsyncTTLCache:
    def __init__(self, ttl_seconds: int):
        self.ttl_seconds = ttl_seconds
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, payload = item
            if expires_at < time.time():
                self._store.pop(key, None)
                return None
            return payload

    async def set(self, key: str, payload: Any):
        async with self._lock:
            self._store[key] = (time.time() + self.ttl_seconds, payload)

