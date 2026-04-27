from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import TaskStatus
from app.core.tracker_rules import filter_user_facing_tasks
from app.models.execution import Task, TaskUpdate
from app.models.people import User
from app.models.planning import Site, Workstream
from app.schemas.dashboard import (
    DashboardSummary,
    MetricCard,
    RecentUpdate,
    RiskSite,
    UpcomingMigration,
    WorkloadSnapshot,
    WorkstreamBreakdown,
)
from app.services.views import get_system_views
from app.utils.serializers import site_lite, user_lite, workstream_lite

FOCUS_WORKSTREAM_KEYS = {"SDWAN", "SDA", "WIRELESS"}

def _shift_month(value: date, months: int) -> date:
    zero_indexed = (value.year * 12 + value.month - 1) + months
    year, month_index = divmod(zero_indexed, 12)
    return date(year, month_index + 1, 1)


def _site_has_window_in_range(site: Site, start: date, end: date | None = None) -> bool:
    return any(
        window.scheduled_date >= start and (end is None or window.scheduled_date < end)
        for window in site.migration_windows
    )


def _site_next_window(site: Site, start: date) -> date | None:
    return min((window.scheduled_date for window in site.migration_windows if window.scheduled_date >= start), default=None)


def _site_name_examples(site_ids: set[int], focus_sites: list[Site], start: date, limit: int = 3) -> list[str]:
    ordered = sorted(
        (site for site in focus_sites if site.id in site_ids),
        key=lambda site: (_site_next_window(site, start) or date.max, site.site_name.lower()),
    )
    return [site.site_name for site in ordered[:limit]]


