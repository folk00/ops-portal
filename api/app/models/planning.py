from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import MigrationWindowStatus
from app.models.base import BaseModel, TimestampMixin


class Workstream(BaseModel):
    __tablename__ = "workstreams"

    key: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    tasks = relationship("Task", back_populates="workstream")
    migration_windows = relationship("MigrationWindow", back_populates="workstream")
    assignments = relationship("Assignment", back_populates="workstream")


class Site(BaseModel, TimestampMixin):
    __tablename__ = "sites"

    site_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    site_name: Mapped[str] = mapped_column(String(160), nullable=False)
    region: Mapped[str] = mapped_column(String(80), nullable=False)
    market: Mapped[str] = mapped_column(String(80), nullable=False)
    address: Mapped[str | None] = mapped_column(String(200), nullable=True)
    migration_wave: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    tasks = relationship("Task", back_populates="site")
    migration_windows = relationship("MigrationWindow", back_populates="site")
    assignments = relationship("Assignment", back_populates="site")
    artifacts = relationship("Artifact", back_populates="site")
    calls = relationship("Call", back_populates="related_site")


class MigrationWindow(BaseModel, TimestampMixin):
    __tablename__ = "migration_windows"

    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    workstream_id: Mapped[int | None] = mapped_column(ForeignKey("workstreams.id"), nullable=True, index=True)
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    status: Mapped[MigrationWindowStatus] = mapped_column(
        Enum(MigrationWindowStatus, native_enum=False),
        nullable=False,
        default=MigrationWindowStatus.PLANNED,
    )
    change_ticket: Mapped[str | None] = mapped_column(String(60), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    site = relationship("Site", back_populates="migration_windows")
    workstream = relationship("Workstream", back_populates="migration_windows")
    tasks = relationship("Task", back_populates="migration_window")

