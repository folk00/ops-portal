from __future__ import annotations

from datetime import date, timedelta
import re

TIMELINE_FALLBACK_ORDER = 999

TIMELINE_PHASE_MAP: list[tuple[tuple[str, ...], str, int]] = [
    (("communication plan", "pre-requirements for implementation plan", "readiness"), "T-6", 10),
    (("site variables tab", "bom", "idf tab", "link table", "rf design and enclosures", "rf design"), "T-5", 20),
    (("wan circuit validations", "pre-validations", "configurations", "configuration scripts", "vrf validation", "voice services"), "T-4", 30),
    (("implementation plan",), "T-3", 40),
    (("peer review", "final peer review"), "T-2", 50),
    (("pre-staging", "pre-implementation tasks"), "T-1", 60),
    (("endpoint validation",), "T-0", 70),
]

_TIMELINE_PATTERN = re.compile(r"\bT\s*([+-])\s*(\d+)\b", re.IGNORECASE)
_TIMELINE_RANGE_PATTERN = re.compile(r"\bT\s*-\s*(\d+)(?:\s*(?:to|-)\s*T?\s*-\s*(\d+))?\b", re.IGNORECASE)


def infer_timeline(phase: str | None, title: str | None, source_tab: str | None = None) -> tuple[str, int]:
    haystack = " ".join(part for part in [phase, title, source_tab] if part).lower()

    explicit = _TIMELINE_PATTERN.search(haystack)
    if explicit:
        sign, number_text = explicit.groups()
        number = int(number_text)
        label = f"T{sign}{number}"
        order = 70 + number if sign == "+" else max(0, 70 - (number * 10))
        return label, order

    for aliases, label, order in TIMELINE_PHASE_MAP:
        if any(alias in haystack for alias in aliases):
            return label, order

    return "Unsequenced", TIMELINE_FALLBACK_ORDER


def timeline_window_from_text(value: str | None, scheduled_date: date | None) -> tuple[date | None, date | None, str | None]:
    if scheduled_date is None or not value:
        return None, None, None

    match = _TIMELINE_RANGE_PATTERN.search(value)
    if not match:
        return None, None, None

    start_weeks = int(match.group(1))
    explicit_end_weeks = int(match.group(2)) if match.group(2) else None
    end_weeks = explicit_end_weeks if explicit_end_weeks is not None else start_weeks
    if end_weeks > start_weeks:
        start_weeks, end_weeks = end_weeks, start_weeks

    start_date = scheduled_date - timedelta(weeks=start_weeks)
    if explicit_end_weeks is None:
        if start_weeks == 0:
            end_date = scheduled_date
        else:
            end_date = scheduled_date - timedelta(weeks=max(start_weeks - 1, 0)) - timedelta(days=1)
        label = f"T-{start_weeks}"
    else:
        if end_weeks == 0:
            end_date = scheduled_date
        else:
            end_date = scheduled_date - timedelta(weeks=end_weeks) - timedelta(days=1)
        label = f"T-{start_weeks} to T-{end_weeks}"
    return start_date, end_date, label


def timeline_window_from_label(label: str | None, scheduled_date: date | None) -> tuple[date | None, date | None, str | None]:
    return timeline_window_from_text(label, scheduled_date)


def timeline_due_date_from_text(value: str | None, scheduled_date: date | None) -> date | None:
    start_date, end_date, _label = timeline_window_from_text(value, scheduled_date)
    return end_date or start_date
