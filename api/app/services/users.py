from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import TaskStatus
from app.core.tracker_rules import filter_user_facing_tasks
from app.models.execution import Task
from app.models.people import Assignment, User
from app.models.planning import Site
from app.schemas.common import DateRange
from app.schemas.users import UserAttentionSite, UserRecord
def _site_is_in_focus(site: Site | None, focus_start: date) -> bool:
    return bool(site and any(window.scheduled_date >= focus_start for window in site.migration_windows))


def _site_next_window(site: Site, focus_start: date) -> date | None:
    return min((window.scheduled_date for window in site.migration_windows if window.scheduled_date >= focus_start), default=None)


def list_users(db: Session, *, include_empty: bool = False) -> list[UserRecord]:
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

    records: list[UserRecord] = []
    for user in users:
        if include_empty and not user.active:
            continue
        scoped_tasks = [
            task
            for task in filter_user_facing_tasks(user.owned_tasks)
            if task.site is not None and _site_is_in_focus(task.site, focus_start)
        ]
        open_tasks = [task for task in scoped_tasks if task.status != TaskStatus.DONE]
        blocked_tasks = [task for task in open_tasks if task.status == TaskStatus.NOT_STARTED]
        overdue_tasks = [task for task in open_tasks if task.due_date and task.due_date < today]
        due_this_week = [task for task in open_tasks if task.due_date and today <= task.due_date <= week_end]

        site_names = sorted(
            {
                assignment.site.site_name
                for assignment in user.assignments
                if assignment.site is not None and assignment.site.site_name and _site_is_in_focus(assignment.site, focus_start)
            }
            | {
                task.site.site_name
                for task in scoped_tasks
                if task.site is not None and task.site.site_name
            }
        )

        attention_site_map: dict[str, UserAttentionSite] = {}
        for task in open_tasks:
            if task.site is None or not task.site.site_name:
                continue
            site_name = task.site.site_name
            current = attention_site_map.get(site_name)
            if current is None:
                current = UserAttentionSite(
                    site_name=site_name,
                    next_window=_site_next_window(task.site, focus_start),
                    overdue_tasks=0,
                    due_this_week=0,
                    overdue_task_titles=[],
                    due_this_week_task_titles=[],
                )
                attention_site_map[site_name] = current
            if task.due_date and task.due_date < today:
                current.overdue_tasks += 1
                if task.title and task.title not in current.overdue_task_titles and len(current.overdue_task_titles) < 3:
                    current.overdue_task_titles.append(task.title)
            if task.due_date and today <= task.due_date <= week_end:
                current.due_this_week += 1
                if task.title and task.title not in current.due_this_week_task_titles and len(current.due_this_week_task_titles) < 3:
                    current.due_this_week_task_titles.append(task.title)

        attention_sites = sorted(
            [
                site
                for site in attention_site_map.values()
                if site.overdue_tasks or site.due_this_week
            ],
            key=lambda item: (
                item.next_window or date.max,
                -item.overdue_tasks,
                -item.due_this_week,
                item.site_name.lower(),
            ),
        )

        workstreams = sorted(
            {
                assignment.workstream.name
                for assignment in user.assignments
                if assignment.workstream is not None
                and assignment.workstream.name
                and _site_is_in_focus(assignment.site, focus_start)
            }
            | {
                task.workstream.name
                for task in scoped_tasks
                if task.workstream is not None and task.workstream.name
            }
        )

        current_pto = [DateRange(start=item.start_date, end=item.end_date) for item in user.ptos]

        if not include_empty and not site_names and not attention_sites:
            continue

        records.append(
            UserRecord(
                id=user.id,
                name=user.name,
                email=user.email,
                team=user.team,
                role=user.role,
                allocation_percent=user.allocation_percent,
                weekly_hours=user.weekly_hours,
                active=user.active,
                open_tasks=len(open_tasks),
                blocked_tasks=len(blocked_tasks),
                overdue_tasks=len(overdue_tasks),
                due_this_week=len(due_this_week),
                assigned_sites=len(site_names),
                site_names=site_names,
                attention_sites=attention_sites,
                workstreams=workstreams,
                current_pto=current_pto,
            )
        )

    return records
