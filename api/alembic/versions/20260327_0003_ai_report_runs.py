"""add ai report run audit log"""

from alembic import op
import sqlalchemy as sa


revision = "20260327_0003"
down_revision = "20260317_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_report_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor_key", sa.String(length=255), nullable=False),
        sa.Column("actor_label", sa.String(length=255), nullable=True),
        sa.Column("actor_source", sa.String(length=80), nullable=False),
        sa.Column("site_id", sa.Integer(), sa.ForeignKey("sites.id"), nullable=False),
        sa.Column("site_name_snapshot", sa.String(length=160), nullable=False),
        sa.Column("model", sa.String(length=180), nullable=False),
        sa.Column("report_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_ai_report_runs_actor_key", "ai_report_runs", ["actor_key"], unique=False)
    op.create_index("ix_ai_report_runs_site_id", "ai_report_runs", ["site_id"], unique=False)
    op.create_index("ix_ai_report_runs_status", "ai_report_runs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_ai_report_runs_status", table_name="ai_report_runs")
    op.drop_index("ix_ai_report_runs_site_id", table_name="ai_report_runs")
    op.drop_index("ix_ai_report_runs_actor_key", table_name="ai_report_runs")
    op.drop_table("ai_report_runs")
