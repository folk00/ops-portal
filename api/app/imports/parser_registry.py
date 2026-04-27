from app.imports.workbook_importer import (
    parse_calls_sheet,
    parse_ops_team_sheet,
    parse_poc_calendar_sheet,
    parse_pto_sheet,
    parse_tracker_sheet,
    parse_upcoming_migrations_sheet,
)


PARSER_REGISTRY = {
    "Ops team": parse_ops_team_sheet,
    "Upcoming Migrations": parse_upcoming_migrations_sheet,
    "Pavel's Tab": parse_upcoming_migrations_sheet,
    "SDA Tracker": parse_tracker_sheet,
    "Wireless Tracker": parse_tracker_sheet,
    "SD-WAN Tracker": parse_tracker_sheet,
    "PTOs": parse_pto_sheet,
    "Ops Calls": parse_calls_sheet,
    "POC Calendar": parse_poc_calendar_sheet,
}

