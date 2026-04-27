from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.ops import SiteHealthScore, TriageSiteSummary, VelocityEstimate
from app.services.ops import (
    get_health_scores,
    get_site_health,
    get_site_velocity,
    get_triage_sites,
)
from app.services.tasks import list_tasks

router = APIRouter(tags=["ops"])

TRIAGE_REASON_LABELS = {
    "in_flight": "In Flight",
    "window_this_week": "Window This Week",
    "window_next_two_weeks": "Window Next 2 Weeks",
    "critical_no_owner": "Critical - No Owner",
    "critical_open": "Critical Open",
    "overdue_high": "Overdue High Priority",
    "overdue": "Overdue",
    "t2_gap": "T-2 Work Still Open",
    "peer_review_gap": "Peer Review Not Ready",
    "owner_gap": "Owner Gaps",
    "due_this_week": "Due This Week",
    "silent_site": "Silent Site",
}


@router.get("/health-scores", response_model=list[SiteHealthScore])
def all_health_scores(db: Session = Depends(get_db)) -> list[SiteHealthScore]:
    """Composite 0-100 health score for every active site, sorted lowest first."""
    return get_health_scores(db)


@router.get("/health/{site_id}", response_model=SiteHealthScore)
def site_health(site_id: int, db: Session = Depends(get_db)) -> SiteHealthScore:
    """Health score breakdown for a single site."""
    result = get_site_health(db, site_id)
    if not result:
        raise HTTPException(status_code=404, detail="Site not found")
    return result


@router.get("/velocity/{site_id}", response_model=VelocityEstimate)
def site_velocity(site_id: int, db: Session = Depends(get_db)) -> VelocityEstimate:
    """Task completion velocity and projected migration-readiness date."""
    result = get_site_velocity(db, site_id)
    if not result:
        raise HTTPException(status_code=404, detail="Site not found")
    return result


@router.get("/triage", response_model=list[TriageSiteSummary])
def triage(db: Session = Depends(get_db)) -> list[TriageSiteSummary]:
    """
    Site-level operational triage for active windows.

    Focuses on sites that are in flight or approaching a migration window and
    surfaces the tracker signals that actually need attention.
    """
    return get_triage_sites(db)


@router.get("/triage/export")
def export_triage_csv(db: Session = Depends(get_db)) -> StreamingResponse:
    """Download the current triage view as a CSV file."""
    sites = get_triage_sites(db)

    def _generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "Site",
                "Site Code",
                "Region",
                "Next Window",
                "Window Status",
                "Days To Window",
                "Health Score",
                "Open Tasks",
                "Critical Tasks",
                "Overdue Tasks",
                "Overdue High Tasks",
                "Due This Week",
                "T-2 Open Tasks",
                "T-2 Open Workstreams",
                "Peer Review Blocked Workstreams",
                "Owner Gap Workstreams",
                "Days Since Activity",
                "Urgency Score",
                "Reasons",
                "Technology Readiness",
                "Driver Tasks",
            ]
        )
        yield buf.getvalue()

        for site in sites:
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(
                [
                    site.site_name,
                    site.site_code,
                    site.region,
                    site.next_window_date or "",
                    site.next_window_status or "",
                    site.days_until_window if site.days_until_window is not None else "",
                    site.health_score,
                    site.open_tasks,
                    site.critical_tasks,
                    site.overdue_tasks,
                    site.overdue_high_tasks,
                    site.due_this_week_tasks,
                    site.t2_open_total,
                    site.t2_open_workstreams,
                    site.peer_review_blocked_workstreams,
                    site.owner_gap_workstreams,
                    site.days_since_activity if site.days_since_activity is not None else "",
                    site.urgency_score,
                    "; ".join(TRIAGE_REASON_LABELS.get(reason, reason) for reason in site.reasons),
                    "; ".join(
                        f"{item.workstream_name}: T-2 {item.t2_done_total}/{item.t2_due_total}, PR {item.peer_review_status}"
                        for item in site.technology_readiness
                    ),
                    "; ".join(
                        f"{driver.workstream_name or 'General'}: {driver.title}"
                        for driver in site.drivers
                    ),
                ]
            )
            yield buf.getvalue()

    return StreamingResponse(
        _generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=triage_export.csv"},
    )


@router.get("/tasks/export")
def export_tasks_csv(
    status: str | None = None,
    owner_id: int | None = None,
    workstream: str | None = None,
    priority: str | None = None,
    site_id: int | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """
    Download the filtered task list as a CSV file.

    Accepts the same filter parameters as GET /tasks.
    """
    tasks = list_tasks(
        db,
        status=status,
        owner_id=owner_id,
        workstream=workstream,
        priority=priority,
        site_id=site_id,
    )

    def _generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "ID",
                "Site",
                "Site Code",
                "Region",
                "Workstream",
                "Phase",
                "Title",
                "Status",
                "Priority",
                "Owner",
                "Due Date",
                "Implementation Date",
                "Source Type",
                "Source Tab",
                "Updated At",
            ]
        )
        yield buf.getvalue()

        for task in tasks:
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(
                [
                    task.id,
                    task.site.site_name,
                    task.site.site_code,
                    task.site.region,
                    task.workstream.name if task.workstream else "",
                    task.phase or "",
                    task.title,
                    task.status.label,
                    task.priority.label,
                    task.owner.name if task.owner else "",
                    task.due_date or "",
                    task.implementation_date or "",
                    task.source_type,
                    task.source_tab or "",
                    task.updated_at.date() if task.updated_at else "",
                ]
            )
            yield buf.getvalue()

    return StreamingResponse(
        _generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tasks_export.csv"},
    )
