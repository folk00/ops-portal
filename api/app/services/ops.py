from __future__ import annotations

from datetime import date, timedelta
import re

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.timeline import infer_timeline
from app.core.enums import (
    MigrationWindowStatus,
    PRIORITY_DISPLAY,
    PriorityLevel,
    STATUS_DISPLAY,
    TaskStatus,
)
from app.core.tracker_rules import filter_user_facing_tasks
from app.models.execution import Task
from app.models.planning import MigrationWindow, Site
from app.schemas.ops import (
    HealthBreakdown,
    SiteHealthScore,
    TriageDriverTask,
    TriageSiteSummary,
    TriageTechnologyReadiness,
    VelocityEstimate,
)

TECHNOLOGY_WORKSTREAM_KEYS = {"SDWAN", "SDA", "WIRELESS"}
TECHNOLOGY_WORKSTREAMS = (
    ("SDWAN", "SD-WAN"),
    ("SDA", "SDA"),
    ("WIRELESS", "Wireless"),
)
TRIAGE_LOOKAHEAD_DAYS = 14
TRIAGE_SILENT_SITE_DAYS = 7
TRIAGE_WINDOW_LOOKBACK_DAYS = 21
TRIAGE_WINDOW_LOOKAHEAD_DAYS = 14
T2_TIMELINE_ORDER = 50

PEER_REVIEW_COMPLETED_PATTERNS = (
    re.compile(r"\b(?:sda|sd-wan)\s+peer review completed\b", re.IGNORECASE),
    re.compile(r"\bsd-wan peer review completed\b", re.IGNORECASE),
    re.compile(r"\bwireless peer review completed\b", re.IGNORECASE),
    re.compile(r"\bpeer review completed\b", re.IGNORECASE),
)

WINDOW_STATUS_SCORE: dict[MigrationWindowStatus, float] = {
    MigrationWindowStatus.READY: 1.0,
    MigrationWindowStatus.IN_FLIGHT: 1.0,
    MigrationWindowStatus.COMPLETE: 1.0,
    MigrationWindowStatus.PLANNED: 0.5,
    MigrationWindowStatus.AT_RISK: 0.0,
}

TRIAGE_BUCKET_ORDER = {
    "in_flight": 0,
    "this_week": 1,
    "next_two_weeks": 2,
}


def _site_query_with_tasks(*, include_updates: bool = False):
    options = [
        selectinload(Site.tasks).selectinload(Task.workstream),
        selectinload(Site.tasks).selectinload(Task.owner),
        selectinload(Site.migration_windows).selectinload(MigrationWindow.workstream),
    ]
    if include_updates:
        options.append(selectinload(Site.tasks).selectinload(Task.updates))
    return (
        select(Site)
        .options(*options)
        .where(Site.active == True)
        .order_by(Site.site_name.asc())
    )


def _next_window(site: Site, today: date) -> MigrationWindow | None:
    future = [window for window in site.migration_windows if window.scheduled_date >= today]
    return min(future, key=lambda window: window.scheduled_date) if future else None


def _triage_scope_window(site: Site, today: date) -> tuple[MigrationWindow | None, str | None]:
    in_flight = [
        window for window in site.migration_windows if window.status == MigrationWindowStatus.IN_FLIGHT
    ]
    if in_flight:
        return min(in_flight, key=lambda window: window.scheduled_date), "in_flight"

    lookahead = today + timedelta(days=TRIAGE_LOOKAHEAD_DAYS)
    nearby = [
        window
        for window in site.migration_windows
        if today <= window.scheduled_date <= lookahead
        and window.status != MigrationWindowStatus.COMPLETE
    ]
    if not nearby:
        return None, None

    window = min(nearby, key=lambda item: item.scheduled_date)
    bucket = "this_week" if (window.scheduled_date - today).days <= 7 else "next_two_weeks"
    return window, bucket


