from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.calendar import CalendarSummary
from app.services.calendar import get_calendar_summary

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", response_model=CalendarSummary)
def calendar_index(db: Session = Depends(get_db)) -> CalendarSummary:
    return get_calendar_summary(db)

