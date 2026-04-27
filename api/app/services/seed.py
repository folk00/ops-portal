from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
import os
from pathlib import Path
from random import Random

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.enums import CallType, ImportStatus, MigrationWindowStatus, PTOType, PriorityLevel, TaskStatus, UpdateType
from app.db.base import Base
from app.imports.workbook_importer import import_workbook
from app.models.execution import Artifact, Task, TaskUpdate
from app.models.imports import Import, ImportError
from app.models.people import Assignment, Call, PTO, User
from app.models.planning import MigrationWindow, Site, Workstream


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _env_truthy(name: str, default: bool = True) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _days(value: int) -> date:
    return date.today() + timedelta(days=value)


def ensure_reference_data(db: Session) -> dict[str, Workstream]:
    existing = {item.key: item for item in db.scalars(select(Workstream)).all()}
    definitions = [
        ("PROGRAM", "Program", "Cross-workstream readiness, plans, and governance"),
        ("SDWAN", "SD-WAN", "SD-WAN circuit, template, and cutover preparation"),
        ("SDA", "SDA", "SDA implementation and validation"),
        ("WIRELESS", "Wireless", "RF design, enclosure validation, and wireless cutover"),
        ("CUTOVER", "Cutover", "Execution night, go/no-go, and bridge readiness"),
        ("DAY1", "Day 1", "Post-migration support and issue handling"),
    ]
    for key, name, description in definitions:
        if key not in existing:
            record = Workstream(key=key, name=name, description=description)
            db.add(record)
            db.flush()
            existing[key] = record
    return existing


