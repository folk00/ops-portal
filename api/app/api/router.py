from fastapi import APIRouter

from app.api import ai_reports, calendar, capacity, dashboard, events, imports, job_status, ops, sites, task_updates, tasks, users, views

api_router = APIRouter()
api_router.include_router(ai_reports.router)
api_router.include_router(dashboard.router)
api_router.include_router(sites.router)
api_router.include_router(tasks.router)
api_router.include_router(task_updates.router)
api_router.include_router(users.router)
api_router.include_router(capacity.router)
api_router.include_router(calendar.router)
api_router.include_router(imports.router)
api_router.include_router(views.router)
api_router.include_router(events.router)
api_router.include_router(job_status.router)
api_router.include_router(ops.router)
