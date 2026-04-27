from fastapi import APIRouter

from app.schemas.views import SystemView
from app.services.views import get_system_views

router = APIRouter(prefix="/views", tags=["views"])


@router.get("/system", response_model=list[SystemView])
def system_views() -> list[SystemView]:
    return get_system_views()

