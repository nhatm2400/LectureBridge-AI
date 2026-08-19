"""add deletion_audits table

Revision ID: b3c4d5e6f7a8
Revises: 9a2313124598
Create Date: 2026-05-16 18:10:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "b3c4d5e6f7a8"
down_revision = "9a2313124598"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deletion_audits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("entity_id", sa.String(), nullable=False),
        sa.Column("entity_display_name", sa.String(), nullable=True),
        sa.Column("deleted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("deleted_by_email", sa.String(), nullable=True),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["deleted_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_deletion_audits_entity_type"), "deletion_audits", ["entity_type"], unique=False)
    op.create_index(op.f("ix_deletion_audits_entity_id"), "deletion_audits", ["entity_id"], unique=False)
    op.create_index(op.f("ix_deletion_audits_created_at"), "deletion_audits", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_deletion_audits_created_at"), table_name="deletion_audits")
    op.drop_index(op.f("ix_deletion_audits_entity_id"), table_name="deletion_audits")
    op.drop_index(op.f("ix_deletion_audits_entity_type"), table_name="deletion_audits")
    op.drop_table("deletion_audits")

