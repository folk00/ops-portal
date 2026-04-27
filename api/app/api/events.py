"""Server-Sent Events (SSE) endpoint.

Clients connect to ``GET /api/events`` and receive a real-time stream
of JSON events published through the Redis Pub/Sub bus.
"""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter
from sse_starlette.sse import EventSourceResponse

from app.core.cache import get_redis

logger = logging.getLogger(__name__)

router = APIRouter(tags=["events"])

CHANNELS = ["ops:jobs"]


async def _event_generator():
    """Yield SSE events from Redis Pub/Sub channels."""
    r = await get_redis()
    pubsub = r.pubsub()
    await pubsub.subscribe(*CHANNELS)
    try:
        while True:
            msg = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0
            )
            if msg and msg["type"] == "message":
                data = msg["data"]
                # data is already a string because decode_responses=True
                try:
                    parsed = json.loads(data)
                    event_type = parsed.pop("_event", "message")
                except (json.JSONDecodeError, AttributeError):
                    event_type = "message"
                    parsed = {"raw": data}
                yield {
                    "event": event_type,
                    "data": json.dumps(parsed, default=str),
                }
            else:
                # Send a keep-alive comment every ~1 s to prevent proxy
                # timeouts and detect dropped connections.
                yield {"comment": "keep-alive"}
            await asyncio.sleep(0.05)
    finally:
        await pubsub.unsubscribe(*CHANNELS)
        await pubsub.aclose()


@router.get("/events")
async def event_stream():
    """SSE endpoint – streams real-time events to the browser."""
    return EventSourceResponse(_event_generator())