def _seed_fallback_demo_data(db: Session) -> dict[str, int]:
    existing_users = db.scalar(select(User.id).limit(1))
    if existing_users:
        return {"users": 0, "sites": 0, "tasks": 0, "imports": 0}

    rand = Random(17)
    now = utcnow()

    workstream_map = ensure_reference_data(db)

    users = [
        User(name="Engineer One", email="engineer1@example.com", team="Team A", role="Wireless Lead", allocation_percent=100, weekly_hours=40, active=True),
        User(name="Engineer Two", email="engineer2@example.com", team="Team A", role="SD-WAN Engineer", allocation_percent=80, weekly_hours=32, active=True),
        User(name="Engineer Three", email="engineer3@example.com", team="Team A", role="SD-WAN Lead", allocation_percent=50, weekly_hours=20, active=True),
        User(name="Engineer Four", email="engineer4@example.com", team="Team B", role="SDA Engineer", allocation_percent=50, weekly_hours=20, active=True),
        User(name="Engineer Five", email="engineer5@example.com", team="Team B", role="SDA Engineer", allocation_percent=100, weekly_hours=40, active=True),
        User(name="Engineer Six", email="engineer6@example.com", team="Team B", role="Wireless Engineer", allocation_percent=100, weekly_hours=40, active=True),
        User(name="Engineer Seven", email="engineer7@example.com", team="Team C", role="SDA / Day 1", allocation_percent=100, weekly_hours=40, active=True),
        User(name="Program Manager", email="pm@example.com", team="Team C", role="Program Manager", allocation_percent=100, weekly_hours=40, active=True),
    ]
    db.add_all(users)
    db.flush()
    user_map = {user.name: user for user in users}

    sites = [
        Site(site_code=f"Site-{i:03d}", site_name=f"Site {i}", region="Region 1", market=f"Market {((i - 1) % 3) + 1}", address=f"{i} Example Street, City, ST", migration_wave=f"Wave {((i - 1) // 2) + 1}", notes="Mock site for demo seed", active=True)
        for i in range(1, 11)
    ]
    db.add_all(sites)
    db.flush()

    migration_windows: list[MigrationWindow] = []
    for idx, site in enumerate(sites):
        delta = (-10 + idx * 5)
        migration_windows.append(
            MigrationWindow(
                site_id=site.id,
                scheduled_date=_days(delta),
                start_time=time(22, 0),
                end_time=time(2, 0),
                status=[
                    MigrationWindowStatus.COMPLETE,
                    MigrationWindowStatus.COMPLETE,
                    MigrationWindowStatus.READY,
                    MigrationWindowStatus.PLANNED,
                    MigrationWindowStatus.PLANNED,
                    MigrationWindowStatus.AT_RISK,
                    MigrationWindowStatus.READY,
                    MigrationWindowStatus.AT_RISK,
                    MigrationWindowStatus.PLANNED,
                    MigrationWindowStatus.PLANNED,
                ][idx],
                change_ticket=f"CHG-{20260 + idx}",
                notes="Derived from migration calendar planning",
            )
        )
    db.add_all(migration_windows)
    db.flush()
    window_by_site = {window.site_id: window for window in migration_windows}

    owner_cycle = {
        "PROGRAM": ["Program Manager", "Engineer Two"],
        "SDWAN": ["Engineer Two", "Engineer Three"],
        "SDA": ["Engineer Five", "Engineer Four", "Engineer Seven"],
        "WIRELESS": ["Engineer One", "Engineer Six"],
        "CUTOVER": ["Program Manager", "Engineer Seven"],
        "DAY1": ["Engineer Seven", "Program Manager"],
    }

    templates = [
        ("PROGRAM", "Readiness", "Confirm remediation plan and peer review state", "Upcoming Migrations"),
        ("SDWAN", "WAN Circuit Validations", "Validate existing circuit configuration and ETA", "SD-WAN Tracker"),
        ("SDA", "Voice Services", "Confirm dependencies and SDA deliverables", "SDA Tracker"),
        ("WIRELESS", "RF Design and Enclosures", "Validate RF design and enclosure completion", "Wireless Tracker"),
        ("CUTOVER", "Execution", "Go/No-Go bridge readiness and implementation plan", "Cutover Calendar"),
        ("DAY1", "Day 1", "Confirm day 1 support and escalations readiness", "Day 1 Tracker"),
    ]

    status_pattern = [
        TaskStatus.DONE,
        TaskStatus.IN_PROGRESS,
        TaskStatus.NOT_STARTED,
        TaskStatus.NOT_STARTED,
        TaskStatus.DONE,
        TaskStatus.IN_PROGRESS,
    ]
    priority_pattern = [
        PriorityLevel.HIGH,
        PriorityLevel.MEDIUM,
        PriorityLevel.HIGH,
        PriorityLevel.CRITICAL,
        PriorityLevel.MEDIUM,
        PriorityLevel.HIGH,
    ]

    tasks: list[Task] = []
    for site_idx, site in enumerate(sites):
        window = window_by_site[site.id]
        for template_idx, (workstream_key, phase, title, source_tab) in enumerate(templates):
            owner_name = owner_cycle[workstream_key][(site_idx + template_idx) % len(owner_cycle[workstream_key])]
            due_date = window.scheduled_date - timedelta(days=max(1, 7 - template_idx))
            status = status_pattern[(site_idx + template_idx) % len(status_pattern)]
            if window.status == MigrationWindowStatus.AT_RISK and workstream_key in {"SDWAN", "WIRELESS", "CUTOVER"}:
                status = TaskStatus.NOT_STARTED if template_idx % 2 == 1 else TaskStatus.IN_PROGRESS
            if window.status == MigrationWindowStatus.COMPLETE and workstream_key in {"CUTOVER", "DAY1"}:
                status = TaskStatus.DONE
            task = Task(
                site_id=site.id,
                workstream_id=workstream_map[workstream_key].id,
                migration_window_id=window.id,
                phase=phase,
                title=title,
                description=f"{title} for {site.site_name} derived from workbook-aligned tracker structure.",
                status=status,
                priority=priority_pattern[(site_idx + template_idx) % len(priority_pattern)],
                owner_id=user_map[owner_name].id,
                due_date=due_date,
                completed_at=datetime.combine(due_date, time(18, 0), tzinfo=timezone.utc) if status == TaskStatus.DONE else None,
                source_type="seed",
                source_tab=source_tab,
                source_row_key=f"{source_tab}:row-{site_idx + template_idx + 4}",
                source_column_key=site.site_name,
                raw_import_json={
                    "sheet": source_tab,
                    "site": site.site_name,
                    "phase": phase,
                    "task": title,
                    "owner_hint": owner_name,
                    "schedule_date": window.scheduled_date.isoformat(),
                },
            )
            tasks.append(task)
    db.add_all(tasks)
    db.flush()

    updates: list[TaskUpdate] = []
    for idx, task in enumerate(tasks):
        updates.append(
            TaskUpdate(
                task_id=task.id,
                author_id=task.owner_id,
                update_type=UpdateType.COMMENT,
                body=f"Tracker refreshed for {task.site.site_name}; current focus is {task.title.lower()}.",
                created_at=now - timedelta(days=rand.randint(0, 9), hours=rand.randint(1, 10)),
            )
        )
        if task.status == TaskStatus.NOT_STARTED:
            updates.append(
                TaskUpdate(
                    task_id=task.id,
                    author_id=user_map["Program Manager"].id,
                    update_type=UpdateType.STATUS_CHANGE,
                    body="Pending / on hold due to unresolved dependency in tracker.",
                    created_at=now - timedelta(days=rand.randint(0, 4), hours=rand.randint(1, 6)),
                )
            )
    db.add_all(updates)

    assignments: list[Assignment] = []
    for site in sites:
        assignments.append(
            Assignment(
                user_id=user_map["Program Manager"].id,
                site_id=site.id,
                task_id=None,
                workstream_id=workstream_map["PROGRAM"].id,
                allocation_percent=20,
                notes="Program oversight",
                created_at=now,
            )
        )
    for task in tasks[:18]:
        assignments.append(
            Assignment(
                user_id=task.owner_id or user_map["Program Manager"].id,
                site_id=task.site_id,
                task_id=task.id,
                workstream_id=task.workstream_id,
                allocation_percent=25 if task.priority in {PriorityLevel.HIGH, PriorityLevel.CRITICAL} else 15,
                notes="Seeded task allocation",
                created_at=now,
            )
        )
    db.add_all(assignments)

    ptos = [
        PTO(user_id=user_map["Engineer One"].id, start_date=_days(2), end_date=_days(5), pto_type=PTOType.PTO, notes="Planned PTO", created_at=now),
        PTO(user_id=user_map["Engineer Two"].id, start_date=_days(12), end_date=_days(15), pto_type=PTOType.TRAINING, notes="Training week", created_at=now),
        PTO(user_id=user_map["Engineer Three"].id, start_date=_days(-3), end_date=_days(1), pto_type=PTOType.PTO, notes="Family leave", created_at=now),
    ]
    db.add_all(ptos)

    calls = [
        Call(
            title="Ops Working Session",
            owner_id=user_map["Program Manager"].id,
            start_datetime=datetime.combine(_days(1), time(10, 0), tzinfo=timezone.utc),
            end_datetime=datetime.combine(_days(1), time(11, 0), tzinfo=timezone.utc),
            call_type=CallType.CUSTOMER,
            related_site_id=sites[6].id,
            notes="Readiness checkpoint",
            created_at=now,
        ),
        Call(
            title="Go-NoGo Call - T-2 Sites",
            owner_id=user_map["Engineer Seven"].id,
            start_datetime=datetime.combine(_days(2), time(11, 0), tzinfo=timezone.utc),
            end_datetime=datetime.combine(_days(2), time(12, 0), tzinfo=timezone.utc),
            call_type=CallType.CUTOVER,
            related_site_id=sites[7].id,
            notes="Execution bridge readiness",
            created_at=now,
        ),
        Call(
            title="Review meeting / T-2 Sites",
            owner_id=user_map["Engineer Two"].id,
            start_datetime=datetime.combine(_days(3), time(8, 0), tzinfo=timezone.utc),
            end_datetime=datetime.combine(_days(3), time(9, 0), tzinfo=timezone.utc),
            call_type=CallType.PLANNING,
            related_site_id=sites[8].id,
            notes="Cross-workstream issue review",
            created_at=now,
        ),
    ]
    db.add_all(calls)

    artifacts = [
        Artifact(site_id=sites[0].id, task_id=tasks[0].id, artifact_type="runbook", name=f"{sites[0].site_name} Implementation Plan", url=f"https://example.com/artifacts/{sites[0].site_code.lower()}-plan", notes="Latest reviewed version", created_at=now),
        Artifact(site_id=sites[7].id, task_id=tasks[44].id, artifact_type="report", name=f"{sites[7].site_name} RF Review", url=f"https://example.com/artifacts/{sites[7].site_code.lower()}-rf", notes="Pending closure comment", created_at=now),
        Artifact(site_id=sites[8].id, task_id=None, artifact_type="checklist", name=f"{sites[8].site_name} Readiness Checklist", url=f"https://example.com/artifacts/{sites[8].site_code.lower()}-checklist", notes="Blocking item highlighted", created_at=now),
    ]
    db.add_all(artifacts)

    imports = [
        Import(
            file_name="workbook.xlsx",
            imported_at=now - timedelta(days=1),
            imported_by=user_map["Program Manager"].id,
            source_type="excel_workbook",
            status=ImportStatus.SUCCESS,
            summary_json={"sheets": ["Upcoming Migrations", "SD-WAN Tracker", "SDA Tracker", "Wireless Tracker"], "notes": "Matrix-style tracker import prototype"},
            created_tasks=26,
            updated_tasks=34,
            warnings_count=4,
            errors_count=1,
        ),
        Import(
            file_name="workbook.xlsx",
            imported_at=now - timedelta(days=9),
            imported_by=user_map["Engineer Two"].id,
            source_type="excel_workbook",
            status=ImportStatus.PARTIAL,
            summary_json={"sheets": ["Cutover Calendar", "PTOs"], "notes": "Calendar extraction only"},
            created_tasks=8,
            updated_tasks=12,
            warnings_count=6,
            errors_count=2,
        ),
    ]
    db.add_all(imports)
    db.flush()

    import_errors = [
        ImportError(import_id=imports[0].id, sheet_name="Wireless Tracker", row_number=5, field_name="Comments", severity="warning", message="Long tracker comment was truncated for preview surface.", raw_row_json={"site": sites[8].site_name}),
        ImportError(import_id=imports[1].id, sheet_name="Cutover Calendar", row_number=7, field_name="Plan Row", severity="error", message="Could not resolve referenced row into task linkage.", raw_row_json={"team": "SD-WAN", "task": "SD-WAN CONFIGURATION"}),
        ImportError(import_id=imports[1].id, sheet_name="PTOs", row_number=4, field_name="PTO", severity="warning", message="Ambiguous PTO range required manual year expansion.", raw_row_json={"name": "Engineer", "pto": "Dec 22-Jan 4"}),
    ]
    db.add_all(import_errors)

    db.commit()
    return {"users": len(users), "sites": len(sites), "tasks": len(tasks), "imports": len(imports)}