def _site_owner_gap_count(tasks: list[Task]) -> int:
    workstreams_with_tasks = {
        task.workstream.key
        for task in tasks
        if task.workstream and task.workstream.key in TECHNOLOGY_WORKSTREAM_KEYS
    }
    workstreams_with_owner = {
        task.workstream.key
        for task in tasks
        if task.workstream
        and task.workstream.key in TECHNOLOGY_WORKSTREAM_KEYS
        and task.owner_id
    }
    return max(len(workstreams_with_tasks) - len(workstreams_with_owner), 0)


def _site_last_activity(tasks: list[Task]) -> date | None:
    latest: date | None = None
    for task in tasks:
        if task.updated_at:
            task_date = task.updated_at.date()
            if latest is None or task_date > latest:
                latest = task_date
        for update in task.updates:
            update_date = update.created_at.date()
            if latest is None or update_date > latest:
                latest = update_date
    return latest


def _task_timeline(task: Task) -> tuple[str, int]:
    return infer_timeline(task.phase, task.title, task.source_tab)


def _is_due_by_t2(task: Task, triage_window: MigrationWindow) -> bool:
    t2_deadline = triage_window.scheduled_date - timedelta(days=14)
    if task.due_date is not None:
        return task.due_date <= t2_deadline
    timeline_label, timeline_order = _task_timeline(task)
    return timeline_label != "Unsequenced" and timeline_order <= T2_TIMELINE_ORDER


def _is_peer_review_task(task: Task) -> bool:
    haystack = f"{task.phase or ''} {task.title or ''}"
    return bool(re.search(r"peer review", haystack, re.IGNORECASE))


def _is_peer_review_completed_task(task: Task) -> bool:
    haystack = f"{task.phase or ''} {task.title or ''}"
    return any(pattern.search(haystack) for pattern in PEER_REVIEW_COMPLETED_PATTERNS)


MILESTONE_LABELS = ["T-6", "T-5", "T-4", "T-3", "T-2", "T-1", "T-0"]
MILESTONE_ORDER_MAP = {"T-6": 10, "T-5": 20, "T-4": 30, "T-3": 40, "T-2": 50, "T-1": 60, "T-0": 70}

# Maps days_until_window to the milestone that should be complete by now.
_EXPECTED_MILESTONE_THRESHOLDS: list[tuple[int, str]] = [
    (42, "T-6"),
    (35, "T-5"),
    (28, "T-4"),
    (21, "T-3"),
    (14, "T-2"),
    (7, "T-1"),
    (0, "T-0"),
]


def _expected_milestone_for_days(days_until_window: int) -> str | None:
    """Return the milestone label that should be complete given days remaining."""
    result: str | None = None
    for threshold, label in _EXPECTED_MILESTONE_THRESHOLDS:
        if days_until_window >= threshold:
            result = label
            break
    if result is None and days_until_window >= 0:
        result = "T-0"
    return result


def _compute_milestone_detail(
    technology_tasks: list[Task],
    days_until_window: int,
) -> tuple[list[dict], str | None, str | None, int]:
    """Compute milestone detail for a single technology workstream.

    Returns (milestone_detail, current_milestone, expected_milestone, milestones_behind).
    """
    # Group tasks by milestone label
    milestone_buckets: dict[str, list[Task]] = {label: [] for label in MILESTONE_LABELS}
    for task in technology_tasks:
        timeline_label, _order = _task_timeline(task)
        if timeline_label in milestone_buckets:
            milestone_buckets[timeline_label].append(task)

    expected_milestone = _expected_milestone_for_days(days_until_window)

    # Build detail and determine current milestone (last fully complete)
    current_milestone: str | None = None
    earliest_incomplete_found = False
    detail: list[dict] = []

    for label in MILESTONE_LABELS:
        order = MILESTONE_ORDER_MAP[label]
        bucket_tasks = milestone_buckets[label]
        total = len(bucket_tasks)
        done = sum(1 for t in bucket_tasks if t.status == TaskStatus.DONE)

        if total == 0:
            status = "done"  # no tasks = nothing to do = complete
            current_milestone = label
        elif done == total:
            status = "done"
            current_milestone = label
        elif not earliest_incomplete_found:
            # Determine if this incomplete milestone is late or current
            if expected_milestone and MILESTONE_ORDER_MAP.get(expected_milestone, 0) >= order:
                status = "late"
            else:
                status = "current"
            earliest_incomplete_found = True
        else:
            status = "future"

        detail.append({
            "label": label,
            "order": order,
            "total": total,
            "done": done,
            "status": status,
        })

    # Calculate milestones_behind
    milestones_behind = 0
    if expected_milestone and current_milestone:
        expected_idx = MILESTONE_LABELS.index(expected_milestone)
        current_idx = MILESTONE_LABELS.index(current_milestone)
        milestones_behind = max(expected_idx - current_idx, 0)
    elif expected_milestone and current_milestone is None:
        # Nothing is complete yet; behind by all milestones up to expected
        milestones_behind = MILESTONE_LABELS.index(expected_milestone) + 1

    return detail, current_milestone, expected_milestone, milestones_behind