def get_dashboard_summary(db: Session) -> DashboardSummary:
    tasks = filter_user_facing_tasks(
        db.scalars(select(Task).options(selectinload(Task.site), selectinload(Task.workstream), selectinload(Task.owner))).unique().all()
    )
    sites = db.scalars(select(Site).options(selectinload(Site.migration_windows))).unique().all()
    updates = db.scalars(
        select(TaskUpdate)
        .options(selectinload(TaskUpdate.author), selectinload(TaskUpdate.task).selectinload(Task.site))
        .order_by(TaskUpdate.created_at.desc())
        .limit(8)
    ).all()
    users = db.scalars(select(User)).all()
    workstreams = db.scalars(select(Workstream)).all()

    today = date.today()
    focus_start = today
    next_month_start = _shift_month(date(today.year, today.month, 1), 1)
    following_month_start = _shift_month(focus_start, 2)
    week_end = today.fromordinal(today.toordinal() + (6 - today.weekday()))
    focus_sites = [site for site in sites if _site_has_window_in_range(site, focus_start)]
    focus_site_ids = {site.id for site in focus_sites}
    focus_tasks = [task for task in tasks if task.site_id in focus_site_ids]
    site_tasks: dict[int, list[Task]] = {site.id: [] for site in focus_sites}
    for task in focus_tasks:
        if task.site_id in site_tasks:
            site_tasks[task.site_id].append(task)

    current_month_sites = {site.id for site in focus_sites if _site_has_window_in_range(site, focus_start, next_month_start)}
    next_month_sites = {site.id for site in focus_sites if _site_has_window_in_range(site, next_month_start, following_month_start)}
    assigned_focus_sites = {task.site_id for task in focus_tasks if task.owner_id and task.site_id is not None}

    metrics = [
        MetricCard(label=focus_start.strftime("%b %Y"), value=len(current_month_sites), change_hint="Unique sites scheduled this month"),
        MetricCard(
            label=next_month_start.strftime("%b %Y"),
            value=len(next_month_sites),
            change_hint="Unique sites scheduled next month",
        ),
        MetricCard(label="Assigned", value=len(assigned_focus_sites), change_hint="Sites with clear owner mapping"),
        MetricCard(label="Unassigned", value=max(len(focus_site_ids) - len(assigned_focus_sites), 0), change_hint="Focus sites still missing ownership"),
    ]

    breakdown = []
    for workstream in workstreams:
        if workstream.key not in FOCUS_WORKSTREAM_KEYS:
            continue
        scoped = [task for task in focus_tasks if task.workstream_id == workstream.id]
        scoped_site_ids = {task.site_id for task in scoped if task.site_id is not None}
        windows_this_week_site_ids = {
            site.id
            for site in focus_sites
            if site.id in scoped_site_ids and any(today <= window.scheduled_date <= week_end for window in site.migration_windows)
        }
        tminus_due_now_site_ids = {
            task.site_id
            for task in scoped
            if task.site_id is not None and task.status != TaskStatus.DONE and task.due_date and task.due_date <= week_end
        }
        needs_owner_site_ids = {
            site_id
            for site_id in scoped_site_ids
            if not any(task.site_id == site_id and task.workstream_id == workstream.id and task.owner_id for task in scoped)
        }
        breakdown.append(
            WorkstreamBreakdown(
                workstream=workstream_lite(workstream),
                sites_in_play=len(scoped_site_ids),
                windows_this_week=len(windows_this_week_site_ids),
                this_week_examples=_site_name_examples(windows_this_week_site_ids, focus_sites, focus_start),
                tminus_due_now_sites=len(tminus_due_now_site_ids),
                tminus_due_now_examples=_site_name_examples(tminus_due_now_site_ids, focus_sites, focus_start),
                needs_owner_sites=len(needs_owner_site_ids),
                needs_owner_examples=_site_name_examples(needs_owner_site_ids, focus_sites, focus_start),
            )
        )

    workload = []
    for user in users:
        owned = [task for task in focus_tasks if task.owner_id == user.id and task.site_id is not None]
        owned_site_ids = {task.site_id for task in owned if task.site_id is not None}
        if not owned_site_ids:
            continue
        windows_this_week_site_ids = {
            site.id
            for site in focus_sites
            if site.id in owned_site_ids and any(today <= window.scheduled_date <= week_end for window in site.migration_windows)
        }
        tminus_due_now_site_ids = {
            task.site_id
            for task in owned
            if task.site_id is not None and task.status != TaskStatus.DONE and task.due_date and task.due_date <= week_end
        }
        sorted_sites = sorted(
            (
                site
                for site in focus_sites
                if site.id in owned_site_ids
            ),
            key=lambda site: (
                0 if site.id in tminus_due_now_site_ids else 1,
                0 if site.id in windows_this_week_site_ids else 1,
                _site_next_window(site, focus_start) or date.max,
                site.site_name.lower(),
            ),
        )
        top_sites = [site.site_name for site in sorted_sites[:3]]
        load_label = "healthy"
        if len(owned_site_ids) >= 5 or len(windows_this_week_site_ids) >= 2 or len(tminus_due_now_site_ids) >= 1:
            load_label = "watch"
        if len(owned_site_ids) >= 8 or len(tminus_due_now_site_ids) >= 3 or len(windows_this_week_site_ids) >= 3:
            load_label = "overloaded"
        workload.append(
            WorkloadSnapshot(
                user=user_lite(user),
                assigned_sites=len(owned_site_ids),
                windows_this_week=len(windows_this_week_site_ids),
                tminus_due_now_sites=len(tminus_due_now_site_ids),
                top_sites=top_sites,
                load_label=load_label,
            )
        )

    recent_focus_updates = [update for update in updates if update.task and update.task.site and update.task.site.id in focus_site_ids]
    recent_updates = [
        RecentUpdate(
            id=update.id,
            task_id=update.task_id,
            task_title=update.task.title if update.task else "Task",
            site_name=update.task.site.site_name if update.task and update.task.site else "",
            body=update.body,
            update_type=update.update_type.value,
            created_at=update.created_at,
            author=user_lite(update.author),
        )
        for update in (recent_focus_updates or updates)
    ]

    upcoming: list[UpcomingMigration] = []
    for site in focus_sites:
        focus_windows = [window for window in site.migration_windows if window.scheduled_date >= focus_start]
        if not focus_windows:
            continue
        window = min(focus_windows, key=lambda item: item.scheduled_date)
        upcoming.append(
            UpcomingMigration(
                id=window.id,
                site=site_lite(site),
                scheduled_date=window.scheduled_date,
                status=window.status.value,
                workstream=workstream_lite(window.workstream),
                change_ticket=window.change_ticket,
            )
        )
    upcoming.sort(key=lambda item: item.scheduled_date)

    risk_sites = []
    for site in focus_sites:
        site_scoped_tasks = site_tasks.get(site.id, [])
        blocked = sum(1 for task in site_scoped_tasks if task.status == TaskStatus.NOT_STARTED)
        due = sum(1 for task in site_scoped_tasks if task.due_date and today <= task.due_date <= week_end and task.status != TaskStatus.DONE)
        if blocked or due >= 3:
            next_window = _site_next_window(site, focus_start)
            risk_sites.append(
                RiskSite(
                    site=site_lite(site),
                    blocked_tasks=blocked,
                    due_this_week=due,
                    next_window=next_window,
                    risk_label="pending" if blocked else "crowded",
                )
            )

    return DashboardSummary(
        metrics=metrics,
        tasks_by_workstream=breakdown,
        workload=sorted(workload, key=lambda item: (-item.tminus_due_now_sites, -item.windows_this_week, -item.assigned_sites, item.user.name or "")),
        recent_updates=recent_updates[:8],
        upcoming_migrations=upcoming[:10],
        at_risk_sites=sorted(
            risk_sites,
            key=lambda item: (item.next_window or date.max, -item.blocked_tasks, -item.due_this_week, item.site.site_name),
        )[:8],
        system_views=[item.model_dump() for item in get_system_views()],
        last_updated=datetime.now(timezone.utc),
    )
