from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import SiteLite, UserLite, WorkstreamLite


class CalendarEvent(BaseModel):
    id: str
    type: str
    title: str
    start: datetime
    end: datetime
    owner: UserLite | None = None
    site: SiteLite | None = None
    workstream: WorkstreamLite | None = None
    notes: str | None = None
    status: str | None = None


class CalendarSummary(BaseModel):
    events: list[CalendarEvent]

