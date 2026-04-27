from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import ImportStatus
from app.models.base import BaseModel


class Import(BaseModel):
    __tablename__ = "imports"

    file_name: Mapped[str] = mapped_column(String(240), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    imported_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[ImportStatus] = mapped_column(Enum(ImportStatus, native_enum=False), nullable=False)
    summary_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_tasks: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    warnings_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    errors_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    errors = relationship("ImportError", back_populates="import_record")
    imported_by_user = relationship("User", back_populates="imports")


class ImportError(BaseModel):
    __tablename__ = "import_errors"

    import_id: Mapped[int] = mapped_column(ForeignKey("imports.id"), nullable=False, index=True)
    sheet_name: Mapped[str] = mapped_column(String(160), nullable=False)
    row_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    field_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    raw_row_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    import_record = relationship("Import", back_populates="errors")