def _technology_readiness(tasks: list[Task], triage_window: MigrationWindow, today: date) -> list[TriageTechnologyReadiness]:
    t2_deadline = triage_window.scheduled_date - timedelta(days=14)
    readiness: list[TriageTechnologyReadiness] = []

    days_until_window = (triage_window.scheduled_date - today).days

    for workstream_key, workstream_name in TECHNOLOGY_WORKSTREAMS:
        technology_tasks = [
            task
            for task in tasks
            if task.workstream and task.workstream.key == workstream_key
        ]
        t2_tasks = [task for task in technology_tasks if _is_due_by_t2(task, triage_window)]
        t2_done_total = sum(1 for task in t2_tasks if task.status == TaskStatus.DONE)
        t2_open_total = sum(1 for task in t2_tasks if task.status != TaskStatus.DONE)

        peer_review_tasks = [task for task in t2_tasks if _is_peer_review_task(task)]
        peer_review_done_total = sum(1 for task in peer_review_tasks if task.status == TaskStatus.DONE)
        peer_review_open_total = sum(1 for task in peer_review_tasks if task.status != TaskStatus.DONE)
        peer_review_completed_done = any(
            task.status == TaskStatus.DONE and _is_peer_review_completed_task(task)
            for task in peer_review_tasks
        )

        if not t2_tasks:
            t2_status = "not_applicable"
        elif t2_open_total == 0:
            t2_status = "ready"
        elif today > t2_deadline:
            t2_status = "late"
        elif today == t2_deadline:
            t2_status = "due_now"
        else:
            t2_status = "at_risk"

        if not technology_tasks or not t2_tasks:
            peer_review_status = "not_applicable"
        elif not peer_review_tasks:
            peer_review_status = "missing"
        elif peer_review_open_total == 0 or peer_review_completed_done:
            peer_review_status = "ready"
        elif today > t2_deadline:
            peer_review_status = "late"
        elif today == t2_deadline:
            peer_review_status = "due_now"
        else:
            peer_review_status = "in_progress"

        # Compute milestone detail for this workstream
        milestone_detail, current_milestone, expected_milestone, milestones_behind = (
            _compute_milestone_detail(technology_tasks, days_until_window)
        )

        readiness.append(
            TriageTechnologyReadiness(
                workstream_key=workstream_key,
                workstream_name=workstream_name,
                t2_due_total=len(t2_tasks),
                t2_done_total=t2_done_total,
                t2_open_total=t2_open_total,
                t2_status=t2_status,
                peer_review_total=len(peer_review_tasks),
                peer_review_done_total=peer_review_done_total,
                peer_review_open_total=peer_review_open_total,
                peer_review_status=peer_review_status,
                current_milestone=current_milestone,
                expected_milestone=expected_milestone,
                milestones_behind=milestones_behind,
                milestone_detail=milestone_detail,
            )
        )

    return readiness


