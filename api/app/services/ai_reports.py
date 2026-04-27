from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
import json
from json import JSONDecodeError
from typing import Any
from urllib import error, request
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.execution import AiReportRun
from app.schemas.ai_reports import AiModelOption, AiReportUsageEntry, AiReportUsageSummary, ReportType, SiteAiReportResponse, SiteAiTechnologySnapshot
from app.services.ops import get_site_health, get_site_velocity, get_triage_sites
from app.services.sites import get_site_detail

settings = get_settings()

AI_MODEL_LABELS = {
    "gpt-5-mini": "GPT-5 Mini",
    "gpt-5.2-chat": "GPT-5.2 Chat",
    "gpt-5.2": "GPT-5.2",
    "o4-mini": "o4 Mini",
    "gpt-4.1-mini": "GPT-4.1 Mini",
    "gpt-4.1": "GPT-4.1",
    "google/gemini-2.5-flash-preview-04-17": "Gemini 2.5 Flash",
    "google/gemini-2.5-pro-preview-05-06": "Gemini 2.5 Pro",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0": "Claude Haiku 3.5",
    "us.anthropic.claude-3-7-sonnet-20250219-v1:0": "Claude Sonnet 3.7",
    "us.anthropic.claude-sonnet-4-20250514-v1:0": "Claude Sonnet 4",
    "mistral-large-2411": "Mistral Large",
    "us.meta.llama4-maverick-17b-instruct-v1:0": "Llama 4 Maverick",
}

CURATED_MODEL_ORDER = [
    "gpt-4.1-mini",
    "gpt-4.1",
    "o4-mini",
    "gpt-5.2-chat",
    "gpt-5.2",
    "google/gemini-2.5-flash-preview-04-17",
    "google/gemini-2.5-pro-preview-05-06",
    "us.anthropic.claude-3-5-haiku-20241022-v1:0",
    "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
    "us.anthropic.claude-sonnet-4-20250514-v1:0",
    "mistral-large-2411",
    "us.meta.llama4-maverick-17b-instruct-v1:0",
]

REPORT_TYPE_GUIDANCE: dict[ReportType, str] = {
    "go_no_go": "Focus on next-window readiness, T-2 completion, peer review, and whether the site looks ready, at risk, or no-go likely.",
    "executive": "Focus on a polished leadership-ready summary with explicit dates, risks, owner gaps, and practical next steps.",
    "status_update": "Focus on this week's operating picture, blockers, immediate follow-ups, and concise status language for an internal update.",
}


@dataclass(frozen=True)
class AiReportActor:
    key: str
    label: str
    source: str


class AiReportLimitExceeded(RuntimeError):
    pass


def _ensure_configured() -> None:
    if not settings.ai_gateway_token:
        raise ValueError("CX AI Playground token is not configured on the API.")


