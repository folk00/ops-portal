from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.schemas.common import DateRange, UserLite


class UserAttentionSite(BaseModel):
    site_name: str
    next_window: date | None = None
    overdue_tasks: int
    due_this_week: int
    overdue_task_titles: list[str] = []
    due_this_week_task_titles: list[str] = []


class UserRecord(UserLite):
    active: bool
    open_tasks: int
    blocked_tasks: int
    overdue_tasks: int
    due_this_week: int
    assigned_sites: int
    site_names: list[str]
    attention_sites: list[UserAttentionSite]
    workstreams: list[str]
    current_pto: list[DateRange]
