from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import UserLite


class ImportErrorRecord(BaseModel):
    id: int
    sheet_name: str
    row_number: int | None = None
    field_name: str | None = None
    severity: str
    message: str
    raw_row_json: dict | None = None


class ImportRecord(BaseModel):
    id: int
    file_name: str
    imported_at: datetime
    imported_by: UserLite | None = None
    source_type: str
    status: str
    summary_json: dict | None = None
    created_tasks: int
    updated_tasks: int
    warnings_count: int
    errors_count: int


class ImportDetailResponse(ImportRecord):
    errors: list[ImportErrorRecord]

