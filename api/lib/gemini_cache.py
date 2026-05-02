"""
Gemini cached_content manager (Phase 2.4).

Reuses a static system_instruction across many expand calls via Gemini's
`cachedContents` API. Cached input tokens cost ~25% of regular input price
and the model also delivers them faster (no need to re-process).

Design:
  - Cache key = (model_id, language). Static portion of system_instruction
    depends only on these two — same across all (framework, intent, depth)
    in our prompt split.
  - One in-memory map per process (`_handles`). LRU caps at MAX_CACHE_HANDLES
    to avoid unbounded growth on a long-lived dev/prod server.
  - TTL = DEFAULT_TTL_SECONDS (Gemini default 1h). Stale handles return cache
    miss errors at use time → caller catches and retries without cache.
  - Min token threshold: Gemini Flash requires ≥4096 cached tokens. We don't
    pre-count — instead we let `caches.create()` fail and degrade gracefully.
  - Per-API-key isolation: cache key includes a hash of the API key. BYOK
    users have private cache (Gemini side); server-key users share.

Failures are NEVER fatal — every cache operation has a try/log/None path
so expansion still works without caching.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# In-process limits
MAX_CACHE_HANDLES = 30
DEFAULT_TTL_SECONDS = 3600  # 1 hour
# 살짝 짧게 잡아 만료 직전 cache miss를 미리 감지 (서버 시간 vs Gemini 시간차).
LOCAL_EXPIRY_BUFFER_SECONDS = 60


@dataclass
class _Entry:
    name: str          # Gemini resource name e.g. "cachedContents/abc123"
    created_at: float  # local monotonic
    ttl_seconds: int

    def is_local_expired(self) -> bool:
        return (time.monotonic() - self.created_at) > (
            self.ttl_seconds - LOCAL_EXPIRY_BUFFER_SECONDS
        )


def _key(model_id: str, language: str, api_key: Optional[str]) -> str:
    """Hash the API key so we don't store raw keys in memory."""
    key_hash = hashlib.sha256((api_key or "server").encode()).hexdigest()[:12]
    return f"{model_id}|{language}|{key_hash}"


class CacheManager:
    """
    Process-local, async-safe cache handle manager.

    Use via the singleton `cache_manager` exported below.
    """

    def __init__(self) -> None:
        self._handles: "OrderedDict[str, _Entry]" = OrderedDict()
        # In-flight create()s shared across concurrent get_or_create calls
        # so two parallel requests with the same key don't both hit the API.
        self._inflight: dict[str, asyncio.Future[Optional[str]]] = {}
        self._lock = asyncio.Lock()

    async def get_or_create(
        self,
        *,
        client,  # google.genai.Client
        model_id: str,
        language: str,
        system_instruction: str,
        api_key: Optional[str] = None,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
    ) -> Optional[str]:
        """
        Return a Gemini cache resource name that wraps `system_instruction`,
        creating one if needed. Returns None when caching is unavailable
        (model unsupported, content too small, transient API error, ...).
        Caller passes the returned name to `generate_content` via
        `cached_content=<name>` and OMITS its own system_instruction.
        """
        key = _key(model_id, language, api_key)

        # Decide under lock: hit / share-inflight / be-the-creator.
        async with self._lock:
            entry = self._handles.get(key)
            if entry and not entry.is_local_expired():
                self._handles.move_to_end(key)
                return entry.name
            existing = self._inflight.get(key)
            if existing is not None:
                # Another caller is already creating this cache — share the
                # awaitable. Drop the lock, wait for it.
                fut = existing
            else:
                # We become the creator. Register a future so concurrent
                # callers join us instead of issuing duplicate API requests.
                fut = asyncio.get_running_loop().create_future()
                self._inflight[key] = fut

        if fut is not existing:
            # We are the creator path — call API outside the lock, then
            # publish the result to all waiters.
            name: Optional[str] = None
            try:
                cached = await client.aio.caches.create(
                    model=model_id,
                    config={
                        "system_instruction": system_instruction,
                        "ttl": f"{ttl_seconds}s",
                        "display_name": f"expand-{key[:24]}",
                    },
                )
                name = getattr(cached, "name", None)
                if not name:
                    logger.warning("Cache create returned no name for %s", key)
            except Exception as e:  # noqa: BLE001 — degrade gracefully on any error
                # Common errors: "Cached content is too small" (< model min),
                # "Model does not support caching" (preview), quota, network.
                logger.info("Cache create skipped (%s): %s", key, e)
                name = None

            async with self._lock:
                if name:
                    self._handles[key] = _Entry(
                        name=name,
                        created_at=time.monotonic(),
                        ttl_seconds=ttl_seconds,
                    )
                    self._handles.move_to_end(key)
                    while len(self._handles) > MAX_CACHE_HANDLES:
                        self._handles.popitem(last=False)
                self._inflight.pop(key, None)
                if not fut.done():
                    fut.set_result(name)
            return name

        # Waiter path — block on the in-flight future.
        return await fut

    async def invalidate(
        self, *, model_id: str, language: str, api_key: Optional[str] = None
    ) -> None:
        """Drop the local handle so the next call recreates the cache."""
        key = _key(model_id, language, api_key)
        async with self._lock:
            self._handles.pop(key, None)


# Process-wide singleton — import this from expander.
cache_manager = CacheManager()
