from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.sites import SiteCreateRequest, SiteDetailResponse, SiteListItem, SitePatchRequest, SitePeerReviewerAssignRequest
from app.services.sites import assign_site_peer_reviewer, create_site, get_site_detail, list_sites, patch_site

router = APIRouter(prefix="/sites", tags=["sites"])


@router.get("", response_model=list[SiteListItem])
def sites_index(
    search: str | None = None,
    region: str | None = None,
    wave: str | None = None,
    active: bool | None = None,
    workstream: str | None = None,
    view: str | None = Query(default=None),
    from_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[SiteListItem]:
    return list_sites(
        db,
        search=search,
        region=region,
        wave=wave,
        active=active,
        workstream=workstream,
        view=view,
        from_date=from_date,
    )


@router.post("", response_model=SiteDetailResponse)
def create_site_record(payload: SiteCreateRequest, db: Session = Depends(get_db)) -> SiteDetailResponse:
    try:
        return create_site(db, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/{site_id}", response_model=SiteDetailResponse)
def site_detail(site_id: int, db: Session = Depends(get_db)) -> SiteDetailResponse:
    result = get_site_detail(db, site_id)
    if not result:
        raise HTTPException(status_code=404, detail="Site not found")
    return result


@router.patch("/{site_id}", response_model=SiteDetailResponse)
def patch_site_record(site_id: int, payload: SitePatchRequest, db: Session = Depends(get_db)) -> SiteDetailResponse:
    result = patch_site(db, site_id, payload)
    if not result:
        raise HTTPException(status_code=404, detail="Site not found")
    return result


@router.post("/{site_id}/peer-reviewer", response_model=SiteDetailResponse)
def assign_peer_reviewer(site_id: int, payload: SitePeerReviewerAssignRequest, db: Session = Depends(get_db)) -> SiteDetailResponse:
    try:
        result = assign_site_peer_reviewer(db, site_id, payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if not result:
        raise HTTPException(status_code=404, detail="Site not found")
    return result