def resolve_default_workbook_path(explicit_path: str | Path | None = None) -> Path | None:
    candidates = []
    if explicit_path:
        candidates.append(Path(explicit_path))
    env_workbook_path = os.getenv("WORKBOOK_PATH")
    if env_workbook_path:
        candidates.append(Path(env_workbook_path))
    repo_root = Path(__file__).resolve().parents[3]
    candidates.extend(
        [
            repo_root / "workbook.xlsx",
            repo_root.parent / "workbook.xlsx",
            Path.cwd() / "workbook.xlsx",
            Path.home() / "Downloads" / "workbook.xlsx",
        ]
    )
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def enrich_imported_data(db: Session) -> None:
    users = db.scalars(select(User).order_by(User.name.asc())).all()
    sites = db.scalars(select(Site).order_by(Site.site_name.asc())).all()
    tasks = db.scalars(select(Task).order_by(Task.id.asc())).all()
    now = utcnow()

    if tasks and not db.scalar(select(TaskUpdate.id).limit(1)):
        fallback_author = next((user for user in users if user.name), None)
        for task in tasks[: min(40, len(tasks))]:
            comment_body = None
            raw = task.raw_import_json or {}
            if isinstance(raw.get("comment"), str) and raw.get("comment"):
                comment_body = str(raw["comment"]).splitlines()[0][:280]
            if not comment_body:
                comment_body = f"Migrated from {task.source_tab or 'workbook'} and normalized into portal tracking."
            db.add(
                TaskUpdate(
                    task_id=task.id,
                    author_id=task.owner_id or (fallback_author.id if fallback_author else None),
                    update_type=UpdateType.IMPORT,
                    body=comment_body,
                    created_at=now - timedelta(hours=(task.id % 12)),
                )
            )

    if tasks and not db.scalar(select(Assignment.id).limit(1)):
        seen_assignments: set[tuple[int, int | None, int | None]] = set()
        for task in tasks:
            if not task.owner_id:
                continue
            assignment_key = (task.owner_id, task.site_id, task.workstream_id)
            if assignment_key in seen_assignments:
                continue
            seen_assignments.add(assignment_key)
            db.add(
                Assignment(
                    user_id=task.owner_id,
                    site_id=task.site_id,
                    task_id=None,
                    workstream_id=task.workstream_id,
                    allocation_percent=25 if task.priority in {PriorityLevel.HIGH, PriorityLevel.CRITICAL} else 15,
                    notes=f"Generated from migrated workbook ownership ({task.source_tab or 'workbook'})",
                    created_at=now,
                )
            )

    if sites and not db.scalar(select(Artifact.id).limit(1)):
        for site in sites[: min(8, len(sites))]:
            db.add(
                Artifact(
                    site_id=site.id,
                    task_id=None,
                    artifact_type="plan",
                    name=f"{site.site_name} migration packet",
                    url=f"https://example.com/ops/{site.site_code.lower()}",
                    notes="Placeholder artifact generated after workbook migration",
                    created_at=now,
                )
            )

    db.commit()


def seed_demo_data(db: Session, reset: bool = False, workbook_path: str | Path | None = None) -> dict[str, int | str]:
    if reset:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(delete(table))
        db.commit()

    if db.scalar(select(Site.id).limit(1)):
        return {"mode": "existing", "users": 0, "sites": 0, "tasks": 0, "imports": 0}

    ensure_reference_data(db)
    workbook = resolve_default_workbook_path(workbook_path)
    if workbook:
        record = import_workbook(db, source=workbook, file_name=workbook.name)
        enrich_imported_data(db)
        return {
            "mode": "workbook",
            "users": db.scalar(select(func.count()).select_from(User)) or 0,
            "sites": db.scalar(select(func.count()).select_from(Site)) or 0,
            "tasks": db.scalar(select(func.count()).select_from(Task)) or 0,
            "imports": db.scalar(select(func.count()).select_from(Import)) or 0,
            "workbook": str(workbook),
            "import_status": record.status.value,
        }

    if not _env_truthy("ALLOW_DEMO_FALLBACK", default=True):
        return {"mode": "empty", "users": 0, "sites": 0, "tasks": 0, "imports": 0}

    fallback = _seed_fallback_demo_data(db)
    return {"mode": "fallback", **fallback}
