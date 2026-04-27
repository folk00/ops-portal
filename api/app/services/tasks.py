from __future__ import annotations

import re
from datetime import date, datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import PriorityLevel, TaskStatus, UpdateType, normalize_priority, normalize_status
from app.models.execution import Task, TaskUpdate
from app.models.people import User
from app.schemas.tasks import BulkUpdateRequest, TaskPatchRequest, TaskUpdateCreate
from app.core.tracker_rules import filter_user_facing_tasks, reference_only_tracker_tasks
from app.services.views import get_system_views
from app.utils.serializers import task_record, task_update_record


_OK_ONLY_PATTERN = re.compile(r"^(?:ok[\s,./\\-]*)+$", re.IGNORECASE)
_MULTISPACE_PATTERN = re.compile(r"[ \t]+")


def _normalize_note_line(value: str) -> str:
    line = _MULTISPACE_PATTERN.sub(" ", value).strip()
    if not line:
        return ""
    if _OK_ONLY_PATTERN.fullmatch(line):
        return "OK."
    if line.lower() in {"na", "n/a"}:
        return "N/A."
    if not re.search(r"[A-Z]", line) and re.search(r"[a-z]", line):
        line = line[0].upper() + line[1:]
    if "http://" not in line and "https://" not in line and line[-1] not in ".!?)]" and len(line.split()) >= 3:
        line += "."
    return line


def normalize_note_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned_lines = [_normalize_note_line(line) for line in value.splitlines()]
    cleaned = "\n".join(line for line in cleaned_lines if line)
    return cleaned or None


def _task_query():
    return (
        select(Task)
        .options(
            selectinload(Task.site),
            selectinload(Task.workstream),
            selectinload(Task.owner),
            selectinload(Task.migration_window),
            selectinload(Task.updates).selectinload(TaskUpdate.author),
        )
        .order_by(Task.updated_at.desc(), Task.id.desc())
    )


def _apply_view_filters(tasks: list[Task], view: str | None) -> list[Task]:
    today = date.today()
    if view == "blocked":
        return [task for task in tasks if task.status == TaskStatus.NOT_STARTED]
    if view == "overdue":
        return [task for task in tasks if task.due_date and task.due_date < today and task.status != TaskStatus.DONE]
    if view == "this-week":
        week_end = today.fromordinal(today.toordinal() + (6 - today.weekday()))
        return [task for task in tasks if task.due_date and today <= task.due_date <= week_end]
    if view == "unassigned":
        return [task for task in tasks if task.owner_id is None and task.status != TaskStatus.DONE]
    if view == "sd-wan":
        return [task for task in tasks if task.workstream and task.workstream.key == "SDWAN"]
    if view == "sda":
        return [task for task in tasks if task.workstream and task.workstream.key == "SDA"]
    if view == "wireless":
        return [task for task in tasks if task.workstream and task.workstream.key == "WIRELESS"]
    if view == "my-work":
        return [task for task in tasks if task.owner is not None and task.status != TaskStatus.DONE]
    return tasks


def list_tasks(
    db: Session,
    *,
    search: str | None = None,
    status: str | None = None,
    owner_id: int | None = None,
    workstream: str | None = None,
    priority: str | None = None,
    site_id: int | None = None,
    view: str | None = None,
    reference_only: bool = False,
) -> list:
    all_tasks = db.scalars(_task_query()).unique().all()
    tasks = reference_only_tracker_tasks(all_tasks) if reference_only else filter_user_facing_tasks(all_tasks)
    if search:
        needle = search.lower().strip()
        tasks = [
            task
            for task in tasks
            if needle in task.title.lower()
            or needle in task.site.site_name.lower()
            or (task.owner and needle in task.owner.name.lower())
            or (task.phase and needle in task.phase.lower())
        ]
    if status:
        wanted = normalize_status(status)
        tasks = [task for task in tasks if task.status == wanted]
    if owner_id is not None:
        tasks = [task for task in tasks if task.owner_id == owner_id]
    if workstream:
        wanted = workstream.upper().replace("-", "")
        tasks = [task for task in tasks if task.workstream and task.workstream.key.replace("-", "") == wanted]
    if priority:
        wanted_priority = normalize_priority(priority)
        tasks = [task for task in tasks if task.priority == wanted_priority]
    if site_id is not None:
        tasks = [task for task in tasks if task.site_id == site_id]
    tasks = _apply_view_filters(tasks, view)
    return [task_record(task) for task in tasks]