def _compute_forecast(
    *,
    technology_readiness: list[TriageTechnologyReadiness],
    critical_no_owner: int,
    overdue_tasks: int,
    overdue_high_tasks: int,
    remaining_tasks: int,
    velocity_per_week: float,
    days_until_window: int,
) -> tuple[str, str]:
    """Determine go/no-go forecast. Returns (forecast, forecast_color)."""
    # --- HARD blockers → no_go ---
    if critical_no_owner > 0:
        return "no_go", "rose"

    peer_review_missing = any(
        item.peer_review_status == "missing"
        for item in technology_readiness
        if item.t2_due_total > 0
    )
    if peer_review_missing:
        return "no_go", "rose"

    if any(item.milestones_behind >= 3 for item in technology_readiness):
        return "no_go", "rose"

    if overdue_high_tasks > 3:
        return "no_go", "rose"

    # --- Soft concerns → at_risk ---
    if any(item.milestones_behind >= 1 for item in technology_readiness):
        return "at_risk", "amber"

    if any(
        item.peer_review_status in {"late", "due_now", "in_progress", "missing"}
        for item in technology_readiness
    ):
        return "at_risk", "amber"

    if overdue_tasks > 0:
        return "at_risk", "amber"

    if velocity_per_week > 0 and days_until_window is not None and days_until_window > 0:
        days_needed = (remaining_tasks / velocity_per_week) * 7
        if days_needed > days_until_window:
            return "at_risk", "amber"

    return "go", "emerald"


def _top_blocker(
    *,
    technology_readiness: list[TriageTechnologyReadiness],
    critical_no_owner: int,
    overdue_tasks: int,
    days_since_activity: int | None,
) -> str | None:
    """Pick the single most important issue as a human-readable sentence."""
    # 1. Peer review missing
    for item in technology_readiness:
        if item.peer_review_status == "missing" and item.t2_due_total > 0:
            return f"{item.workstream_name} peer review not started"

    # 2. Critical tasks without owner
    if critical_no_owner > 0:
        noun = "task" if critical_no_owner == 1 else "tasks"
        return f"{critical_no_owner} critical {noun} without owner"

    # 3. Milestones behind
    for item in technology_readiness:
        if item.milestones_behind >= 1 and item.current_milestone and item.expected_milestone:
            return (
                f"{item.workstream_name} {item.milestones_behind} "
                f"{'milestone' if item.milestones_behind == 1 else 'milestones'} behind "
                f"(at {item.current_milestone}, should be {item.expected_milestone})"
            )

    # 4. Overdue tasks
    if overdue_tasks > 0:
        noun = "task" if overdue_tasks == 1 else "tasks"
        return f"{overdue_tasks} {noun} overdue"

    # 5. Silent site
    if days_since_activity is not None and days_since_activity >= TRIAGE_SILENT_SITE_DAYS:
        return f"No activity in {days_since_activity}+ days"
    if days_since_activity is None:
        return "No activity in 7+ days"

    return None


def _runway_summary(
    *,
    remaining_tasks: int,
    velocity_per_week: float,
    days_until_window: int | None,
) -> str | None:
    """Return a compact runway string like '6 tasks · ~2.1/wk · tight for 4d'."""
    if days_until_window is None:
        return None

    noun = "task" if remaining_tasks == 1 else "tasks"

    if remaining_tasks == 0:
        return f"0 {noun} · on pace for {days_until_window}d"

    if velocity_per_week <= 0:
        return f"{remaining_tasks} {noun} · no velocity data · {days_until_window}d until MW"

    days_needed = (remaining_tasks / velocity_per_week) * 7
    pace = "on pace" if days_needed <= days_until_window else "tight"
    return f"{remaining_tasks} {noun} · ~{velocity_per_week:.1f}/wk · {pace} for {days_until_window}d"


def _site_velocity_for_triage(tasks: list[Task], today: date) -> tuple[float, int]:
    """Compute velocity and remaining task count for triage forecast.

    Returns (velocity_per_week, remaining_tasks).
    """
    non_na = [task for task in tasks if task.status != TaskStatus.NA]
    done = [task for task in non_na if task.status == TaskStatus.DONE]
    remaining = [task for task in non_na if task.status != TaskStatus.DONE]

    four_weeks_ago = today - timedelta(weeks=4)
    recently_completed = [
        task for task in done if task.completed_at and task.completed_at.date() >= four_weeks_ago
    ]

    velocity_per_week = 0.0
    if recently_completed:
        velocity_per_week = len(recently_completed) / 4.0
    elif len(done) >= 3:
        oldest = min(
            (task for task in done if task.completed_at),
            key=lambda task: task.completed_at,
            default=None,
        )
        if oldest:
            days_elapsed = max((today - oldest.completed_at.date()).days, 1)
            velocity_per_week = len(done) / (days_elapsed / 7.0)

    return round(velocity_per_week, 2), len(remaining)


