from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
import re

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.enums import MigrationWindowStatus, TaskStatus
from app.core.tracker_rules import filter_user_facing_tasks, is_reference_only_tracker_task
from app.core.timeline import infer_timeline, timeline_due_date_from_text, timeline_window_from_label
from app.imports.base import site_slug
from app.models.execution import Task, TaskUpdate
from app.models.people import Assignment, User
from app.models.planning import MigrationWindow, Site, Workstream
from app.schemas.common import WorkstreamLite
from app.schemas.sites import (
    ArtifactRecord,
    MigrationWindowRecord,
    SiteCreateRequest,
    SiteDetailResponse,
    SiteListItem,
    SitePatchRequest,
    SitePeerReviewerAssignRequest,
    TaskGroup,
    TechnologyTaskSummary,
)
from app.utils.serializers import task_record, task_update_record, workstream_lite

TECHNOLOGY_WORKSTREAMS = (
    ("SDWAN", "SD-WAN"),
    ("SDA", "SDA"),
    ("WIRELESS", "Wireless"),
)

PRIMARY_TRACKER_SOURCE_TAB = {
    "SDWAN": "SD-WAN Tracker",
    "SDA": "SDA Tracker",
    "WIRELESS": "Wireless Tracker",
}

PEER_REVIEW_ASSIGNMENT_NOTE = "__peer_review__"
TIMELINE_HINT_PATTERN = re.compile(r"\bT\s*-\s*\d+\b", re.IGNORECASE)


def _site_query():
    return (
        select(Site)
        .options(
            selectinload(Site.tasks).selectinload(Task.site),
            selectinload(Site.tasks).selectinload(Task.workstream),
            selectinload(Site.tasks).selectinload(Task.owner),
            selectinload(Site.tasks).selectinload(Task.migration_window),
            selectinload(Site.tasks).selectinload(Task.updates).selectinload(TaskUpdate.author),
            selectinload(Site.assignments).selectinload(Assignment.user),
            selectinload(Site.assignments).selectinload(Assignment.workstream),
            selectinload(Site.migration_windows).selectinload(MigrationWindow.workstream),
            selectinload(Site.artifacts),
        )
        .order_by(Site.site_name.asc())
    )


def _normalize_workstream_key(value: str) -> str:
    return value.upper().replace("-", "").strip()


def _generated_site_code(site_name: str) -> str:
    slug = site_slug(site_name) or "NEW-SITE"
    return f"PORTAL-{slug[:24].upper()}"


def _site_has_window_on_or_after(site: Site, from_date: date) -> bool:
    return any(window.scheduled_date >= from_date for window in site.migration_windows)


def _site_next_window(site: Site, from_date: date | None = None) -> date | None:
    candidates = [
        window.scheduled_date
        for window in site.migration_windows
        if from_date is None or window.scheduled_date >= from_date
    ]
    return min(candidates, default=None)


def _visible_site_tasks(site: Site) -> list[Task]:
    return filter_user_facing_tasks(site.tasks)


def _is_peer_review_assignment(assignment: Assignment) -> bool:
    return (assignment.notes or "").strip().startswith(PEER_REVIEW_ASSIGNMENT_NOTE)


