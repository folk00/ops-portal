from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.cache import cached
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard import get_dashboard_summary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
@cached("dashboard", ttl=30)
def dashboard_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    return get_dashboard_summary(db)

