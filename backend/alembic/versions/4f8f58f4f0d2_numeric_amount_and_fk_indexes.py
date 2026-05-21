"""numeric amount and foreign key indexes

Revision ID: 4f8f58f4f0d2
Revises: b6e5cf2dd870
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f8f58f4f0d2"
down_revision: Union[str, None] = "b6e5cf2dd870"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table("transactions") as batch_op:
        batch_op.alter_column(
            "amount",
            existing_type=sa.Float(),
            type_=sa.Numeric(precision=15, scale=2),
            existing_nullable=True,
        )

    op.create_index("ix_transactions_session_id", "transactions", ["session_id"], unique=False)
    op.create_index("ix_tags_transaction_id", "tags", ["transaction_id"], unique=False)
    op.create_index("ix_audit_logs_session_id", "audit_logs", ["session_id"], unique=False)
    op.create_index("ix_undo_redo_states_session_id", "undo_redo_states", ["session_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_undo_redo_states_session_id", table_name="undo_redo_states")
    op.drop_index("ix_audit_logs_session_id", table_name="audit_logs")
    op.drop_index("ix_tags_transaction_id", table_name="tags")
    op.drop_index("ix_transactions_session_id", table_name="transactions")

    with op.batch_alter_table("transactions") as batch_op:
        batch_op.alter_column(
            "amount",
            existing_type=sa.Numeric(precision=15, scale=2),
            type_=sa.Float(),
            existing_nullable=True,
        )
