"""add source evidence to flashcards and quiz questions

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-08-13 08:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f7a8b9c0d1e2"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    empty_json = sa.text("'[]'")
    with op.batch_alter_table("flashcards") as batch_op:
        batch_op.add_column(
            sa.Column("source_segment_ids", sa.JSON(), nullable=False, server_default=empty_json)
        )
        batch_op.add_column(
            sa.Column("source_event_ids", sa.JSON(), nullable=False, server_default=empty_json)
        )
    with op.batch_alter_table("questions") as batch_op:
        batch_op.add_column(
            sa.Column("source_segment_ids", sa.JSON(), nullable=False, server_default=empty_json)
        )
        batch_op.add_column(
            sa.Column("source_event_ids", sa.JSON(), nullable=False, server_default=empty_json)
        )


def downgrade() -> None:
    with op.batch_alter_table("questions") as batch_op:
        batch_op.drop_column("source_event_ids")
        batch_op.drop_column("source_segment_ids")
    with op.batch_alter_table("flashcards") as batch_op:
        batch_op.drop_column("source_event_ids")
        batch_op.drop_column("source_segment_ids")
