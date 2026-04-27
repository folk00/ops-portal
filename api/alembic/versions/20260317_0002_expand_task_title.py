"""expand task title for workbook-derived tracker rows"""

from alembic import op
import sqlalchemy as sa


revision = "20260317_0002"
down_revision = "20260317_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("tasks", "title", existing_type=sa.String(length=200), type_=sa.Text(), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("tasks", "title", existing_type=sa.Text(), type_=sa.String(length=200), existing_nullable=False)
