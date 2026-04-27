from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import TaskStatus
from app.core.tracker_rules import filter_user_facing_tasks
from app.models.execution import Task
from app.models.people import Assignment, PTO, User
from app.models.planning import Site
from app.schemas.capacity import CapacityPerson, CapacitySiteFocus, CapacitySummary
from app.schemas.common import DateRange
from app.utils.serializers import user_lite
def _site_is_in_focus(site: Site | None, focus_start: date) -> bool:
    return bool(site and any(window.scheduled_date >= focus_start for window in site.migration_windows))


def _site_next_window(site: Site, focus_start: date) -> date | None:
    return min((window.scheduled_date for window in site.migration_windows if window.scheduled_date >= focus_start), default=None)


def get_capacity_summary(db: Session) -> CapacitySummary:
    users = db.scalars(
        select(User)
        .options(
            selectinload(User.owned_tasks).selectinload(Task.site).selectinload(Site.migration_windows),
            selectinload(User.owned_tasks).selectinload(Task.workstream),
            selectinload(User.ptos),
            selectinload(User.assignments).selectinload(Assignment.site).selectinload(Site.migration_windows),
            selectinload(User.assignments).selectinload(Assignment.workstream),
        )
        .order_by(User.name.asc())
    ).unique().all()
    today = date.today()
    focus_start = today
    week_end = today.fromordinal(today.toordinal() + (6 - today.weekday()))

    people = []
    overloaded = 0
    available = 0
    pto_this_week = 0
    focus_site_ids: set[int] = set()
    for user in users:
        scoped_tasks = [task for task in filter_user_facing_tasks(user.owned_tasks) if _site_is_in_focus(task.site, focus_start)]
        open_tasks = [task for task in scoped_tasks if task.status != TaskStatus.DONE]
        blocked_tasks = [task for task in open_tasks if task.status == TaskStatus.NOT_STARTED]
        overdue_tasks = [task for task in open_tasks if task.due_date and task.due_date < today]
        due_this_week = [task for task in open_tasks if task.due_date and today <= task.due_date <= week_end]
        site_loads: dict[int, dict[str, object]] = {}

        def ensure_site(site: Site) -> dict[str, object]:
            existing = site_loads.get(site.id)
            if existing is None:
                existing = {
                    "site_name": site.site_name,
                    "next_window": _site_next_window(site, focus_start),
                    "open_tasks": 0,
                    "pending_tasks": 0,
                    "overdue_tasks": 0,
                    "due_this_week": 0,
                }
                site_loads[site.id] = existing
            return existing

        for task in open_tasks:
            if task.site is not None and _site_is_in_focus(task.site, focus_start):
                site_load = ensure_site(task.site)
                site_load["open_tasks"] = int(site_load["open_tasks"]) + 1
                if task.status == TaskStatus.NOT_STARTED:
                    site_load["pending_tasks"] = int(site_load["pending_tasks"]) + 1
                if task.due_date and task.due_date < today:
                    site_load["overdue_tasks"] = int(site_load["overdue_tasks"]) + 1
                if task.due_date and today <= task.due_date <= week_end:
                    site_load["due_this_week"] = int(site_load["due_this_week"]) + 1
        for assignment in user.assignments:
            if assignment.site is not None and _site_is_in_focus(assignment.site, focus_start):
                ensure_site(assignment.site)

        site_focus = [
            CapacitySiteFocus(
                site_name=str(site_data["site_name"]),
                next_window=site_data["next_window"],
                open_tasks=int(site_data["open_tasks"]),
                pending_tasks=int(site_data["pending_tasks"]),
                overdue_tasks=int(site_data["overdue_tasks"]),
                due_this_week=int(site_data["due_this_week"]),
            )
            for site_data in sorted(
                site_loads.values(),
                key=lambda item: (
                    -int(item["overdue_tasks"]),
                    -int(item["due_this_week"]),
                    item["next_window"] or date.max,
                    str(item["site_name"]).lower(),
                ),
            )
        ]
        site_names = [item.site_name for item in site_focus]
        site_summaries = [
            f"{item.site_name} | {item.overdue_tasks} overdue | {item.due_this_week} due this week"
            if item.overdue_tasks or item.due_this_week
            else item.site_name
            for item in site_focus
        ]
        workstreams = sorted(
            {
                assignment.workstream.name
                for assignment in user.assignments
                if assignment.workstream is not None
                and assignment.workstream.name
                and _site_is_in_focus(assignment.site, focus_start)
            }
            | {
                task.workstream.name for task in scoped_tasks if task.workstream is not None and task.workstream.name
            }
        )
        assigned_sites = len(site_names)
        focus_site_ids.update(site_loads.keys())
        pto_ranges = [DateRange(start=item.start_date, end=item.end_date) for item in user.ptos]
        active_pto = any(item.start_date <= week_end and item.end_date >= today for item in user.ptos)
        if active_pto:
            pto_this_week += 1
        load_label = "balanced"
        if len(open_tasks) >= 8 or user.allocation_percent <= 60:
            load_label = "watch"
        if len(open_tasks) >= 11 or len(blocked_tasks) >= 3:
            load_label = "overloaded"
            overloaded += 1
        if len(open_tasks) <= 4 and not active_pto:
            available += 1
        if not assigned_sites and not open_tasks and not blocked_tasks:
            continue
        people.append(
            CapacityPerson(
                user=user_lite(user),
                open_tasks=len(open_tasks),
                blocked_tasks=len(blocked_tasks),
                overdue_tasks=len(overdue_tasks),
                assigned_sites=assigned_sites,
                site_names=site_names,
                site_summaries=site_summaries,
                focus_sites=site_focus,
                workstreams=workstreams,
                due_this_week=len(due_this_week),
                pto=pto_ranges,
                weekly_hours=user.weekly_hours,
                allocation_percent=user.allocation_percent,
                load_label=load_label,
            )
        )
    return CapacitySummary(
        people=sorted(people, key=lambda item: (-item.overdue_tasks, -item.due_this_week, -item.assigned_sites, item.user.name or "")),
        active_people_count=len(people),
        focus_site_count=len(focus_site_ids),
        overloaded_count=overloaded,
        available_count=available,
        pto_this_week=pto_this_week,
    )
