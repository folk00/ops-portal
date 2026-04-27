"""Lightweight background job runner backed by Redis state.

Jobs are executed in a thread-pool via ``asyncio.to_thread`` so they
can call synchronous DB / file-processing code without blocking the
event loop.  State is stored in Redis hashes so any API instance can
read the current status.

Usage
-----
::

    from app.core.jobs import submit_job, get_job_status

    job_id = await submit_job("import", _do_import, db, payload, filename)
    status = await get_job_status(job_id)
"""

from __future__ import annotations

import asyncio
import logging
import traceback
import uuid
from typing import Any, Callable

from app.core.cache import get_redis, publish

logger = logging.getLogger(__name__)

CHANNEL_JOBS = "ops:jobs"


async def submit_job(
    kind: str,
    fn: Callable[..., Any],
    *args: Any,
) -> str:
    """Run *fn(*args)* in a background thread and track progress in Redis.

    Returns the ``job_id`` immediately.
    """
    job_id = uuid.uuid4().hex[:16]
    r = await get_redis()
    await r.hset(
        f"job:{job_id}",
        mapping={"kind": kind, "status": "pending", "progress": "0"},
    )
    await r.expire(f"job:{job_id}", 3600)

    asyncio.get_running_loop().create_task(_run(job_id, fn, *args))
    return job_id


async def _run(job_id: str, fn: Callable[..., Any], *args: Any) -> None:
    r = await get_redis()
    await r.hset(f"job:{job_id}", "status", "running")
    await publish(CHANNEL_JOBS, {"job_id": job_id, "status": "running"})
    try:
        result = await asyncio.to_thread(fn, *args)
        await r.hset(
            f"job:{job_id}",
            mapping={
                "status": "done",
                "progress": "100",
                "result": str(result) if result is not None else "",
            },
        )
        await publish(CHANNEL_JOBS, {"job_id": job_id, "status": "done"})
    except Exception as exc:
        tb = traceback.format_exc()
        logger.error("job %s failed: %s\n%s", job_id, exc, tb)
        await r.hset(
            f"job:{job_id}",
            mapping={"status": "failed", "error": str(exc)[:500]},
        )
        await publish(CHANNEL_JOBS, {"job_id": job_id, "status": "failed", "error": str(exc)[:200]})


async def get_job_status(job_id: str) -> dict[str, str]:
    """Return the current state hash for *job_id*, or ``{}`` if unknown."""
    r = await get_redis()
    data = await r.hgetall(f"job:{job_id}")
    return dict(data) if data else {}
