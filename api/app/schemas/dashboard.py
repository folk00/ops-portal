from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.common import BadgeMeta, SiteLite, UserLite, WorkstreamLite


class MetricCard(BaseModel):
    label: str
    value: int
    change_hint: str | None = None


class WorkstreamBreakdown(BaseModel):
    workstream: WorkstreamLite
    sites_in_play: int
    windows_this_week: int
    this_week_examples: list[str]
    tminus_due_now_sites: int
    tminus_due_now_examples: list[str]
    needs_owner_sites: int
    needs_owner_examples: list[str]


class WorkloadSnapshot(BaseModel):
    user: UserLite
    assigned_sites: int
    windows_this_week: int
    tminus_due_now_sites: int
    top_sites: list[str]
    load_label: str


class RecentUpdate(BaseModel):
    id: int
    task_id: int
    task_title: str
    site_name: str
    body: str
    update_type: str
    created_at: datetime
    author: UserLite | None = None


class UpcomingMigration(BaseModel):
    id: int
    site: SiteLite
    scheduled_date: date
    status: str
    workstream: WorkstreamLite | None = None
    change_ticket: str | None = None


class RiskSite(BaseModel):
    site: SiteLite
    blocked_tasks: int
    due_this_week: int
    next_window: date | None = None
    risk_label: str


class DashboardSummary(BaseModel):
    metrics: list[MetricCard]
    tasks_by_workstream: list[WorkstreamBreakdown]
    workload: list[WorkloadSnapshot]
    recent_updates: list[RecentUpdate]
    upcoming_migrations: list[UpcomingMigration]
    at_risk_sites: list[RiskSite]
    system_views: list[dict]
    last_updated: datetime