def _timeline_hint_text(value: object | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _has_explicit_timeline_hint(value: object | None) -> bool:
    text = _timeline_hint_text(value)
    return bool(text and TIMELINE_HINT_PATTERN.search(text))


def _task_template_priority(task: Task) -> tuple[int, int, int]:
    raw = task.raw_import_json or {}
    aux = raw.get("aux") if isinstance(raw, dict) else None
    return (
        1 if task.source_type == "excel_workbook" else 0,
        1 if _has_explicit_timeline_hint(aux) else 0,
        -(task.id or 0),
    )


def _template_aux_lookup(tasks: list[Task]) -> tuple[dict[str, str], dict[tuple[str | None, str], str]]:
    by_row_key: dict[str, str] = {}
    by_phase_title: dict[tuple[str | None, str], str] = {}
    for task in tasks:
        raw = task.raw_import_json or {}
        aux = raw.get("aux") if isinstance(raw, dict) else None
        hint = _timeline_hint_text(aux)
        if not _has_explicit_timeline_hint(hint):
            continue
        if task.source_row_key:
            by_row_key.setdefault(task.source_row_key, hint)
        by_phase_title.setdefault((task.phase, task.title), hint)
    return by_row_key, by_phase_title


def _template_tasks_for_workstream(db: Session, workstream_key: str) -> list[Task]:
    source_tab = PRIMARY_TRACKER_SOURCE_TAB.get(workstream_key)
    if not source_tab:
        return []

    tasks = filter_user_facing_tasks(db.scalars(
        select(Task)
        .join(Task.workstream)
        .options(selectinload(Task.workstream))
        .where(Workstream.key == workstream_key, Task.source_tab == source_tab)
        .order_by(Task.source_row_key.asc(), Task.id.asc())
    ).all())

    grouped: dict[tuple[str | None, str, str | None], list[Task]] = defaultdict(list)
    for task in tasks:
        grouped[(task.phase, task.title, task.source_row_key)].append(task)

    unique_templates: list[Task] = []
    for key in sorted(grouped, key=lambda item: ((item[0] or "").lower(), item[1].lower(), item[2] or "")):
        candidates = grouped[key]
        best = max(candidates, key=_task_template_priority)
        unique_templates.append(best)
    return unique_templates


def _site_reference_window(site: Site, scheduled_date: date | None = None) -> MigrationWindow | None:
    if scheduled_date is not None:
        exact = next((window for window in site.migration_windows if window.scheduled_date == scheduled_date), None)
        if exact:
            return exact
    future_windows = sorted(
        (window for window in site.migration_windows if window.scheduled_date >= date.today()),
        key=lambda item: item.scheduled_date,
    )
    if future_windows:
        return future_windows[0]
    existing = sorted(site.migration_windows, key=lambda item: item.scheduled_date)
    return existing[0] if existing else None


def _sync_site_tracker_schedule(
    db: Session,
    site: Site,
    *,
    scheduled_date: date | None,
    reference_window: MigrationWindow | None,
) -> None:
    tracker_tabs = set(PRIMARY_TRACKER_SOURCE_TAB.values())
    template_aux_cache: dict[str, tuple[dict[str, str], dict[tuple[str | None, str], str]]] = {}
    for task in site.tasks:
        if task.source_tab not in tracker_tabs:
            continue

        raw = dict(task.raw_import_json or {})
        if is_reference_only_tracker_task(task):
            task.migration_window_id = None
            task.due_date = None
            raw["scheduled_date"] = None
            task.raw_import_json = raw
            continue

        task.migration_window_id = reference_window.id if reference_window else None
        if reference_window is not None:
            task.migration_window = reference_window

        raw["scheduled_date"] = scheduled_date.isoformat() if scheduled_date else None
        aux_value = raw.get("aux")
        workstream_key = task.workstream.key if task.workstream else None
        if workstream_key and not _has_explicit_timeline_hint(aux_value):
            if workstream_key not in template_aux_cache:
                template_aux_cache[workstream_key] = _template_aux_lookup(_template_tasks_for_workstream(db, workstream_key))
            by_row_key, by_phase_title = template_aux_cache[workstream_key]
            borrowed_hint = (
                by_row_key.get(task.source_row_key or "")
                or by_phase_title.get((task.phase, task.title))
            )
            if borrowed_hint:
                raw["aux"] = borrowed_hint
                aux_value = borrowed_hint
        due_date = timeline_due_date_from_text(
            str(aux_value).strip() if aux_value not in (None, "") else None,
            scheduled_date,
        )
        if due_date is None:
            timeline_label, _timeline_order = infer_timeline(task.phase, task.title, task.source_tab)
            _start, fallback_due, _label = timeline_window_from_label(timeline_label, scheduled_date)
            due_date = fallback_due

        task.due_date = due_date
        task.raw_import_json = raw


def _site_owner_for_workstream(site: Site, workstream_key: str) -> User | None:
    for task in _visible_site_tasks(site):
        if task.workstream and task.workstream.key == workstream_key and task.owner:
            return task.owner
    for assignment in site.assignments:
        if _is_peer_review_assignment(assignment):
            continue
        if assignment.workstream and assignment.workstream.key == workstream_key and assignment.user:
            return assignment.user
    for task in _visible_site_tasks(site):
        if task.owner:
            return task.owner
    for assignment in site.assignments:
        if _is_peer_review_assignment(assignment):
            continue
        if assignment.user:
            return assignment.user
    return None


def _site_peer_reviewer_for_workstream(site: Site, workstream_key: str) -> User | None:
    for assignment in site.assignments:
        if not _is_peer_review_assignment(assignment):
            continue
        if assignment.workstream and assignment.workstream.key == workstream_key and assignment.user:
            return assignment.user
    return None


def _site_engineer_hint(site: Site, workstream_key: str, owner: User | None) -> str | None:
    for task in _visible_site_tasks(site):
        if task.workstream and task.workstream.key != workstream_key:
            continue
        raw = task.raw_import_json or {}
        if isinstance(raw, dict) and raw.get("site_engineer_hint"):
            return str(raw["site_engineer_hint"]).strip()
    for task in _visible_site_tasks(site):
        raw = task.raw_import_json or {}
        if isinstance(raw, dict) and raw.get("site_engineer_hint"):
            return str(raw["site_engineer_hint"]).strip()
    if owner and owner.name:
        return owner.name.split()[0].strip()
    return None


def _ensure_assignment(db: Session, site: Site, workstream: Workstream, owner: User | None) -> None:
    if owner is None:
        return
    exists = any(
        assignment.user_id == owner.id and assignment.workstream_id == workstream.id and assignment.site_id == site.id
        for assignment in site.assignments
    )
    if exists:
        return
    assignment = Assignment(
        user_id=owner.id,
        site_id=site.id,
        task_id=None,
        workstream_id=workstream.id,
        allocation_percent=25,
        notes="Generated to keep tracker coverage aligned across all workbook lanes",
        created_at=datetime.now(timezone.utc),
    )
    db.add(assignment)
    site.assignments.append(assignment)


def assign_site_peer_reviewer(db: Session, site_id: int, payload: SitePeerReviewerAssignRequest) -> SiteDetailResponse | None:
    site = db.scalar(_site_query().where(Site.id == site_id))
    if not site:
        return None

    wanted = _normalize_workstream_key(payload.workstream)
    workstream = db.scalar(select(Workstream).where(Workstream.key == wanted))
    if workstream is None:
        raise ValueError(f"Workstream '{payload.workstream}' not found")

    existing = [
        assignment
        for assignment in site.assignments
        if _is_peer_review_assignment(assignment)
        and assignment.workstream_id == workstream.id
        and assignment.site_id == site.id
    ]
    for assignment in existing:
        db.delete(assignment)

    if payload.reviewer_id is not None:
        reviewer = db.scalar(select(User).where(User.id == payload.reviewer_id))
        if reviewer is None:
            raise ValueError("Peer reviewer not found")
        assignment = Assignment(
            user_id=reviewer.id,
            site_id=site.id,
            task_id=None,
            workstream_id=workstream.id,
            allocation_percent=10,
            notes=f"{PEER_REVIEW_ASSIGNMENT_NOTE} {workstream.key}",
            created_at=datetime.now(timezone.utc),
        )
        db.add(assignment)

    db.commit()
    return get_site_detail(db, site_id)


def _seed_missing_workstream_tasks(
    db: Session,
    *,
    site: Site,
    workstream: Workstream,
    scheduled_date: date | None = None,
    owner: User | None = None,
    source_type: str,
    created_from: str,
) -> int:
    existing_keys = {
        (task.phase, task.title)
        for task in _visible_site_tasks(site)
        if task.workstream and task.workstream.key == workstream.key
    }
    templates = _template_tasks_for_workstream(db, workstream.key)
    if not templates:
        return 0

    owner = owner or _site_owner_for_workstream(site, workstream.key)
    engineer_hint = _site_engineer_hint(site, workstream.key, owner)
    source_column_key = f"{site.site_name} ({engineer_hint})" if engineer_hint else site.site_name
    reference_window = _site_reference_window(site, scheduled_date)
    effective_date = scheduled_date or (reference_window.scheduled_date if reference_window else None)
    if reference_window is None and effective_date is not None:
        reference_window = MigrationWindow(
            site_id=site.id,
            workstream_id=workstream.id,
            scheduled_date=effective_date,
            status=MigrationWindowStatus.PLANNED,
            notes="Generated to backfill missing tracker coverage",
        )
        db.add(reference_window)
        db.flush()
        site.migration_windows.append(reference_window)

    created = 0
    for template in templates:
        dedupe_key = (template.phase, template.title)
        if dedupe_key in existing_keys:
            continue

        raw = dict(template.raw_import_json or {})
        if source_type == "portal_create" and created_from == "portal":
            raw.pop("comment", None)
            raw.pop("status", None)
            raw.pop("owner", None)
            raw["portal_seed_pristine"] = True
        raw_aux = raw.get("aux")
        timeline_label, _timeline_order = infer_timeline(template.phase, template.title, template.source_tab)
        due_date = timeline_due_date_from_text(str(raw_aux) if raw_aux else None, effective_date)
        if due_date is None:
            _start, fallback_due, _label = timeline_window_from_label(timeline_label, effective_date)
            due_date = fallback_due

        task = Task(
            site_id=site.id,
            workstream_id=workstream.id,
            migration_window_id=reference_window.id if reference_window else None,
            phase=template.phase,
            title=template.title,
            description=None if source_type == "portal_create" and created_from == "portal" else template.description,
            status=TaskStatus.NA if source_type == "portal_create" and created_from == "portal" else TaskStatus.NOT_STARTED,
            priority=template.priority,
            owner_id=owner.id if owner else None,
            due_date=due_date,
            source_type=source_type,
            source_tab=template.source_tab,
            source_row_key=template.source_row_key,
            source_column_key=source_column_key,
            raw_import_json={
                **raw,
                "site_name": site.site_name,
                "header_label": source_column_key,
                "site_engineer_hint": engineer_hint or raw.get("site_engineer_hint"),
                "scheduled_date": effective_date.isoformat() if effective_date else None,
                "created_from": created_from,
            },
        )
        db.add(task)
        site.tasks.append(task)
        existing_keys.add(dedupe_key)
        created += 1

    if created:
        _ensure_assignment(db, site, workstream, owner)
    return created


def ensure_tracker_coverage(
    db: Session,
    *,
    site_ids: list[int] | None = None,
    commit: bool = True,
    source_type: str = "tracker_backfill",
    created_from: str = "coverage_repair",
) -> dict[str, int]:
    query = _site_query()
    if site_ids:
        query = query.where(Site.id.in_(site_ids))
    sites = db.scalars(query).unique().all()
    workstreams = {
        item.key: item
        for item in db.scalars(select(Workstream).where(Workstream.key.in_([key for key, _label in TECHNOLOGY_WORKSTREAMS]))).all()
    }

    tasks_created = 0
    sites_touched = 0
    for site in sites:
        site_created = 0
        reference_window = _site_reference_window(site)
        default_date = reference_window.scheduled_date if reference_window else None
        for workstream_key, _label in TECHNOLOGY_WORKSTREAMS:
            workstream = workstreams.get(workstream_key)
            if workstream is None:
                continue
            site_created += _seed_missing_workstream_tasks(
                db,
                site=site,
                workstream=workstream,
                scheduled_date=default_date,
                source_type=source_type,
                created_from=created_from,
            )
        if site_created:
            tasks_created += site_created
            sites_touched += 1

    if commit:
        db.commit()
    return {"sites_touched": sites_touched, "tasks_created": tasks_created}


def list_sites(
    db: Session,
    *,
    search: str | None = None,
    region: str | None = None,
    wave: str | None = None,
    active: bool | None = None,
    workstream: str | None = None,
    view: str | None = None,
    from_date: date | None = None,
) -> list[SiteListItem]:
    sites = db.scalars(_site_query()).unique().all()
    today = date.today()

    if search:
        needle = search.lower().strip()
        sites = [site for site in sites if needle in site.site_name.lower() or needle in site.site_code.lower()]
    if region:
        sites = [site for site in sites if site.region == region]
    if wave:
        sites = [site for site in sites if site.migration_wave == wave]
    if active is not None:
        sites = [site for site in sites if site.active == active]
    if workstream:
        wanted = workstream.upper().replace("-", "")
        sites = [site for site in sites if any(task.workstream and task.workstream.key.replace("-", "") == wanted for task in _visible_site_tasks(site))]
    if from_date:
        sites = [site for site in sites if _site_has_window_on_or_after(site, from_date)]
    if view == "upcoming":
        cutoff = max(filter(None, [today, from_date])) if from_date else today
        sites = [site for site in sites if any(window.scheduled_date >= cutoff for window in site.migration_windows)]
    if view == "blocked":
        sites = [site for site in sites if any(task.status == TaskStatus.NOT_STARTED for task in _visible_site_tasks(site))]
    if view == "this-week":
        week_end = today.fromordinal(today.toordinal() + (6 - today.weekday()))
        sites = [
            site
            for site in sites
            if any(today <= window.scheduled_date <= week_end for window in site.migration_windows)
        ]

    items = []
    for site in sites:
        visible_tasks = _visible_site_tasks(site)
        next_window = _site_next_window(site, from_date)
        open_tasks = sum(1 for task in visible_tasks if task.status != TaskStatus.DONE)
        blocked_tasks = sum(1 for task in visible_tasks if task.status == TaskStatus.NOT_STARTED)
        done_tasks = sum(1 for task in visible_tasks if task.status == TaskStatus.DONE)
        workstreams = sorted({task.workstream.name for task in visible_tasks if task.workstream})
        technology_summaries = [
            TechnologyTaskSummary(
                key=key,
                label=label,
                total_tasks=len(technology_tasks := [task for task in visible_tasks if task.workstream and task.workstream.key == key]),
                open_tasks=sum(1 for task in technology_tasks if task.status != TaskStatus.DONE),
                blocked_tasks=sum(1 for task in technology_tasks if task.status == TaskStatus.NOT_STARTED),
                done_tasks=sum(1 for task in technology_tasks if task.status == TaskStatus.DONE),
                owner_name=(_site_owner_for_workstream(site, key).name if _site_owner_for_workstream(site, key) else None),
                peer_reviewer_name=(_site_peer_reviewer_for_workstream(site, key).name if _site_peer_reviewer_for_workstream(site, key) else None),
            )
            for key, label in TECHNOLOGY_WORKSTREAMS
        ]
        items.append(
            SiteListItem(
                id=site.id,
                site_code=site.site_code,
                site_name=site.site_name,
                region=site.region,
                market=site.market,
                migration_wave=site.migration_wave,
                active=site.active,
                open_tasks=open_tasks,
                blocked_tasks=blocked_tasks,
                done_tasks=done_tasks,
                next_migration_date=next_window,
                workstreams=workstreams,
                technology_summaries=technology_summaries,
            )
        )
    items.sort(key=lambda item: (item.next_migration_date or date.max, item.site_name.lower()))
    return items


def get_site_detail(db: Session, site_id: int) -> SiteDetailResponse | None:
    site = db.scalar(_site_query().where(Site.id == site_id))
    if not site:
        return None

    site_item = next((item for item in list_sites(db) if item.id == site.id), None)
    if site_item is None:
        return None

    grouped: dict[str, list] = defaultdict(list)
    workstream_meta = {}
    for task in _visible_site_tasks(site):
        key = task.workstream.key if task.workstream else "UNASSIGNED"
        if task.workstream:
            workstream_meta[key] = task.workstream
        grouped[key].append(task_record(task))

    task_groups = []
    for workstream_key, workstream_label in TECHNOLOGY_WORKSTREAMS:
        matching_workstream = workstream_meta.get(workstream_key)
        task_groups.append(
            TaskGroup(
                workstream=workstream_lite(matching_workstream) or WorkstreamLite(key=workstream_key, name=workstream_label),
                tasks=sorted(
                    grouped.pop(workstream_key, []),
                    key=lambda item: (item.timeline_order, item.due_date or date.max, item.title.lower()),
                ),
            )
        )

    extra_group_order = {"PROGRAM": 40, "UNASSIGNED": 90}
    for group_key, group_tasks in sorted(
        grouped.items(),
        key=lambda item: (
            extra_group_order.get(item[0], 80),
            (workstream_meta.get(item[0]).name if workstream_meta.get(item[0]) else item[0]).lower(),
        ),
    ):
        matching_workstream = workstream_meta.get(group_key)
        task_groups.append(
            TaskGroup(
                workstream=workstream_lite(matching_workstream)
                or WorkstreamLite(
                    key=group_key,
                    name="Unassigned" if group_key == "UNASSIGNED" else group_key.replace("_", " ").title(),
                ),
                tasks=sorted(group_tasks, key=lambda item: (item.timeline_order, item.due_date or date.max, item.title.lower())),
            )
        )

    updates = sorted([update for task in _visible_site_tasks(site) for update in task.updates], key=lambda item: item.created_at, reverse=True)

    return SiteDetailResponse(
        site=site_item,
        migration_windows=[
            MigrationWindowRecord(
                id=window.id,
                scheduled_date=window.scheduled_date,
                start_time=window.start_time,
                end_time=window.end_time,
                status=window.status.value,
                change_ticket=window.change_ticket,
                notes=window.notes,
                workstream=workstream_lite(window.workstream),
            )
            for window in sorted(site.migration_windows, key=lambda item: item.scheduled_date)
        ],
        task_groups=task_groups,
        updates=[task_update_record(update) for update in updates[:16]],
        artifacts=[
            ArtifactRecord(
                id=artifact.id,
                artifact_type=artifact.artifact_type,
                name=artifact.name,
                url=artifact.url,
                notes=artifact.notes,
                created_at=artifact.created_at,
            )
            for artifact in sorted(site.artifacts, key=lambda item: item.created_at, reverse=True)
        ],
        recent_changes=[f"{update.created_at.date().isoformat()} | {update.body}" for update in updates[:6]],
    )


def create_site(db: Session, payload: SiteCreateRequest) -> SiteDetailResponse:
    existing_site = db.scalar(select(Site).where(Site.site_name == payload.site_name))
    if existing_site:
        raise ValueError(f"Site '{payload.site_name}' already exists")

    site_code = (payload.site_code or "").strip() or _generated_site_code(payload.site_name)
    duplicate_code = db.scalar(select(Site).where(Site.site_code == site_code))
    if duplicate_code:
        raise ValueError(f"Site code '{site_code}' already exists")

    owner = db.scalar(select(User).where(User.id == payload.owner_id)) if payload.owner_id else None
    owner_by_workstream = {
        "SDWAN": db.scalar(select(User).where(User.id == payload.sdwan_owner_id)) if payload.sdwan_owner_id else owner,
        "SDA": db.scalar(select(User).where(User.id == payload.sda_owner_id)) if payload.sda_owner_id else owner,
        "WIRELESS": db.scalar(select(User).where(User.id == payload.wireless_owner_id)) if payload.wireless_owner_id else owner,
    }

    site = Site(
        site_code=site_code,
        site_name=payload.site_name.strip(),
        region=payload.region.strip() or "Northeast",
        market=payload.market.strip() or "Imported",
        migration_wave=(payload.migration_wave or "").strip() or None,
        notes=(payload.notes or "").strip() or "Portal-created site",
        active=True,
    )
    db.add(site)
    db.flush()

    window = MigrationWindow(
        site_id=site.id,
        workstream_id=None,
        scheduled_date=payload.scheduled_date,
        status=MigrationWindowStatus.PLANNED,
        notes=(payload.notes or "").strip() or "Portal-created migration window",
    )
    db.add(window)
    db.flush()

    reloaded_site = db.scalar(_site_query().where(Site.id == site.id))
    if reloaded_site is None:
        raise ValueError("Site was created but could not be reloaded for tracker seeding")

    workstreams = {
        item.key: item
        for item in db.scalars(select(Workstream).where(Workstream.key.in_([key for key, _label in TECHNOLOGY_WORKSTREAMS]))).all()
    }
    for tracker_workstream_key, _label in TECHNOLOGY_WORKSTREAMS:
        tracker_workstream = workstreams.get(tracker_workstream_key)
        if tracker_workstream is None:
            continue
        _seed_missing_workstream_tasks(
            db,
            site=reloaded_site,
            workstream=tracker_workstream,
            scheduled_date=payload.scheduled_date,
            owner=owner_by_workstream.get(tracker_workstream_key),
            source_type="portal_create",
            created_from="portal",
        )

    _sync_site_tracker_schedule(
        db,
        reloaded_site,
        scheduled_date=payload.scheduled_date,
        reference_window=_site_reference_window(reloaded_site, payload.scheduled_date),
    )

    db.commit()
    detail = get_site_detail(db, site.id)
    if detail is None:
        raise ValueError("Site was created but could not be reloaded")
    return detail


def patch_site(db: Session, site_id: int, payload: SitePatchRequest) -> SiteDetailResponse | None:
    site = db.scalar(_site_query().where(Site.id == site_id))
    if not site:
        return None

    if payload.active is not None:
        site.active = payload.active

    if payload.notes is not None:
        site.notes = (payload.notes or "").strip() or None

    if payload.scheduled_date is not None:
        reference_window = _site_reference_window(site)
        if reference_window is None:
            reference_window = MigrationWindow(
                site_id=site.id,
                workstream_id=None,
                scheduled_date=payload.scheduled_date,
                status=MigrationWindowStatus.PLANNED,
                notes="Portal-maintained implementation date",
            )
            db.add(reference_window)
            db.flush()
            site.migration_windows.append(reference_window)
        else:
            reference_window.scheduled_date = payload.scheduled_date
            if reference_window.status is None:
                reference_window.status = MigrationWindowStatus.PLANNED

        _sync_site_tracker_schedule(
            db,
            site,
            scheduled_date=payload.scheduled_date,
            reference_window=reference_window,
        )

    db.commit()
    return get_site_detail(db, site_id)
