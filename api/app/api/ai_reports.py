from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.ai_reports import AiModelOption, AiReportUsageSummary, SiteAiReportRequest, SiteAiReportResponse
from app.services.ai_reports import AiReportActor, AiReportLimitExceeded, generate_site_ai_report, get_ai_usage_summary, list_ai_models

router = APIRouter(prefix="/ai", tags=["ai"])

ACTOR_HEADER_CANDIDATES = (
    "x-auth-request-email",
    "x-user-email",
    "x-forwarded-email",
    "x-email",
    "x-auth-request-user",
    "x-forwarded-user",
    "x-remote-user",
    "remote-user",
    "x-user",
)


def _normalize_actor_value(value: str | None) -> str:
    text = str(value or "").strip()
    if "," in text:
        text = text.split(",", 1)[0].strip()
    return text


def _resolve_ai_actor(request: Request) -> AiReportActor:
    for header_name in ACTOR_HEADER_CANDIDATES:
        candidate = _normalize_actor_value(request.headers.get(header_name))
        if candidate:
            return AiReportActor(key=candidate.lower(), label=candidate, source=header_name)

    forwarded_for = _normalize_actor_value(request.headers.get("x-forwarded-for"))
    client_host = forwarded_for or (request.client.host if request.client else "")
    actor_label = client_host or "unknown-client"
    return AiReportActor(key=f"ip:{actor_label.lower()}", label=actor_label, source="ip_fallback")


@router.get("/models", response_model=list[AiModelOption])
def ai_models() -> list[AiModelOption]:
    try:
        return list_ai_models()
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/usage", response_model=AiReportUsageSummary)
def ai_usage(request: Request, db: Session = Depends(get_db)) -> AiReportUsageSummary:
    actor = _resolve_ai_actor(request)
    return get_ai_usage_summary(db, actor)


@router.post("/site-reports/{site_id}", response_model=SiteAiReportResponse)
def generate_site_report(site_id: int, payload: SiteAiReportRequest, request: Request, db: Session = Depends(get_db)) -> SiteAiReportResponse:
    actor = _resolve_ai_actor(request)
    try:
        result = generate_site_ai_report(db, site_id, actor=actor, model=payload.model, report_type=payload.report_type)
    except ValueError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except AiReportLimitExceeded as error:
        raise HTTPException(status_code=429, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if result is None:
        raise HTTPException(status_code=404, detail="Site not found")
    return result
