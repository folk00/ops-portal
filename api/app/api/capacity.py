from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.cache import cached
from app.schemas.capacity import CapacitySummary
from app.services.capacity import get_capacity_summary

router = APIRouter(prefix="/capacity", tags=["capacity"])


@router.get("", response_model=CapacitySummary)
@cached("capacity", ttl=30)
def capacity_index(db: Session = Depends(get_db)) -> CapacitySummary:
    return get_capacity_summary(db)

