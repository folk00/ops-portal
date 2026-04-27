from __future__ import annotations

from datetime import datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.people import Call, PTO
from app.models.planning import MigrationWindow
from app.schemas.calendar import CalendarEvent, CalendarSummary
from app.utils.serializers import site_lite, user_lite, workstream_lite


def _combine(date_value, time_value):
    return datetime.combine(date_value, time_value or time(9, 0), tzinfo=timezone.utc)


def get_calendar_summary(db: Session) -> CalendarSummary:
    windows = db.scalars(
        select(MigrationWindow)
        .options(selectinload(MigrationWindow.site), selectinload(MigrationWindow.workstream))
        .order_by(MigrationWindow.scheduled_date.asc())
    ).all()
    calls = db.scalars(
        select(Call)
        .options(selectinload(Call.owner), selectinload(Call.related_site))
        .order_by(Call.start_datetime.asc())
    ).all()
    ptos = db.scalars(select(PTO).options(selectinload(PTO.user)).order_by(PTO.start_date.asc())).all()

    events = [
        CalendarEvent(
            id=f"window-{window.id}",
            type="migration_window",
            title=f"{window.site.site_name} migration window",
            start=_combine(window.scheduled_date, window.start_time),
            end=_combine(window.scheduled_date, window.end_time or time(23, 30)),
            owner=None,
            site=site_lite(window.site),
            workstream=workstream_lite(window.workstream),
            notes=window.notes,
            status=window.status.value,
        )
        for window in windows
    ]
    events.extend(
        CalendarEvent(
            id=f"call-{call.id}",
            type="call",
            title=call.title,
            start=call.start_datetime,
            end=call.end_datetime,
            owner=user_lite(call.owner),
            site=site_lite(call.related_site) if call.related_site else None,
            workstream=None,
            notes=call.notes,
            status=call.call_type.value,
        )
        for call in calls
    )
    events.extend(
        CalendarEvent(
            id=f"pto-{pto.id}",
            type="pto",
            title=f"{pto.user.name} · {pto.pto_type.value}",
            start=_combine(pto.start_date, time(0, 0)),
            end=_combine(pto.end_date, time(23, 59)),
            owner=user_lite(pto.user),
            site=None,
            workstream=None,
            notes=pto.notes,
            status=pto.pto_type.value,
        )
        for pto in ptos
    )
    events.sort(key=lambda item: item.start)
    return CalendarSummary(events=events)

