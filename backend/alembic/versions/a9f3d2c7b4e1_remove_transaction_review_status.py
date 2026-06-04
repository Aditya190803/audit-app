"""remove transaction review status

Revision ID: a9f3d2c7b4e1
Revises: 4f8f58f4f0d2
Create Date: 2026-06-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9f3d2c7b4e1"
down_revision: Union[str, None] = "4f8f58f4f0d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Drop the unused manual review-status column."""
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.drop_column("review_status")


def downgrade() -> None:
    """Restore review_status if this migration is rolled back."""
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.add_column(sa.Column("review_status", sa.String(), nullable=True))
