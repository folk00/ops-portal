from __future__ import annotations

from datetime import date, datetime, time

from pydantic import BaseModel

from app.schemas.common import SiteLite, WorkstreamLite
from app.schemas.tasks import TaskRecord, TaskUpdateRecord


class TechnologyTaskSummary(BaseModel):
    key: str
    label: str
    total_tasks: int
    open_tasks: int
    blocked_tasks: int
    done_tasks: int
    owner_name: str | None = None
    peer_reviewer_name: str | None = None


class SiteListItem(SiteLite):
    active: bool
    open_tasks: int
    blocked_tasks: int
    done_tasks: int
    next_migration_date: date | None = None
    workstreams: list[str]
    technology_summaries: list[TechnologyTaskSummary]


class SiteCreateRequest(BaseModel):
    site_code: str | None = None
    site_name: str
    region: str = "Northeast"
    market: str = "Imported"
    migration_wave: str | None = None
    notes: str | None = None
    scheduled_date: date
    workstream: str = "SDWAN"
    owner_id: int | None = None
    sdwan_owner_id: int | None = None
    sda_owner_id: int | None = None
    wireless_owner_id: int | None = None


class SitePatchRequest(BaseModel):
    scheduled_date: date | None = None
    active: bool | None = None
    notes: str | None = None


class SitePeerReviewerAssignRequest(BaseModel):
    workstream: str
    reviewer_id: int | None = None


class MigrationWindowRecord(BaseModel):
    id: int
    scheduled_date: date
    start_time: time | None = None
    end_time: time | None = None
    status: str
    change_ticket: str | None = None
    notes: str | None = None
    workstream: WorkstreamLite | None = None


class ArtifactRecord(BaseModel):
    id: int
    artifact_type: str
    name: str
    url: str
    notes: str | None = None
    created_at: datetime


class TaskGroup(BaseModel):
    workstream: WorkstreamLite | None = None
    tasks: list[TaskRecord]


class SiteDetailResponse(BaseModel):
    site: SiteListItem
    migration_windows: list[MigrationWindowRecord]
    task_groups: list[TaskGroup]
    updates: list[TaskUpdateRecord]
    artifacts: list[ArtifactRecord]
    recent_changes: list[str]
