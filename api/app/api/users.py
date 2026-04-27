from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.users import UserRecord
from app.services.users import list_users

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRecord])
def users_index(
    include_empty: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[UserRecord]:
    return list_users(db, include_empty=include_empty)