def _ai_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    _ensure_configured()

    url = f"{settings.ai_gw_playground_base_url.rstrip('/')}{path}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {settings.ai_gateway_token}",
    }
    if body is not None:
        headers["Content-Type"] = "application/json"

    req = request.Request(url, data=body, headers=headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=settings.ai_gw_timeout_seconds) as response:
            raw = response.read().decode("utf-8", "ignore")
            return json.loads(raw) if raw else {}
    except error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", "ignore")
        trimmed = body_text[:400] if body_text else exc.reason
        raise RuntimeError(f"CX AI Playground error {exc.code}: {trimmed}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"CX AI Playground request failed: {exc.reason}") from exc


def _vendor_name(model_id: str, owned_by: str | None = None) -> str:
    if model_id.startswith("google/"):
        return "google"
    if model_id.startswith("us.anthropic."):
        return "anthropic"
    if model_id.startswith("us.meta."):
        return "meta"
    if model_id.startswith("mistral"):
        return "mistral"
    vendor = (owned_by or "").lower()
    if vendor:
        return vendor
    return "openai"


def list_ai_models() -> list[AiModelOption]:
    payload = _ai_request("GET", "/v1/models")
    raw_items = payload.get("data", []) if isinstance(payload, dict) else []
    by_id = {item.get("id"): item for item in raw_items if isinstance(item, dict) and item.get("id")}

    models: list[AiModelOption] = []
    for model_id in CURATED_MODEL_ORDER:
        item = by_id.get(model_id)
        if not item:
            continue
        models.append(
            AiModelOption(
                id=model_id,
                label=AI_MODEL_LABELS.get(model_id, model_id),
                vendor=_vendor_name(model_id, str(item.get("owned_by") or "")),
                is_default=model_id == settings.ai_default_model,
            )
        )

    if not models:
        for item in raw_items:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            model_id = str(item["id"])
            models.append(
                AiModelOption(
                    id=model_id,
                    label=AI_MODEL_LABELS.get(model_id, model_id),
                    vendor=_vendor_name(model_id, str(item.get("owned_by") or "")),
                    is_default=model_id == settings.ai_default_model,
                )
            )

    return models


def _report_token_param(model: str) -> str:
    if model.startswith("gpt-5") or model.startswith("o3") or model.startswith("o4"):
        return "max_completion_tokens"
    return "max_tokens"


def _extract_response_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") if isinstance(payload, dict) else None
    if not isinstance(choices, list) or not choices:
        return ""
    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
        return "\n".join(part for part in parts if part).strip()
    return str(content or "").strip()


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    candidate = raw_text.strip()
    if candidate.startswith("```"):
        candidate = candidate.strip("`")
        if candidate.lower().startswith("json"):
            candidate = candidate[4:].lstrip()
    decoder = json.JSONDecoder()
    for index, char in enumerate(candidate):
        if char != "{":
            continue
        try:
            parsed, _end = decoder.raw_decode(candidate[index:])
            if isinstance(parsed, dict):
                return parsed
        except JSONDecodeError:
            continue
    raise ValueError("The AI response was not valid JSON.")


def _clean_lines(values: Any, limit: int) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    for item in values:
        text = str(item or "").strip()
        if not text:
            continue
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned


def _context_for_site(db: Session, site_id: int) -> dict[str, Any] | None:
    detail = get_site_detail(db, site_id)
    if detail is None:
        return None

    health = get_site_health(db, site_id)
    velocity = get_site_velocity(db, site_id)
    triage = next((item for item in get_triage_sites(db) if item.site_id == site_id), None)

    readiness_by_key = {
        item.workstream_key: item.model_dump(mode="json")
        for item in (triage.technology_readiness if triage else [])
    }
    technology_summary: list[dict[str, Any]] = []
    for summary in detail.site.technology_summaries:
        technology_summary.append(
            {
                "workstream_key": summary.key,
                "workstream_name": summary.label,
                "owner_name": summary.owner_name,
                "peer_reviewer_name": summary.peer_reviewer_name,
                "total_tasks": summary.total_tasks,
                "open_tasks": summary.open_tasks,
                "pending_tasks": summary.blocked_tasks,
                "done_tasks": summary.done_tasks,
                "triage_readiness": readiness_by_key.get(summary.key),
            }
        )

    open_tasks: list[dict[str, Any]] = []
    for group in detail.task_groups:
        workstream_name = group.workstream.name if group.workstream else "Unassigned"
        for task in group.tasks:
            if task.status.value.upper() == "DONE":
                continue
            open_tasks.append(
                {
                    "workstream_name": workstream_name,
                    "timeline_label": task.timeline_label,
                    "phase": task.phase,
                    "title": task.title,
                    "status": task.status.label,
                    "priority": task.priority.label,
                    "owner_name": task.owner.name if task.owner else None,
                    "due_date": task.due_date,
                    "implementation_date": task.implementation_date,
                    "note_preview": task.note_preview,
                }
            )
            if len(open_tasks) >= 12:
                break
        if len(open_tasks) >= 12:
            break

    recent_updates = [
        {
            "created_at": update.created_at,
            "author_name": update.author.name if update.author else None,
            "update_type": update.update_type,
            "body": update.body,
        }
        for update in detail.updates[:6]
    ]

    return {
        "today": date.today().isoformat(),
        "site": {
            "id": detail.site.id,
            "site_name": detail.site.site_name,
            "site_code": detail.site.site_code,
            "region": detail.site.region,
            "market": detail.site.market,
            "migration_wave": detail.site.migration_wave,
            "next_migration_date": detail.site.next_migration_date,
            "open_tasks": detail.site.open_tasks,
            "pending_tasks": detail.site.blocked_tasks,
            "done_tasks": detail.site.done_tasks,
        },
        "migration_windows": [
            {
                "scheduled_date": window.scheduled_date,
                "status": window.status,
                "change_ticket": window.change_ticket,
                "workstream_name": window.workstream.name if window.workstream else None,
            }
            for window in detail.migration_windows[:4]
        ],
        "health": health.model_dump(mode="json") if health else None,
        "velocity": velocity.model_dump(mode="json") if velocity else None,
        "triage": triage.model_dump(mode="json") if triage else None,
        "technology_summary": technology_summary,
        "focus_open_tasks": open_tasks,
        "recent_updates": recent_updates,
        "recent_changes": detail.recent_changes[:6],
    }


def _usage_window_bounds() -> tuple[datetime, datetime]:
    tz = ZoneInfo(settings.ai_reports_limit_timezone)
    now_local = datetime.now(tz)
    start_local = datetime.combine(now_local.date(), time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _count_actor_runs_today(db: Session, actor_key: str) -> int:
    start_utc, end_utc = _usage_window_bounds()
    stmt = select(func.count(AiReportRun.id)).where(
        AiReportRun.actor_key == actor_key,
        AiReportRun.created_at >= start_utc,
        AiReportRun.created_at < end_utc,
    )
    return int(db.execute(stmt).scalar_one() or 0)


def _usage_totals(db: Session, actor_key: str) -> tuple[int, int, int]:
    used_today = _count_actor_runs_today(db, actor_key)
    daily_limit = max(settings.ai_reports_daily_limit, 0)
    remaining_today = max(daily_limit - used_today, 0)
    return daily_limit, used_today, remaining_today


def _recent_usage_entries(db: Session) -> list[AiReportUsageEntry]:
    stmt = (
        select(AiReportRun)
        .order_by(AiReportRun.created_at.desc(), AiReportRun.id.desc())
        .limit(settings.ai_reports_recent_runs_limit)
    )
    entries = db.execute(stmt).scalars().all()
    return [
        AiReportUsageEntry(
            id=entry.id,
            actor_label=entry.actor_label or entry.actor_key,
            actor_source=entry.actor_source,
            site_id=entry.site_id,
            site_name=entry.site_name_snapshot,
            model=entry.model,
            report_type=entry.report_type,  # type: ignore[arg-type]
            status=entry.status,
            created_at=entry.created_at,
            error_message=entry.error_message,
        )
        for entry in entries
    ]


def get_ai_usage_summary(db: Session, actor: AiReportActor) -> AiReportUsageSummary:
    daily_limit, used_today, remaining_today = _usage_totals(db, actor.key)
    return AiReportUsageSummary(
        actor_label=actor.label,
        actor_source=actor.source,
        daily_limit=daily_limit,
        used_today=used_today,
        remaining_today=remaining_today,
        recent_runs=_recent_usage_entries(db),
    )


def _build_prompt_payload(context: dict[str, Any], report_type: ReportType) -> list[dict[str, str]]:
    schema_hint = {
        "headline": "short title",
        "strapline": "one-line subtitle",
        "overall_status": "READY | AT_RISK | NO_GO_LIKELY",
        "confidence": "HIGH | MEDIUM | LOW",
        "executive_summary": "2-4 concise sentences",
        "key_strengths": ["3 short bullets max"],
        "key_risks": ["3 short bullets max"],
        "recommended_actions": ["3 short bullets max"],
        "technology_snapshots": [
            {
                "workstream_name": "technology lane",
                "status": "READY | AT_RISK | NO_GO_LIKELY | NOT_MAPPED",
                "summary": "1-2 sentences",
                "next_step": "single concrete next action",
            }
        ],
        "evidence": ["4 factual bullets max with dates or counts"],
    }
    system_message = (
        "You write polished internal migration briefings. "
        "Use only the provided data. Do not invent blockers, owners, dates, or progress. "
        "Be concise, explicit, and operational. Return valid JSON only."
    )
    user_message = (
        f"Create a {report_type} report for the site below. "
        f"{REPORT_TYPE_GUIDANCE[report_type]} "
        "Use absolute dates like 'March 30, 2026' when relevant. "
        "If data is thin, say so plainly. "
        "Return exactly one JSON object matching this shape:\n"
        f"{json.dumps(schema_hint, ensure_ascii=True)}\n\n"
        "Site context:\n"
        f"{json.dumps(context, ensure_ascii=True, default=str)}"
    )
    return [
        {"role": "system", "content": system_message},
        {"role": "user", "content": user_message},
    ]


def _fallback_report(site_id: int, site_name: str, report_type: ReportType, model: str, raw_text: str) -> SiteAiReportResponse:
    text = raw_text.strip() or "The model returned no usable content."
    return SiteAiReportResponse(
        site_id=site_id,
        site_name=site_name,
        model=model,
        report_type=report_type,
        generated_at=datetime.now(timezone.utc),
        headline=f"{site_name} AI Brief",
        strapline="Fallback report rendered from raw model output.",
        overall_status="AT_RISK",
        confidence="LOW",
        executive_summary=text[:1200],
        key_strengths=[],
        key_risks=[],
        recommended_actions=[],
        technology_snapshots=[],
        evidence=[],
        raw_text=text,
        daily_limit=settings.ai_reports_daily_limit,
        daily_used=0,
        daily_remaining=settings.ai_reports_daily_limit,
    )


def generate_site_ai_report(db: Session, site_id: int, *, actor: AiReportActor, model: str | None, report_type: ReportType) -> SiteAiReportResponse | None:
    context = _context_for_site(db, site_id)
    if context is None:
        return None

    daily_limit, used_today, remaining_today = _usage_totals(db, actor.key)
    if remaining_today <= 0:
        raise AiReportLimitExceeded(f"Daily AI report limit reached for {actor.label}: {used_today} of {daily_limit} used today.")

    selected_model = model or settings.ai_default_model
    run = AiReportRun(
        actor_key=actor.key,
        actor_label=actor.label,
        actor_source=actor.source,
        site_id=site_id,
        site_name_snapshot=str(context["site"]["site_name"]),
        model=selected_model,
        report_type=report_type,
        status="started",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    payload = {
        "model": selected_model,
        "messages": _build_prompt_payload(context, report_type),
    }
    payload[_report_token_param(selected_model)] = 900

    try:
        upstream = _ai_request("POST", "/chat/completions", payload)
        raw_text = _extract_response_text(upstream)
        if not raw_text:
            report = _fallback_report(site_id, str(context["site"]["site_name"]), report_type, str(upstream.get("model") or selected_model), raw_text)
        else:
            try:
                parsed = _extract_json_object(raw_text)
            except ValueError:
                report = _fallback_report(site_id, str(context["site"]["site_name"]), report_type, str(upstream.get("model") or selected_model), raw_text)
            else:
                technology_snapshots = [
                    SiteAiTechnologySnapshot(
                        workstream_name=str(item.get("workstream_name") or "General"),
                        status=str(item.get("status") or "AT_RISK"),
                        summary=str(item.get("summary") or "").strip(),
                        next_step=str(item.get("next_step") or "").strip(),
                    )
                    for item in (parsed.get("technology_snapshots") if isinstance(parsed.get("technology_snapshots"), list) else [])
                    if isinstance(item, dict)
                ]

                report = SiteAiReportResponse(
                    site_id=site_id,
                    site_name=str(context["site"]["site_name"]),
                    model=str(upstream.get("model") or selected_model),
                    report_type=report_type,
                    generated_at=datetime.now(timezone.utc),
                    headline=str(parsed.get("headline") or f"{context['site']['site_name']} Brief").strip(),
                    strapline=str(parsed.get("strapline")).strip() if parsed.get("strapline") else None,
                    overall_status=str(parsed.get("overall_status") or "AT_RISK").strip().upper(),
                    confidence=str(parsed.get("confidence") or "MEDIUM").strip().upper(),
                    executive_summary=str(parsed.get("executive_summary") or "").strip() or raw_text[:900],
                    key_strengths=_clean_lines(parsed.get("key_strengths"), 4),
                    key_risks=_clean_lines(parsed.get("key_risks"), 4),
                    recommended_actions=_clean_lines(parsed.get("recommended_actions"), 4),
                    technology_snapshots=technology_snapshots[:4],
                    evidence=_clean_lines(parsed.get("evidence"), 5),
                    raw_text=raw_text,
                    daily_limit=daily_limit,
                    daily_used=used_today + 1,
                    daily_remaining=max(daily_limit - (used_today + 1), 0),
                )

        run.status = "completed"
        run.error_message = None
        run.model = report.model
        db.add(run)
        db.commit()
        return report
    except Exception as error:
        run.status = "failed"
        run.error_message = str(error)[:500]
        db.add(run)
        db.commit()
        raise