def get_task(db: Session, task_id: int) -> Task | None:
    return db.scalar(_task_query().where(Task.id == task_id))


def _append_comment(db: Session, task: Task, body: str, author_id: int | None = None) -> None:
    db.add(
        TaskUpdate(
            task_id=task.id,
            author_id=author_id or task.owner_id,
            update_type=UpdateType.COMMENT,
            body=body,
            created_at=datetime.now(timezone.utc),
        )
    )


def _append_peer_review(db: Session, task: Task, body: str, author_id: int | None = None) -> None:
    db.add(
        TaskUpdate(
            task_id=task.id,
            author_id=author_id,
            update_type=UpdateType.PEER_REVIEW,
            body=body,
            created_at=datetime.now(timezone.utc),
        )
    )


def patch_task(db: Session, task_id: int, payload: TaskPatchRequest):
    task = get_task(db, task_id)
    if not task:
        return None

    status_changed = False
    if payload.status is not None:
        new_status = normalize_status(payload.status)
        status_changed = new_status != task.status
        task.status = new_status
        if new_status == TaskStatus.DONE and task.completed_at is None:
            task.completed_at = datetime.now(timezone.utc)
    if payload.owner_id is not None:
        task.owner_id = payload.owner_id
    if payload.due_date is not None:
        task.due_date = payload.due_date
    if payload.priority is not None:
        task.priority = normalize_priority(payload.priority)
    if payload.description is not None:
        task.description = payload.description.strip() or None
    normalized_comment = normalize_note_text(payload.comment)
    normalized_peer_review = normalize_note_text(payload.peer_review_comment)
    if normalized_comment:
        _append_comment(db, task, normalized_comment, payload.owner_id or task.owner_id)
    if normalized_peer_review:
        _append_peer_review(db, task, normalized_peer_review, payload.peer_review_author_id)
    if status_changed:
        db.add(
            TaskUpdate(
                task_id=task.id,
                author_id=payload.owner_id or task.owner_id,
                update_type=UpdateType.STATUS_CHANGE,
                body=f"Status normalized to {task.status.value}.",
                created_at=datetime.now(timezone.utc),
            )
        )
    db.commit()
    refreshed = get_task(db, task_id)
    return task_record(refreshed) if refreshed else None


def bulk_update_tasks(db: Session, payload: BulkUpdateRequest) -> list:
    updated = []
    for task_id in payload.task_ids:
        item = patch_task(
            db,
            task_id,
            TaskPatchRequest(
                status=payload.status,
                owner_id=payload.owner_id,
                due_date=payload.due_date,
                priority=payload.priority,
                description=payload.description,
                comment=payload.comment,
            ),
        )
        if item:
            updated.append(item)
    return updated


def list_task_updates(db: Session, *, task_id: int | None = None, limit: int = 50) -> list:
    stmt = (
        select(TaskUpdate)
        .options(selectinload(TaskUpdate.author))
        .order_by(TaskUpdate.created_at.desc(), TaskUpdate.id.desc())
        .limit(limit)
    )
    if task_id is not None:
        stmt = stmt.where(TaskUpdate.task_id == task_id)
    updates = db.scalars(stmt).all()
    return [task_update_record(update) for update in updates]


def create_task_update(db: Session, payload: TaskUpdateCreate):
    task = get_task(db, payload.task_id)
    if not task:
        return None
    update = TaskUpdate(
        task_id=payload.task_id,
        author_id=payload.author_id,
        update_type=UpdateType(payload.update_type),
        body=payload.body,
        created_at=datetime.now(timezone.utc),
    )
    db.add(update)
    db.commit()
    db.refresh(update)
    if update.author_id:
        db.refresh(update, attribute_names=["author"])
    return task_update_record(update)
