import asyncio
import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.cache import invalidate
from app.core.jobs import submit_job
from app.db.session import SessionLocal
from app.schemas.imports import ImportDetailResponse, ImportRecord
from app.services.imports import get_import_detail, import_from_bytes, list_imports

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/imports", tags=["imports"])

_MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
_ALLOWED_EXTENSIONS = {".xlsx"}


@router.get("", response_model=list[ImportRecord])
def imports_index(db: Session = Depends(get_db)) -> list[ImportRecord]:
    return list_imports(db)


@router.post("", status_code=202)
async def upload_import(
    file: UploadFile = File(...),
    imported_by: int | None = None,
):
    filename = file.filename or "uploaded.xlsx"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Only .xlsx files are accepted, got '{ext}'")

    payload = await file.read()
    if len(payload) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit")

    logger.info("Workbook upload: %s (%d bytes)", filename, len(payload))

    def _run_import(raw: bytes, fname: str, user_id: int | None):
        """Executed in a background thread with its own DB session."""
        db_bg = SessionLocal()
        try:
            result = import_from_bytes(db_bg, payload=raw, file_name=fname, imported_by=user_id)
            asyncio.run(invalidate("dashboard", "capacity"))
            return result
        finally:
            db_bg.close()

    job_id = await submit_job(
        "import",
        _run_import,
        payload,
        filename,
        imported_by,
    )
    await invalidate("dashboard", "capacity")
    return {"job_id": job_id, "status": "pending"}


@router.get("/{import_id}", response_model=ImportDetailResponse)
def import_detail(import_id: int, db: Session = Depends(get_db)) -> ImportDetailResponse:
    result = get_import_detail(db, import_id)
    if not result:
        raise HTTPException(status_code=404, detail="Import not found")
    return result
