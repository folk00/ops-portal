from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


ReportType = Literal["go_no_go", "executive", "status_update"]


class AiModelOption(BaseModel):
    id: str
    label: str
    vendor: str
    is_default: bool = False


class SiteAiReportRequest(BaseModel):
    model: str | None = None
    report_type: ReportType = "go_no_go"


class SiteAiTechnologySnapshot(BaseModel):
    workstream_name: str
    status: str
    summary: str
    next_step: str


class SiteAiReportResponse(BaseModel):
    site_id: int
    site_name: str
    model: str
    report_type: ReportType
    generated_at: datetime
    headline: str
    strapline: str | None = None
    overall_status: str
    confidence: str
    executive_summary: str
    key_strengths: list[str]
    key_risks: list[str]
    recommended_actions: list[str]
    technology_snapshots: list[SiteAiTechnologySnapshot]
    evidence: list[str]
    raw_text: str | None = None
    daily_limit: int
    daily_used: int
    daily_remaining: int


class AiReportUsageEntry(BaseModel):
    id: int
    actor_label: str
    actor_source: str
    site_id: int
    site_name: str
    model: str
    report_type: ReportType
    status: str
    created_at: datetime
    error_message: str | None = None


class AiReportUsageSummary(BaseModel):
    actor_label: str
    actor_source: str
    daily_limit: int
    used_today: int
    remaining_today: int
    recent_runs: list[AiReportUsageEntry]
