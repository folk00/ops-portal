from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import CallType, PTOType
from app.models.base import BaseModel, TimestampMixin


class User(BaseModel, TimestampMixin):
    __tablename__ = "users"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(180), unique=True, nullable=False, index=True)
    team: Mapped[str] = mapped_column(String(80), nullable=False)
    role: Mapped[str] = mapped_column(String(80), nullable=False)
    allocation_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=100, server_default="100")
    weekly_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=40, server_default="40")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    owned_tasks = relationship("Task", back_populates="owner")
    task_updates = relationship("TaskUpdate", back_populates="author")
    assignments = relationship("Assignment", back_populates="user")
    ptos = relationship("PTO", back_populates="user")
    calls = relationship("Call", back_populates="owner")
    imports = relationship("Import", back_populates="imported_by_user")


class Assignment(BaseModel):
    __tablename__ = "assignments"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True, index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True, index=True)
    workstream_id: Mapped[int | None] = mapped_column(ForeignKey("workstreams.id"), nullable=True, index=True)
    allocation_percent: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="assignments")
    site = relationship("Site", back_populates="assignments")
    task = relationship("Task", back_populates="assignments")
    workstream = relationship("Workstream", back_populates="assignments")


class PTO(BaseModel):
    __tablename__ = "ptos"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    pto_type: Mapped[PTOType] = mapped_column(Enum(PTOType, native_enum=False), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user = relationship("User", back_populates="ptos")


class Call(BaseModel):
    __tablename__ = "calls"

    title: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    start_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    end_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    call_type: Mapped[CallType] = mapped_column(Enum(CallType, native_enum=False), nullable=False)
    related_site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), nullable=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    owner = relationship("User", back_populates="calls")
    related_site = relationship("Site", back_populates="calls")
