from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.tasks import TaskUpdateCreate, TaskUpdateRecord
from app.services.tasks import create_task_update, list_task_updates

router = APIRouter(prefix="/task-updates", tags=["task-updates"])


@router.get("", response_model=list[TaskUpdateRecord])
def updates_index(task_id: int | None = None, db: Session = Depends(get_db)) -> list[TaskUpdateRecord]:
    return list_task_updates(db, task_id=task_id)


@router.post("", response_model=TaskUpdateRecord)
def updates_create(payload: TaskUpdateCreate, db: Session = Depends(get_db)) -> TaskUpdateRecord:
    result = create_task_update(db, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    return result

