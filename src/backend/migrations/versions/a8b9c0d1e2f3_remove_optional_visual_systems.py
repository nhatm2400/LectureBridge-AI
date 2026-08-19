"""remove optional avatar and generated slide persistence

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-08-13 02:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "a8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("generated_slides")
    with op.batch_alter_table("content_metadata") as batch_op:
        batch_op.drop_column("handsign_manifest_url")
        batch_op.drop_column("avatar_video_url")


def downgrade() -> None:
    with op.batch_alter_table("content_metadata") as batch_op:
        batch_op.add_column(
            sa.Column(
                "avatar_video_url",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column(
                "handsign_manifest_url",
                sqlmodel.sql.sqltypes.AutoString(),
                nullable=True,
            )
        )
    op.create_table(
        "generated_slides",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("video_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("filename", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("template_id", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("num_slides", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_generated_slides_video_id"),
        "generated_slides",
        ["video_id"],
        unique=False,
    )
