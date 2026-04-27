from __future__ import annotations

from datetime import date

from pydantic import BaseModel


class HealthBreakdown(BaseModel):
    completion_pct: float
    timeliness_pct: float
    readiness_pct: float
    coverage_pct: float


class SiteHealthScore(BaseModel):
    site_id: int
    site_code: str
    site_name: str
    score: int
    grade: str
    grade_color: str
    label: str
    breakdown: HealthBreakdown
    next_window_date: date | None


class VelocityEstimate(BaseModel):
    site_id: int
    site_name: str
    total_tasks: int
    done_tasks: int
    remaining_tasks: int
    velocity_per_week: float
    estimated_completion_date: date | None
    next_window_date: date | None
    days_until_window: int | None
    on_track: bool
    confidence: str


class TriageDriverTask(BaseModel):
    task_id: int
    workstream_name: str | None
    phase: str | None
    title: str
    status_label: str
    priority_label: str
    owner_name: str | None
    due_date: date | None
    days_overdue: int


class TriageTechnologyReadiness(BaseModel):
    workstream_key: str
    workstream_name: str
    t2_due_total: int
    t2_done_total: int
    t2_open_total: int
    t2_status: str
    peer_review_total: int
    peer_review_done_total: int
    peer_review_open_total: int
    peer_review_status: str
    # Milestone tracker (T-6 through T-0)
    current_milestone: str | None  # e.g. "T-4" - furthest completed milestone
    expected_milestone: str | None  # e.g. "T-2" - where they should be given days_until_window
    milestones_behind: int  # 0 = on track, positive = behind
    milestone_detail: list[dict]  # [{label, order, total, done, status}, ...]


class TriageSiteSummary(BaseModel):
    site_id: int
    site_name: str
    site_code: str
    region: str
    next_window_date: date | None
    next_window_status: str | None
    days_until_window: int | None
    window_bucket: str
    health_score: int
    health_grade: str
    open_tasks: int
    critical_tasks: int
    overdue_tasks: int
    overdue_high_tasks: int
    due_this_week_tasks: int
    t2_open_total: int
    t2_open_workstreams: int
    peer_review_blocked_workstreams: int
    owner_gap_workstreams: int
    days_since_activity: int | None
    urgency_score: int
    reasons: list[str]
    technology_readiness: list[TriageTechnologyReadiness]
    drivers: list[TriageDriverTask]
    # Go/No-Go forecast (replaces urgency_score for display)
    forecast: str  # "go" | "at_risk" | "no_go"
    forecast_color: str  # "emerald" | "amber" | "rose"
    top_blocker: str | None  # Human-readable single sentence
    runway_summary: str | None  # "6 tasks left · 2.1/wk · 4d until MW"
