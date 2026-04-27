from __future__ import annotations

from enum import Enum


class TaskStatus(str, Enum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    DONE = "DONE"
    NA = "NA"


class PriorityLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class MigrationWindowStatus(str, Enum):
    PLANNED = "PLANNED"
    READY = "READY"
    IN_FLIGHT = "IN_FLIGHT"
    COMPLETE = "COMPLETE"
    AT_RISK = "AT_RISK"


class ImportStatus(str, Enum):
    PENDING = "PENDING"
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"


class UpdateType(str, Enum):
    COMMENT = "COMMENT"
    STATUS_CHANGE = "STATUS_CHANGE"
    IMPORT = "IMPORT"
    NOTE = "NOTE"
    PEER_REVIEW = "PEER_REVIEW"


class PTOType(str, Enum):
    PTO = "PTO"
    HOLIDAY = "HOLIDAY"
    TRAINING = "TRAINING"


class CallType(str, Enum):
    CUTOVER = "CUTOVER"
    PLANNING = "PLANNING"
    SCRUM = "SCRUM"
    CUSTOMER = "CUSTOMER"


STATUS_ALIASES: dict[str, TaskStatus] = {
    "": TaskStatus.NOT_STARTED,
    "blank": TaskStatus.NOT_STARTED,
    "not started": TaskStatus.NOT_STARTED,
    "not_started": TaskStatus.NOT_STARTED,
    "pending": TaskStatus.NOT_STARTED,
    "pending / on hold": TaskStatus.NOT_STARTED,
    "pending/on-hold": TaskStatus.NOT_STARTED,
    "on hold": TaskStatus.NOT_STARTED,
    "hold": TaskStatus.NOT_STARTED,
    "blocked": TaskStatus.NOT_STARTED,
    "in progress": TaskStatus.IN_PROGRESS,
    "in_progress": TaskStatus.IN_PROGRESS,
    "progress": TaskStatus.IN_PROGRESS,
    "partial complete": TaskStatus.IN_PROGRESS,
    "partial completed": TaskStatus.IN_PROGRESS,
    "partially complete": TaskStatus.IN_PROGRESS,
    "partially completed": TaskStatus.IN_PROGRESS,
    "complete": TaskStatus.DONE,
    "completed": TaskStatus.DONE,
    "complete.": TaskStatus.DONE,
    "done": TaskStatus.DONE,
    "peer reviewed": TaskStatus.DONE,
    "peer-reviewed": TaskStatus.DONE,
    "na": TaskStatus.NA,
    "n/a": TaskStatus.NA,
    "not needed": TaskStatus.NA,
}


STATUS_DISPLAY: dict[TaskStatus, str] = {
    TaskStatus.NOT_STARTED: "Pending / on hold",
    TaskStatus.IN_PROGRESS: "In progress",
    TaskStatus.BLOCKED: "Pending / on hold",
    TaskStatus.DONE: "Done",
    TaskStatus.NA: "N/A",
}


STATUS_COLOR: dict[TaskStatus, str] = {
    TaskStatus.NOT_STARTED: "slate",
    TaskStatus.IN_PROGRESS: "blue",
    TaskStatus.BLOCKED: "amber",
    TaskStatus.DONE: "green",
    TaskStatus.NA: "zinc",
}


PRIORITY_DISPLAY: dict[PriorityLevel, str] = {
    PriorityLevel.LOW: "Low",
    PriorityLevel.MEDIUM: "Medium",
    PriorityLevel.HIGH: "High",
    PriorityLevel.CRITICAL: "Critical",
}


PRIORITY_COLOR: dict[PriorityLevel, str] = {
    PriorityLevel.LOW: "slate",
    PriorityLevel.MEDIUM: "sky",
    PriorityLevel.HIGH: "amber",
    PriorityLevel.CRITICAL: "rose",
}


def normalize_status(value: str | None) -> TaskStatus:
    cleaned = (value or "").strip().lower()
    if cleaned in STATUS_ALIASES:
        return STATUS_ALIASES[cleaned]

    if cleaned.startswith(("partial complete", "partial completed", "partially complete", "partially completed")):
        return TaskStatus.IN_PROGRESS
    if cleaned.startswith(("in progress", "progress")):
        return TaskStatus.IN_PROGRESS
    if cleaned.startswith(("pending / on hold", "pending/on-hold", "pending", "not started", "on hold", "hold", "blocked")):
        return TaskStatus.NOT_STARTED
    if cleaned.startswith(("complete", "completed", "done", "peer reviewed", "peer-reviewed")):
        return TaskStatus.DONE
    if cleaned.startswith(("na", "n/a", "not needed")):
        return TaskStatus.NA

    return TaskStatus.NOT_STARTED


def normalize_priority(value: str | None) -> PriorityLevel:
    cleaned = (value or "").strip().lower()
    if cleaned in {"critical", "crit", "p1"}:
        return PriorityLevel.CRITICAL
    if cleaned in {"high", "urgent", "p2"}:
        return PriorityLevel.HIGH
    if cleaned in {"low", "p4"}:
        return PriorityLevel.LOW
    return PriorityLevel.MEDIUM
