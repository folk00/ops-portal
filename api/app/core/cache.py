"""Redis-backed caching utilities and event bus.

Provides:
- ``get_redis()``  – lazy singleton connection
- ``cached(prefix, ttl)`` – async decorator for endpoint caching
- ``invalidate(*prefixes)`` – drop cache keys matching prefixes
- ``publish(channel, data)`` – push events via Redis Pub/Sub
"""

from __future__ import annotations

import functools
import hashlib
import json
import logging
from typing import Any, Callable

import redis.asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return (or create) a module-level async Redis connection."""
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            max_connections=20,
        )
    return _pool


async def close_redis() -> None:
    """Gracefully close the Redis pool (call on app shutdown)."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None


def _cache_key(prefix: str, args_hash: str) -> str:
    return f"ops:{prefix}:{args_hash}"


def cached(prefix: str, ttl: int = 30) -> Callable:
    """Decorator that caches the JSON-serialisable return value in Redis.

    Parameters
    ----------
    prefix:
        Namespace prefix, e.g. ``"dashboard"`` or ``"capacity"``.
    ttl:
        Time-to-live in seconds.  Defaults to 30 s.
    """

    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Build a deterministic key from the args (skip DB session objects)
            hashable = json.dumps(
                {k: str(v) for k, v in kwargs.items() if k != "db"},
                sort_keys=True,
            )
            args_hash = hashlib.sha256(hashable.encode()).hexdigest()[:12]
            key = _cache_key(prefix, args_hash)

            try:
                r = await get_redis()
                hit = await r.get(key)
                if hit is not None:
                    return json.loads(hit)
            except Exception:
                logger.debug("cache miss (redis unavailable) key=%s", key)

            result = fn(*args, **kwargs)
            # Support both sync and async wrapped functions
            if hasattr(result, "__await__"):
                result = await result

            try:
                r = await get_redis()
                await r.set(key, json.dumps(result, default=str), ex=ttl)
            except Exception:
                logger.debug("cache set failed key=%s", key)

            return result

        return wrapper

    return decorator


async def invalidate(*prefixes: str) -> int:
    """Delete all cache keys matching the given prefixes.

    Returns the number of deleted keys.
    """
    deleted = 0
    try:
        r = await get_redis()
        for prefix in prefixes:
            pattern = f"ops:{prefix}:*"
            cursor: int | str = 0
            while True:
                cursor, batch = await r.scan(cursor=cursor, match=pattern, count=200)
                if batch:
                    deleted += await r.delete(*batch)
                if cursor == 0:
                    break
    except Exception:
        logger.warning("cache invalidate failed prefixes=%s", prefixes)
    return deleted


async def publish(channel: str, data: dict) -> None:
    """Publish an event dict as JSON on a Redis Pub/Sub channel."""
    try:
        r = await get_redis()
        await r.publish(channel, json.dumps(data, default=str))
    except Exception:
        logger.warning("publish failed channel=%s", channel)
