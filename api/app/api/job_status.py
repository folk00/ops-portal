"""Job status polling endpoint.

Clients that cannot use SSE can poll ``GET /api/jobs/{job_id}``
to check background job progress.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.jobs import get_job_status

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/{job_id}")
async def job_status(job_id: str):
    """Return the current status of a background job."""
    status = await get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="Job not found")
    return status
