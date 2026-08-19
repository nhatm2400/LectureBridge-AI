"""add event relations and review audits

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-08-13 00:30:00.000000
"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "e6f7a8b9c0d1"
down_revision = "d5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lecture_event_relations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("video_id", sa.Uuid(), nullable=False),
        sa.Column("source_event_id", sa.Uuid(), nullable=False),
        sa.Column("target_event_id", sa.Uuid(), nullable=False),
        sa.Column(
            "relation_type",
            sqlmodel.sql.sqltypes.AutoString(length=32),
            nullable=False,
        ),
        sa.Column("confidence", sa.Float(), nullable=False),
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
        sa.Column("reviewed_by_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["source_event_id"], ["lecture_events.id"]),
        sa.ForeignKeyConstraint(["target_event_id"], ["lecture_events.id"]),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_event_id",
            "target_event_id",
            "relation_type",
            name="uq_lecture_event_relation_pair_type",
        ),
    )
    op.create_index(
        op.f("ix_lecture_event_relations_video_id"),
        "lecture_event_relations",
        ["video_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_event_relations_source_event_id"),
        "lecture_event_relations",
        ["source_event_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_event_relations_target_event_id"),
        "lecture_event_relations",
        ["target_event_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_event_relations_relation_type"),
        "lecture_event_relations",
        ["relation_type"],
        unique=False,
    )

    op.create_table(
        "lecture_review_audits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("video_id", sa.Uuid(), nullable=False),
        sa.Column(
            "entity_type",
            sqlmodel.sql.sqltypes.AutoString(length=16),
            nullable=False,
        ),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column(
            "action",
            sqlmodel.sql.sqltypes.AutoString(length=16),
            nullable=False,
        ),
        sa.Column("actor_user_id", sa.Uuid(), nullable=False),
        sa.Column("before_state", sa.JSON(), nullable=True),
        sa.Column("after_state", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["video_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_lecture_review_audits_video_id"),
        "lecture_review_audits",
        ["video_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_review_audits_entity_id"),
        "lecture_review_audits",
        ["entity_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_lecture_review_audits_actor_user_id"),
        "lecture_review_audits",
        ["actor_user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lecture_review_audits_actor_user_id"), table_name="lecture_review_audits")
    op.drop_index(op.f("ix_lecture_review_audits_entity_id"), table_name="lecture_review_audits")
    op.drop_index(op.f("ix_lecture_review_audits_video_id"), table_name="lecture_review_audits")
    op.drop_table("lecture_review_audits")

    op.drop_index(op.f("ix_lecture_event_relations_relation_type"), table_name="lecture_event_relations")
    op.drop_index(op.f("ix_lecture_event_relations_target_event_id"), table_name="lecture_event_relations")
    op.drop_index(op.f("ix_lecture_event_relations_source_event_id"), table_name="lecture_event_relations")
    op.drop_index(op.f("ix_lecture_event_relations_video_id"), table_name="lecture_event_relations")
    op.drop_table("lecture_event_relations")
