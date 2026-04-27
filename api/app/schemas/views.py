from __future__ import annotations

from pydantic import BaseModel


class SystemView(BaseModel):
    key: str
    label: str
    description: str
    route: str
    filters: dict
