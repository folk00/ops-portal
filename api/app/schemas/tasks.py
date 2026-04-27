from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import BadgeMeta, SiteLite, UserLite, WorkstreamLite


class TaskRecord(BaseModel):
    id: int
    site: SiteLite
    workstream: WorkstreamLite | None = None
    migration_window_id: int | None = None
    implementation_date: date | None = None
    timeline_label: str
    timeline_order: int
    timeline_window_start: date | None = None
    timeline_window_end: date | None = None
    timeline_window_label: str | None = None
    phase: str | None = None
    title: str
    description: str | None = None
    note_preview: str | None = None
    peer_review_preview: str | None = None
    peer_review_author: UserLite | None = None
    status: BadgeMeta
    priority: BadgeMeta
    owner: UserLite | None = None
    due_date: date | None = None
    completed_at: datetime | None = None
    source_type: str
    source_tab: str | None = None
    source_row_key: str | None = None
    source_column_key: str | None = None
    site_engineer: str | None = None
    is_pristine_seed: bool = False
    comment_count: int = 0
    updated_at: datetime


class TaskPatchRequest(BaseModel):
    status: str | None = None
    owner_id: int | None = None
    due_date: date | None = None
    priority: str | None = None
    description: str | None = None
    comment: str | None = None
    peer_review_comment: str | None = None
    peer_review_author_id: int | None = None


class BulkUpdateRequest(BaseModel):
    task_ids: list[int] = Field(min_length=1)
    status: str | None = None
    owner_id: int | None = None
    due_date: date | None = None
    priority: str | None = None
    description: str | None = None
    comment: str | None = None


class TaskUpdateRecord(BaseModel):
    id: int
    task_id: int
    update_type: str
    body: str
    created_at: datetime
    author: UserLite | None = None


class TaskUpdateCreate(BaseModel):
    task_id: int
    author_id: int | None = None
    update_type: str = "COMMENT"
    body: str
