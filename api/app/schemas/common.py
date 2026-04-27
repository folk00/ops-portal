from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class HealthResponse(BaseModel):
    ok: bool
    app: str
    environment: str
    timestamp: datetime


class BadgeMeta(BaseModel):
    value: str
    label: str
    color: str


class UserLite(BaseModel):
    id: int | None = None
    name: str | None = None
    email: str | None = None
    team: str | None = None
    role: str | None = None
    allocation_percent: int | None = None
    weekly_hours: int | None = None


class WorkstreamLite(BaseModel):
    id: int | None = None
    key: str | None = None
    name: str | None = None


class SiteLite(BaseModel):
    id: int
    site_code: str
    site_name: str
    region: str
    market: str
    migration_wave: str | None = None


class DateRange(BaseModel):
    start: date
    end: date
