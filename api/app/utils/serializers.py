from __future__ import annotations

from app.core.enums import (
    PRIORITY_COLOR,
    PRIORITY_DISPLAY,
    STATUS_COLOR,
    STATUS_DISPLAY,
    PriorityLevel,
    TaskStatus,
    UpdateType,
)
from app.core.timeline import infer_timeline, timeline_window_from_label, timeline_window_from_text
from app.core.tracker_rules import is_reference_only_tracker_task
from app.models.execution import Task, TaskUpdate
from app.models.people import User
from app.models.planning import Site, Workstream
from app.schemas.common import BadgeMeta, SiteLite, UserLite, WorkstreamLite
from app.schemas.tasks import TaskRecord, TaskUpdateRecord


def status_badge(value: TaskStatus | str) -> BadgeMeta:
    status = value if isinstance(value, TaskStatus) else TaskStatus(value)
    if status == TaskStatus.BLOCKED:
        status = TaskStatus.NOT_STARTED
    return BadgeMeta(value=status.value, label=STATUS_DISPLAY[status], color=STATUS_COLOR[status])


def priority_badge(value: PriorityLevel | str) -> BadgeMeta:
    priority = value if isinstance(value, PriorityLevel) else PriorityLevel(value)
    return BadgeMeta(value=priority.value, label=PRIORITY_DISPLAY[priority], color=PRIORITY_COLOR[priority])


def user_lite(user: User | None) -> UserLite | None:
    if not user:
        return None
    return UserLite(
        id=user.id,
        name=user.name,
        email=user.email,
        team=user.team,
        role=user.role,
        allocation_percent=user.allocation_percent,
        weekly_hours=user.weekly_hours,
    )


def workstream_lite(workstream: Workstream | None) -> WorkstreamLite | None:
    if not workstream:
        return None
    return WorkstreamLite(id=workstream.id, key=workstream.key, name=workstream.name)


def site_lite(site: Site) -> SiteLite:
    return SiteLite(
        id=site.id,
        site_code=site.site_code,
        site_name=site.site_name,
        region=site.region,
        market=site.market,
        migration_wave=site.migration_wave,
    )


def task_record(task: Task) -> TaskRecord:
    reference_only = is_reference_only_tracker_task(task)
    timeline_label, timeline_order = (
        ("Unsequenced", 999) if reference_only else infer_timeline(task.phase, task.title, task.source_tab)
    )
    implementation_date = task.migration_window.scheduled_date if task.migration_window else None
    raw = task.raw_import_json or {}
    raw_timeline_hint = raw.get("aux") if isinstance(raw, dict) else None
    timeline_window_start, timeline_window_end, timeline_window_label = (None, None, None)
    if not reference_only:
        timeline_window_start, timeline_window_end, timeline_window_label = timeline_window_from_text(
            str(raw_timeline_hint) if raw_timeline_hint else None,
            implementation_date,
        )
        if timeline_window_start is None and timeline_window_end is None:
            timeline_window_start, timeline_window_end, timeline_window_label = timeline_window_from_label(
                timeline_label,
                implementation_date,
            )

    note_preview = None
    peer_review_preview = None
    peer_review_author = None
    is_pristine_seed = (
        task.source_type == "portal_create"
        and task.status in {TaskStatus.NOT_STARTED, TaskStatus.NA}
        and not task.updates
    )
    if task.updates:
        note_updates = [
            update
            for update in task.updates
            if update.update_type in {UpdateType.COMMENT, UpdateType.NOTE, UpdateType.IMPORT}
        ]
        if note_updates:
            latest_update = max(note_updates, key=lambda item: item.created_at)
            note_preview = latest_update.body
        peer_review_updates = [
            update
            for update in task.updates
            if update.update_type == UpdateType.PEER_REVIEW
        ]
        if peer_review_updates:
            latest_peer_review = max(peer_review_updates, key=lambda item: item.created_at)
            peer_review_preview = latest_peer_review.body
            peer_review_author = user_lite(latest_peer_review.author)
    if not note_preview and not is_pristine_seed:
        note_preview = task.description

    return TaskRecord(
        id=task.id,
        site=site_lite(task.site),
        workstream=workstream_lite(task.workstream),
        migration_window_id=task.migration_window_id,
        implementation_date=implementation_date,
        timeline_label=timeline_label,
        timeline_order=timeline_order,
        timeline_window_start=timeline_window_start,
        timeline_window_end=timeline_window_end,
        timeline_window_label=timeline_window_label,
        phase=task.phase,
        title=task.title,
        description=task.description,
        note_preview=note_preview,
        peer_review_preview=peer_review_preview,
        peer_review_author=peer_review_author,
        status=status_badge(task.status),
        priority=priority_badge(task.priority),
        owner=user_lite(task.owner),
        due_date=task.due_date,
        completed_at=task.completed_at,
        source_type=task.source_type,
        source_tab=task.source_tab,
        source_row_key=task.source_row_key,
        source_column_key=task.source_column_key,
        site_engineer=(raw.get("site_engineer_hint") if isinstance(raw, dict) else None),
        is_pristine_seed=is_pristine_seed,
        comment_count=len(task.updates),
        updated_at=task.updated_at,
    )


def task_update_record(update: TaskUpdate) -> TaskUpdateRecord:
    return TaskUpdateRecord(
        id=update.id,
        task_id=update.task_id,
        update_type=update.update_type.value,
        body=update.body,
        created_at=update.created_at,
        author=user_lite(update.author),
    )
