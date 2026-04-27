from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from app.schemas.common import DateRange, UserLite


class CapacitySiteFocus(BaseModel):
    site_name: str
    next_window: date | None = None
    open_tasks: int
    pending_tasks: int
    overdue_tasks: int
    due_this_week: int


class CapacityPerson(BaseModel):
    user: UserLite
    open_tasks: int
    blocked_tasks: int
    overdue_tasks: int
    assigned_sites: int
    site_names: list[str]
    site_summaries: list[str]
    focus_sites: list[CapacitySiteFocus]
    workstreams: list[str]
    due_this_week: int
    pto: list[DateRange]
    weekly_hours: int
    allocation_percent: int
    load_label: str


class CapacitySummary(BaseModel):
    people: list[CapacityPerson]
    active_people_count: int
    focus_site_count: int
    overloaded_count: int
    available_count: int
    pto_this_week: int
