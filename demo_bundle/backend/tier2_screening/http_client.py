import asyncio
import hashlib
import json
from typing import Any

import httpx

from tier2_screening.cache import AsyncTTLCache
from tier2_screening.config import tier2_settings
from tier2_screening.logging_utils import get_tier2_logger


class AsyncCachedHttpClient:
    def __init__(self):
        self.timeout = tier2_settings.tier2_http_timeout_seconds
        self.max_retries = max(0, tier2_settings.tier2_http_max_retries)
        self.backoff_base = max(0.1, tier2_settings.tier2_http_backoff_base_seconds)
        self.cache = AsyncTTLCache(ttl_seconds=tier2_settings.tier2_cache_ttl_seconds)
        self.log = get_tier2_logger()

    def _cache_key(self, url: str, params: dict[str, Any] | None, headers: dict[str, str] | None) -> str:
        blob = json.dumps(
            {"url": url, "params": params or {}, "headers": headers or {}},
            sort_keys=True,
            default=str,
        )
        return hashlib.sha256(blob.encode("utf-8")).hexdigest()

    async def get_json(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> dict[str, Any] | list[Any] | None:
        key = self._cache_key(url, params, headers)
        cached = await self.cache.get(key)
        if cached is not None:
            return cached

        payload = await self._request("GET", url=url, params=params, headers=headers)
        if payload is None:
            return None
        try:
            data = payload.json()
        except Exception:
            data = None
        if data is not None:
            await self.cache.set(key, data)
        return data

    async def get_text(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> str | None:
        key = self._cache_key(url, params, headers)
        cached = await self.cache.get(key)
        if cached is not None and isinstance(cached, str):
            return cached

        payload = await self._request("GET", url=url, params=params, headers=headers)
        if payload is None:
            return None
        text = payload.text
        await self.cache.set(key, text)
        return text

    async def _request(
        self,
        method: str,
        url: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response | None:
        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
                    response = await client.request(method, url, params=params, headers=headers)
                    if response.status_code == 429 or response.status_code >= 500:
                        raise httpx.HTTPStatusError(
                            "retryable status",
                            request=response.request,
                            response=response,
                        )
                    response.raise_for_status()
                    return response
            except Exception as exc:
                if attempt >= self.max_retries:
                    self.log.warning(
                        "tier2_http_request_failed",
                        extra={"url": url, "attempt": attempt + 1, "error": str(exc)},
                    )
                    return None
                sleep_seconds = self.backoff_base * (2**attempt)
                await asyncio.sleep(sleep_seconds)
        return None