def _triage_focus_tasks(tasks: list[Task], triage_window: MigrationWindow) -> list[Task]:
    window_start = triage_window.scheduled_date - timedelta(days=TRIAGE_WINDOW_LOOKBACK_DAYS)
    window_end = triage_window.scheduled_date + timedelta(days=TRIAGE_WINDOW_LOOKAHEAD_DAYS)

    linked_to_window = [
        task for task in tasks if task.migration_window_id == triage_window.id
    ]
    near_window_unscoped = [
        task
        for task in tasks
        if task.migration_window_id != triage_window.id
        and task.due_date
        and window_start <= task.due_date <= window_end
    ]
    unwindowed_critical = [
        task
        for task in tasks
        if task.migration_window_id is None
        and (task.priority == PriorityLevel.CRITICAL or not task.owner_id)
    ]

    ordered: list[Task] = []
    seen_ids: set[int] = set()
    for group in (linked_to_window, near_window_unscoped, unwindowed_critical):
        for task in sorted(group, key=lambda item: _driver_sort_key(item, triage_window.scheduled_date)):
            if task.id in seen_ids:
                continue
            seen_ids.add(task.id)
            ordered.append(task)
    return ordered


def _driver_sort_key(task: Task, today: date) -> tuple[int, int, date, str, str]:
    days_overdue = (today - task.due_date).days if task.due_date and task.due_date < today else 0
    due_soon = bool(task.due_date and task.due_date <= today + timedelta(days=7))
    critical = task.priority == PriorityLevel.CRITICAL
    high_risk_overdue = days_overdue > 0 and task.priority in (PriorityLevel.CRITICAL, PriorityLevel.HIGH)

    if critical and not task.owner_id:
        rank = 0
    elif high_risk_overdue:
        rank = 1
    elif critical:
        rank = 2
    elif due_soon:
        rank = 3
    elif not task.owner_id:
        rank = 4
    else:
        rank = 5

    return (
        rank,
        -days_overdue,
        task.due_date or date.max,
        task.phase or "",
        task.title.lower(),
    )


def _driver_tasks(tasks: list[Task], today: date, triage_window: MigrationWindow) -> list[TriageDriverTask]:
    week_end = today + timedelta(days=max(6 - today.weekday(), 0))
    candidates = [
        task
        for task in tasks
        if _is_due_by_t2(task, triage_window)
        or _is_peer_review_task(task)
        or task.priority == PriorityLevel.CRITICAL
        or not task.owner_id
        or (task.due_date and task.due_date < today)
        or (task.due_date and today <= task.due_date <= week_end)
    ]
    if not candidates:
        candidates = list(tasks)

    unique_tasks: list[Task] = []
    seen_ids: set[int] = set()
    for task in sorted(candidates, key=lambda item: _driver_sort_key(item, today)):
        if task.id in seen_ids:
            continue
        seen_ids.add(task.id)
        unique_tasks.append(task)
        if len(unique_tasks) == 4:
            break

    return [
        TriageDriverTask(
            task_id=task.id,
            workstream_name=task.workstream.name if task.workstream else None,
            phase=task.phase,
            title=task.title,
            status_label=STATUS_DISPLAY.get(task.status, task.status.value),
            priority_label=PRIORITY_DISPLAY.get(task.priority, task.priority.value),
            owner_name=task.owner.name if task.owner else None,
            due_date=task.due_date,
            days_overdue=(today - task.due_date).days if task.due_date and task.due_date < today else 0,
        )
        for task in unique_tasks
    ]


