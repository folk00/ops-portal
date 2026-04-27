from app.schemas.views import SystemView


SYSTEM_VIEWS = [
    SystemView(
        key="my-work",
        label="Owned Work",
        description="Open tasks that already have an owner assigned.",
        route="/tracker",
        filters={"owner": "assigned", "status": ["NOT_STARTED", "IN_PROGRESS"]},
    ),
    SystemView(
        key="upcoming-migrations",
        label="Upcoming Migrations",
        description="Sites with migration windows in the next 14 days.",
        route="/sites",
        filters={"window": "next_14_days"},
    ),
    SystemView(
        key="blocked",
        label="Pending / on hold",
        description="Tasks and sites waiting on a dependency or still pending.",
        route="/tracker",
        filters={"status": ["NOT_STARTED"]},
    ),
    SystemView(
        key="overdue",
        label="Overdue",
        description="Open tasks whose due date has slipped.",
        route="/tracker",
        filters={"due": "overdue"},
    ),
    SystemView(
        key="sd-wan",
        label="SD-WAN",
        description="Focus work for SD-WAN migration preparation.",
        route="/tracker",
        filters={"workstream": ["SDWAN"]},
    ),
    SystemView(
        key="sda",
        label="SDA",
        description="SDA-focused planning and implementation tasks.",
        route="/tracker",
        filters={"workstream": ["SDA"]},
    ),
    SystemView(
        key="wireless",
        label="Wireless",
        description="Wireless planning, RF, and execution tasks.",
        route="/tracker",
        filters={"workstream": ["WIRELESS"]},
    ),
    SystemView(
        key="unassigned",
        label="Unassigned",
        description="Open work that needs an owner.",
        route="/tracker",
        filters={"owner": "none"},
    ),
    SystemView(
        key="this-week",
        label="This Week",
        description="Tasks due this week and upcoming change windows.",
        route="/tracker",
        filters={"due": "this_week"},
    ),
]


def get_system_views() -> list[SystemView]:
    return SYSTEM_VIEWS
