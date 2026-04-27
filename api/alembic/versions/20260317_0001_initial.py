"""initial schema"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260317_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=180), nullable=False),
        sa.Column("team", sa.String(length=80), nullable=False),
        sa.Column("role", sa.String(length=80), nullable=False),
        sa.Column("allocation_percent", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("weekly_hours", sa.Integer(), nullable=False, server_default="40"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "workstreams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    op.create_index("ix_workstreams_key", "workstreams", ["key"], unique=True)

    op.create_table(
        "sites",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_code", sa.String(length=40), nullable=False),
        sa.Column("site_name", sa.String(length=160), nullable=False),
        sa.Column("region", sa.String(length=80), nullable=False),
        sa.Column("market", sa.String(length=80), nullable=False),
        sa.Column("address", sa.String(length=200), nullable=True),
        sa.Column("migration_wave", sa.String(length=80), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_sites_site_code", "sites", ["site_code"], unique=True)
    op.create_index("ix_sites_migration_wave", "sites", ["migration_wave"])

    op.create_table(
        "migration_windows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("workstream_id", sa.Integer(), sa.ForeignKey("workstreams.id"), nullable=True),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("change_ticket", sa.String(length=60), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_migration_windows_site_id", "migration_windows", ["site_id"])
    op.create_index("ix_migration_windows_workstream_id", "migration_windows", ["workstream_id"])
    op.create_index("ix_migration_windows_scheduled_date", "migration_windows", ["scheduled_date"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("workstream_id", sa.Integer(), sa.ForeignKey("workstreams.id"), nullable=True),
        sa.Column("migration_window_id", sa.Integer(), sa.ForeignKey("migration_windows.id"), nullable=True),
        sa.Column("phase", sa.String(length=120), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.String(length=32), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_type", sa.String(length=60), nullable=False),
        sa.Column("source_tab", sa.String(length=120), nullable=True),
        sa.Column("source_row_key", sa.String(length=120), nullable=True),
        sa.Column("source_column_key", sa.String(length=120), nullable=True),
        sa.Column("raw_import_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    for index_name, columns in [
        ("ix_tasks_site_id", ["site_id"]),
        ("ix_tasks_workstream_id", ["workstream_id"]),
        ("ix_tasks_migration_window_id", ["migration_window_id"]),
        ("ix_tasks_phase", ["phase"]),
        ("ix_tasks_status", ["status"]),
        ("ix_tasks_priority", ["priority"]),
        ("ix_tasks_owner_id", ["owner_id"]),
        ("ix_tasks_due_date", ["due_date"]),
    ]:
        op.create_index(index_name, "tasks", columns)

    op.create_table(
        "task_updates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("author_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("update_type", sa.String(length=32), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_task_updates_task_id", "task_updates", ["task_id"])
    op.create_index("ix_task_updates_author_id", "task_updates", ["author_id"])

    op.create_table(
        "assignments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("workstream_id", sa.Integer(), sa.ForeignKey("workstreams.id"), nullable=True),
        sa.Column("allocation_percent", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assignments_user_id", "assignments", ["user_id"])
    op.create_index("ix_assignments_site_id", "assignments", ["site_id"])
    op.create_index("ix_assignments_task_id", "assignments", ["task_id"])
    op.create_index("ix_assignments_workstream_id", "assignments", ["workstream_id"])

    op.create_table(
        "ptos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("pto_type", sa.String(length=32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ptos_user_id", "ptos", ["user_id"])

    op.create_table(
        "calls",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("start_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("call_type", sa.String(length=32), nullable=False),
        sa.Column("related_site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_calls_owner_id", "calls", ["owner_id"])
    op.create_index("ix_calls_related_site_id", "calls", ["related_site_id"])

    op.create_table(
        "artifacts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("artifact_type", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_artifacts_site_id", "artifacts", ["site_id"])
    op.create_index("ix_artifacts_task_id", "artifacts", ["task_id"])

    op.create_table(
        "imports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("file_name", sa.String(length=240), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("imported_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("summary_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_tasks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_tasks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("warnings_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("errors_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_imports_imported_by", "imports", ["imported_by"])

    op.create_table(
        "import_errors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("import_id", sa.Integer(), sa.ForeignKey("imports.id"), nullable=False),
        sa.Column("sheet_name", sa.String(length=160), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=True),
        sa.Column("field_name", sa.String(length=120), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("raw_row_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.create_index("ix_import_errors_import_id", "import_errors", ["import_id"])


def downgrade() -> None:
    for table in [
        "import_errors",
        "imports",
        "artifacts",
        "calls",
        "ptos",
        "assignments",
        "task_updates",
        "tasks",
        "migration_windows",
        "sites",
        "workstreams",
        "users",
    ]:
        op.drop_table(table)

