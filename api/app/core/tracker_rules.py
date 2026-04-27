from __future__ import annotations

import re
from typing import Any, Iterable


WIRELESS_REFERENCE_MARKERS = (
    "total hrs",
    "20 buffer",
    "internal communication for queries",
    "point of contact",
    "rf design discrepancies",
    "remediation survey report discrepancies",
    "survey report discrepancies",
    "enclosures confirmation",
)


def normalize_tracker_text(*values: Any) -> str:
    text = " ".join(str(value or "") for value in values if value not in (None, ""))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


_NORMALIZED_WIRELESS_REFERENCE_MARKERS = tuple(normalize_tracker_text(marker) for marker in WIRELESS_REFERENCE_MARKERS)


def is_wireless_reference_row(phase: Any, title: Any) -> bool:
    haystack = normalize_tracker_text(phase, title)
    if not haystack:
        return False
    return any(marker in haystack for marker in _NORMALIZED_WIRELESS_REFERENCE_MARKERS)


def is_reference_only_tracker_task(task: Any) -> bool:
    source_tab = str(getattr(task, "source_tab", "") or "").strip().lower()
    phase = getattr(task, "phase", None)
    title = getattr(task, "title", None)

    workstream_key = ""
    reference_only = False
    workstream = getattr(task, "workstream", None)
    if workstream is not None:
        workstream_key = str(getattr(workstream, "key", "") or "")
    if not workstream_key:
        raw = getattr(task, "raw_import_json", None) or {}
        if isinstance(raw, dict):
            workstream_key = str(raw.get("workstream_key") or raw.get("workstream") or "")
            reference_only = bool(raw.get("reference_only_row"))

    canonical_key = workstream_key.upper().replace("-", "").replace(" ", "")
    is_wireless = source_tab == "wireless tracker" or canonical_key == "WIRELESS"
    return is_wireless and (reference_only or is_wireless_reference_row(phase, title))


def filter_user_facing_tasks(tasks: Iterable[Any]) -> list[Any]:
    return [task for task in tasks if not is_reference_only_tracker_task(task)]


def reference_only_tracker_tasks(tasks: Iterable[Any]) -> list[Any]:
    return [task for task in tasks if is_reference_only_tracker_task(task)]
