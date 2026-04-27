from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import PriorityLevel, TaskStatus, UpdateType
from app.models.base import BaseModel, TimestampMixin


class Task(BaseModel, TimestampMixin):
    __tablename__ = "tasks"

    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    workstream_id: Mapped[int | None] = mapped_column(ForeignKey("workstreams.id"), nullable=True, index=True)
    migration_window_id: Mapped[int | None] = mapped_column(ForeignKey("migration_windows.id"), nullable=True, index=True)
    phase: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus, native_enum=False), nullable=False, index=True)
    priority: Mapped[PriorityLevel] = mapped_column(
        Enum(PriorityLevel, native_enum=False),
        nullable=False,
        default=PriorityLevel.MEDIUM,
        index=True,
    )
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source_type: Mapped[str] = mapped_column(String(60), nullable=False, default="seed")
    source_tab: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_row_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_column_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    raw_import_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    site = relationship("Site", back_populates="tasks")
    workstream = relationship("Workstream", back_populates="tasks")
    migration_window = relationship("MigrationWindow", back_populates="tasks")
    owner = relationship("User", back_populates="owned_tasks")
    updates = relationship("TaskUpdate", back_populates="task")
    assignments = relationship("Assignment", back_populates="task")
    artifacts = relationship("Artifact", back_populates="task")


class TaskUpdate(BaseModel):
    __tablename__ = "task_updates"

    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), nullable=False, index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    update_type: Mapped[UpdateType] = mapped_column(Enum(UpdateType, native_enum=False), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    task = relationship("Task", back_populates="updates")
    author = relationship("User", back_populates="task_updates")


class Artifact(BaseModel):
    __tablename__ = "artifacts"

    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True, index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    artifact_type: Mapped[str] = mapped_column(String(60), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    site = relationship("Site", back_populates="artifacts")
    task = relationship("Task", back_populates="artifacts")


class AiReportRun(BaseModel, TimestampMixin):
    __tablename__ = "ai_report_runs"

    actor_key: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    actor_label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_source: Mapped[str] = mapped_column(String(80), nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    site_name_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    model: Mapped[str] = mapped_column(String(180), nullable=False)
    report_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
