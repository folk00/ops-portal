from __future__ import annotations

from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.imports.workbook_importer import import_workbook
from app.models.imports import Import
from app.schemas.common import UserLite
from app.schemas.imports import ImportDetailResponse, ImportErrorRecord, ImportRecord
from app.utils.serializers import user_lite


def _imports_query():
    return (
        select(Import)
        .options(selectinload(Import.errors), selectinload(Import.imported_by_user))
        .order_by(Import.imported_at.desc(), Import.id.desc())
    )


def list_imports(db: Session) -> list[ImportRecord]:
    records = db.scalars(_imports_query()).unique().all()
    return [
        ImportRecord(
            id=record.id,
            file_name=record.file_name,
            imported_at=record.imported_at,
            imported_by=user_lite(record.imported_by_user),
            source_type=record.source_type,
            status=record.status.value,
            summary_json=record.summary_json,
            created_tasks=record.created_tasks,
            updated_tasks=record.updated_tasks,
            warnings_count=record.warnings_count,
            errors_count=record.errors_count,
        )
        for record in records
    ]


def get_import_detail(db: Session, import_id: int) -> ImportDetailResponse | None:
    record = db.scalar(_imports_query().where(Import.id == import_id))
    if not record:
        return None
    return ImportDetailResponse(
        id=record.id,
        file_name=record.file_name,
        imported_at=record.imported_at,
        imported_by=user_lite(record.imported_by_user),
        source_type=record.source_type,
        status=record.status.value,
        summary_json=record.summary_json,
        created_tasks=record.created_tasks,
        updated_tasks=record.updated_tasks,
        warnings_count=record.warnings_count,
        errors_count=record.errors_count,
        errors=[
            ImportErrorRecord(
                id=error.id,
                sheet_name=error.sheet_name,
                row_number=error.row_number,
                field_name=error.field_name,
                severity=error.severity,
                message=error.message,
                raw_row_json=error.raw_row_json,
            )
            for error in record.errors
        ],
    )


def import_from_path(db: Session, workbook_path: str | Path, imported_by: int | None = None) -> ImportDetailResponse:
    record = import_workbook(db, source=Path(workbook_path), imported_by=imported_by)
    return get_import_detail(db, record.id)


def import_from_bytes(db: Session, payload: bytes, file_name: str, imported_by: int | None = None) -> ImportDetailResponse:
    record = import_workbook(db, source=payload, file_name=file_name, imported_by=imported_by)
    return get_import_detail(db, record.id)