def _compute_site_health(site: Site, today: date) -> SiteHealthScore:
    tasks = filter_user_facing_tasks(site.tasks)
    non_na = [task for task in tasks if task.status != TaskStatus.NA]
    done = [task for task in non_na if task.status == TaskStatus.DONE]
    overdue = [
        task
        for task in non_na
        if task.status != TaskStatus.DONE and task.due_date and task.due_date < today
    ]

    workstreams_with_tasks = {
        task.workstream.key
        for task in tasks
        if task.workstream and task.workstream.key in TECHNOLOGY_WORKSTREAM_KEYS
    }
    workstreams_with_owner = {
        task.workstream.key
        for task in tasks
        if task.workstream and task.workstream.key in TECHNOLOGY_WORKSTREAM_KEYS and task.owner_id
    }
    coverage = (
        len(workstreams_with_owner) / max(len(workstreams_with_tasks), 1)
        if workstreams_with_tasks
        else 0.5
    )

    next_window = _next_window(site, today)
    readiness = WINDOW_STATUS_SCORE.get(next_window.status if next_window else None, 0.5)

    total_non_na = len(non_na)
    completion = len(done) / max(total_non_na, 1)
    timeliness = 1.0 - min(len(overdue) / max(total_non_na, 1) * 2.5, 1.0)

    raw_score = (
        completion * 0.40
        + timeliness * 0.30
        + readiness * 0.20
        + coverage * 0.10
    )
    score = max(0, min(100, round(raw_score * 100)))

    if score >= 85:
        grade, color, label = "A", "green", "On Track"
    elif score >= 70:
        grade, color, label = "B", "lime", "Good"
    elif score >= 55:
        grade, color, label = "C", "yellow", "Watch"
    elif score >= 40:
        grade, color, label = "D", "orange", "At Risk"
    else:
        grade, color, label = "F", "red", "Critical"

    return SiteHealthScore(
        site_id=site.id,
        site_code=site.site_code,
        site_name=site.site_name,
        score=score,
        grade=grade,
        grade_color=color,
        label=label,
        breakdown=HealthBreakdown(
            completion_pct=round(completion * 100, 1),
            timeliness_pct=round(timeliness * 100, 1),
            readiness_pct=round(readiness * 100, 1),
            coverage_pct=round(coverage * 100, 1),
        ),
        next_window_date=next_window.scheduled_date if next_window else None,
    )


def get_health_scores(db: Session) -> list[SiteHealthScore]:
    today = date.today()
    sites = db.scalars(_site_query_with_tasks()).unique().all()
    scores = [_compute_site_health(site, today) for site in sites]
    return sorted(scores, key=lambda score: score.score)


def get_site_health(db: Session, site_id: int) -> SiteHealthScore | None:
    today = date.today()
    site = db.scalar(
        select(Site)
        .options(
            selectinload(Site.tasks).selectinload(Task.workstream),
            selectinload(Site.tasks).selectinload(Task.owner),
            selectinload(Site.migration_windows),
        )
        .where(Site.id == site_id)
    )
    if not site:
        return None
    return _compute_site_health(site, today)


