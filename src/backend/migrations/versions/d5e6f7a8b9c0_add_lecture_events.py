"""add lecture events

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-12 23:40:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "d5e6f7a8b9c0"
down_revision = "c4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lecture_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("video_id", sa.Uuid(), nullable=False),
        sa.Column(
            "event_type",
            sqlmodel.sql.sqltypes.AutoString(length=32),
            nullable=False,
        ),
        sa.Column("start_time", sa.Float(), nullable=False),
        sa.Column("end_time", sa.Float(), nullable=False),
        sa.Column(
            "title",
            sqlmodel.sql.sqltypes.AutoString(length=500),
            nullable=False,
        ),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column(
            "inference_type",
            sqlmodel.sql.sqltypes.AutoString(length=16),
            nullable=False,
        ),
        sa.Column("source_segment_ids", sa.JSON(), nullable=False),
        sa.Column(
            "created_by",
            sqlmodel.sql.sqltypes.AutoString(length=16),
            nullable=False,
        ),
        sa.Column(
            "review_status",
            sqlmodel.sql.sqltypes.AutoString(length=16),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_lecture_events_video_id"),
        "lecture_events",
        ["video_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_events_event_type"),
        "lecture_events",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_events_start_time"),
        "lecture_events",
        ["start_time"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lecture_events_start_time"), table_name="lecture_events")
    op.drop_index(op.f("ix_lecture_events_event_type"), table_name="lecture_events")
    op.drop_index(op.f("ix_lecture_events_video_id"), table_name="lecture_events")
    op.drop_table("lecture_events")
