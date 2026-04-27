from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.cache import invalidate, publish
from app.schemas.tasks import BulkUpdateRequest, TaskPatchRequest, TaskRecord, TaskUpdateCreate, TaskUpdateRecord
from app.services.tasks import bulk_update_tasks, create_task_update, list_task_updates, list_tasks, patch_task

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskRecord])
def tasks_index(
    search: str | None = None,
    status: str | None = None,
    owner_id: int | None = None,
    workstream: str | None = None,
    priority: str | None = None,
    site_id: int | None = None,
    view: str | None = None,
    reference_only: bool = False,
    db: Session = Depends(get_db),
) -> list[TaskRecord]:
    return list_tasks(
        db,
        search=search,
        status=status,
        owner_id=owner_id,
        workstream=workstream,
        priority=priority,
        site_id=site_id,
        view=view,
        reference_only=reference_only,
    )


@router.patch("/{task_id}", response_model=TaskRecord)
async def update_task(task_id: int, payload: TaskPatchRequest, db: Session = Depends(get_db)) -> TaskRecord:
    result = patch_task(db, task_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    await invalidate("dashboard", "capacity")
    await publish("ops:jobs", {"_event": "task_updated", "task_id": task_id})
    return result


@router.post("/bulk-update", response_model=list[TaskRecord])
async def bulk_update(payload: BulkUpdateRequest, db: Session = Depends(get_db)) -> list[TaskRecord]:
    result = bulk_update_tasks(db, payload)
    await invalidate("dashboard", "capacity")
    await publish("ops:jobs", {"_event": "tasks_bulk_updated"})
    return result


@router.get("/updates", response_model=list[TaskUpdateRecord])
def task_updates(task_id: int | None = None, db: Session = Depends(get_db)) -> list[TaskUpdateRecord]:
    return list_task_updates(db, task_id=task_id)


@router.post("/updates", response_model=TaskUpdateRecord)
async def create_update(payload: TaskUpdateCreate, db: Session = Depends(get_db)) -> TaskUpdateRecord:
    result = create_task_update(db, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    await invalidate("dashboard")
    await publish("ops:jobs", {"_event": "task_update_created", "task_id": payload.task_id})
    return result