def get_site_velocity(db: Session, site_id: int) -> VelocityEstimate | None:
    site = db.scalar(
        select(Site)
        .options(
            selectinload(Site.tasks).selectinload(Task.workstream),
            selectinload(Site.migration_windows),
        )
        .where(Site.id == site_id)
    )
    if not site:
        return None

    tasks = filter_user_facing_tasks(site.tasks)
    non_na = [task for task in tasks if task.status != TaskStatus.NA]
    done = [task for task in non_na if task.status == TaskStatus.DONE]
    remaining = [task for task in non_na if task.status != TaskStatus.DONE]

    today = date.today()
    four_weeks_ago = today - timedelta(weeks=4)

    recently_completed = [
        task for task in done if task.completed_at and task.completed_at.date() >= four_weeks_ago
    ]

    velocity_per_week = 0.0
    confidence = "INSUFFICIENT_DATA"

    if recently_completed:
        velocity_per_week = len(recently_completed) / 4.0
        if len(recently_completed) >= 5:
            confidence = "HIGH"
        elif len(recently_completed) >= 2:
            confidence = "MEDIUM"
        else:
            confidence = "LOW"
    elif len(done) >= 3:
        oldest = min(
            (task for task in done if task.completed_at),
            key=lambda task: task.completed_at,
            default=None,
        )
        if oldest:
            days_elapsed = max((today - oldest.completed_at.date()).days, 1)
            velocity_per_week = len(done) / (days_elapsed / 7.0)
            confidence = "LOW"

    next_window = _next_window(site, today)
    days_until_window = (next_window.scheduled_date - today).days if next_window else None

    estimated_completion_date = None
    on_track = False

    if not remaining:
        estimated_completion_date = today
        on_track = True
        confidence = "HIGH"
    elif velocity_per_week > 0:
        weeks_needed = len(remaining) / velocity_per_week
        estimated_completion_date = today + timedelta(days=int(weeks_needed * 7))
        on_track = next_window is None or estimated_completion_date <= next_window.scheduled_date

    return VelocityEstimate(
        site_id=site.id,
        site_name=site.site_name,
        total_tasks=len(non_na),
        done_tasks=len(done),
        remaining_tasks=len(remaining),
        velocity_per_week=round(velocity_per_week, 2),
        estimated_completion_date=estimated_completion_date,
        next_window_date=next_window.scheduled_date if next_window else None,
        days_until_window=days_until_window,
        on_track=on_track,
        confidence=confidence,
    )


def get_triage_sites(db: Session) -> list[TriageSiteSummary]:
    today = date.today()
    week_end = today + timedelta(days=max(6 - today.weekday(), 0))
    sites = db.scalars(_site_query_with_tasks(include_updates=True)).unique().all()

    summaries: list[TriageSiteSummary] = []
    for site in sites:
        triage_window, window_bucket = _triage_scope_window(site, today)
        if triage_window is None or window_bucket is None:
            continue

        tasks = filter_user_facing_tasks(site.tasks)
        open_tasks = [task for task in tasks if task.status not in (TaskStatus.DONE, TaskStatus.NA)]
        if not open_tasks:
            continue

        focus_tasks = _triage_focus_tasks(open_tasks, triage_window)
        if not focus_tasks:
            continue

        critical_tasks = sum(1 for task in focus_tasks if task.priority == PriorityLevel.CRITICAL)
        critical_no_owner = sum(
            1
            for task in focus_tasks
            if task.priority == PriorityLevel.CRITICAL and not task.owner_id
        )
        overdue_tasks = sum(
            1 for task in focus_tasks if task.due_date and task.due_date < today
        )
        overdue_high_tasks = sum(
            1
            for task in focus_tasks
            if task.due_date
            and task.due_date < today
            and task.priority in (PriorityLevel.CRITICAL, PriorityLevel.HIGH)
        )
        due_this_week_tasks = sum(
            1
            for task in focus_tasks
            if task.due_date and today <= task.due_date <= week_end
        )
        technology_readiness = _technology_readiness(focus_tasks, triage_window, today)
        t2_open_total = sum(item.t2_open_total for item in technology_readiness)
        t2_open_workstreams = sum(1 for item in technology_readiness if item.t2_open_total > 0)
        peer_review_blocked_workstreams = sum(
            1
            for item in technology_readiness
            if item.peer_review_status in {"late", "due_now", "in_progress", "missing"}
        )
        owner_gap_workstreams = _site_owner_gap_count(focus_tasks)

        last_activity = _site_last_activity(focus_tasks)
        days_since_activity = (today - last_activity).days if last_activity else None
        days_until_window = (triage_window.scheduled_date - today).days

        reasons: list[str] = []
        urgency_score = 0

        if window_bucket == "in_flight":
            reasons.append("in_flight")
            urgency_score += 140
        elif window_bucket == "this_week":
            reasons.append("window_this_week")
            urgency_score += 90
        else:
            reasons.append("window_next_two_weeks")
            urgency_score += 35

        if critical_no_owner:
            reasons.append("critical_no_owner")
            urgency_score += critical_no_owner * 55
        elif critical_tasks:
            reasons.append("critical_open")
            urgency_score += critical_tasks * 30

        if overdue_high_tasks:
            reasons.append("overdue_high")
            urgency_score += overdue_high_tasks * 24
        elif overdue_tasks:
            reasons.append("overdue")
            urgency_score += overdue_tasks * 12

        if t2_open_total:
            reasons.append("t2_gap")
            urgency_score += min(t2_open_total * 10, 90) + (t2_open_workstreams * 12)

        if peer_review_blocked_workstreams:
            reasons.append("peer_review_gap")
            urgency_score += peer_review_blocked_workstreams * 25

        if owner_gap_workstreams:
            reasons.append("owner_gap")
            urgency_score += owner_gap_workstreams * 20

        if due_this_week_tasks >= 3:
            reasons.append("due_this_week")
            urgency_score += due_this_week_tasks * 8

        if days_since_activity is None or days_since_activity >= TRIAGE_SILENT_SITE_DAYS:
            reasons.append("silent_site")
            if days_since_activity is None:
                urgency_score += 20
            else:
                urgency_score += min(12 + (days_since_activity - TRIAGE_SILENT_SITE_DAYS) * 2, 36)

        attention_needed = (
            window_bucket in {"in_flight", "this_week"}
            or critical_tasks > 0
            or overdue_tasks > 0
            or t2_open_total > 0
            or peer_review_blocked_workstreams > 0
            or owner_gap_workstreams > 0
            or due_this_week_tasks >= 3
            or days_since_activity is None
            or days_since_activity >= TRIAGE_SILENT_SITE_DAYS
        )
        if not attention_needed:
            continue

        # Compute velocity and forecast
        velocity_per_week, remaining_tasks = _site_velocity_for_triage(focus_tasks, today)

        forecast, forecast_color = _compute_forecast(
            technology_readiness=technology_readiness,
            critical_no_owner=critical_no_owner,
            overdue_tasks=overdue_tasks,
            overdue_high_tasks=overdue_high_tasks,
            remaining_tasks=remaining_tasks,
            velocity_per_week=velocity_per_week,
            days_until_window=days_until_window,
        )

        top_blocker = _top_blocker(
            technology_readiness=technology_readiness,
            critical_no_owner=critical_no_owner,
            overdue_tasks=overdue_tasks,
            days_since_activity=days_since_activity,
        )

        runway = _runway_summary(
            remaining_tasks=remaining_tasks,
            velocity_per_week=velocity_per_week,
            days_until_window=days_until_window,
        )

        health = _compute_site_health(site, today)
        summaries.append(
            TriageSiteSummary(
                site_id=site.id,
                site_name=site.site_name,
                site_code=site.site_code,
                region=site.region,
                next_window_date=triage_window.scheduled_date,
                next_window_status=triage_window.status.value,
                days_until_window=days_until_window,
                window_bucket=window_bucket,
                health_score=health.score,
                health_grade=health.grade,
                open_tasks=len(focus_tasks),
                critical_tasks=critical_tasks,
                overdue_tasks=overdue_tasks,
                overdue_high_tasks=overdue_high_tasks,
                due_this_week_tasks=due_this_week_tasks,
                t2_open_total=t2_open_total,
                t2_open_workstreams=t2_open_workstreams,
                peer_review_blocked_workstreams=peer_review_blocked_workstreams,
                owner_gap_workstreams=owner_gap_workstreams,
                days_since_activity=days_since_activity,
                urgency_score=urgency_score,
                reasons=reasons,
                technology_readiness=technology_readiness,
                drivers=_driver_tasks(focus_tasks, today, triage_window),
                forecast=forecast,
                forecast_color=forecast_color,
                top_blocker=top_blocker,
                runway_summary=runway,
            )
        )

    return sorted(
        summaries,
        key=lambda site: (
            TRIAGE_BUCKET_ORDER.get(site.window_bucket, 99),
            site.days_until_window if site.days_until_window is not None else 999,
            -site.urgency_score,
            site.site_name.lower(),
        ),
    )
