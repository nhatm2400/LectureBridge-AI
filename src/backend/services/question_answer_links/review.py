import uuid

from sqlalchemy import or_
from sqlmodel import Session, select

from src.backend.models import (
    LectureEvent,
    LectureEventRelation,
    LectureReviewAudit,
)
from src.backend.services.semantic_events.schemas import (
    EXPLICIT_EVENT_TYPES,
    EventType,
    InferenceType,
)
from src.backend.utils.datetime_utils import utc_now

from .service import RelationValidationError, validate_relation_events


class ReviewEntityNotFoundError(ValueError):
    pass


class DuplicateRelationError(ValueError):
    pass


def _event_state(event: LectureEvent) -> dict:
    return {
        "event_type": event.event_type,
        "title": event.title,
        "description": event.description,
        "confidence": event.confidence,
        "inference_type": event.inference_type,
        "source_segment_ids": list(event.source_segment_ids),
        "created_by": event.created_by,
        "review_status": event.review_status,
    }


def _relation_state(relation: LectureEventRelation) -> dict:
    return {
        "source_event_id": str(relation.source_event_id),
        "target_event_id": str(relation.target_event_id),
        "relation_type": relation.relation_type,
        "confidence": relation.confidence,
        "created_by": relation.created_by,
        "review_status": relation.review_status,
        "reviewed_by_id": (
            str(relation.reviewed_by_id) if relation.reviewed_by_id else None
        ),
    }


def _add_audit(
    session: Session,
    *,
    video_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    actor_user_id: uuid.UUID,
    before_state: dict | None,
    after_state: dict,
) -> None:
    session.add(
        LectureReviewAudit(
            video_id=video_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_user_id=actor_user_id,
            before_state=before_state,
            after_state=after_state,
        )
    )


def review_event(
    session: Session,
    *,
    video_id: uuid.UUID,
    event_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    review_status: str,
    event_type: EventType | None = None,
    title: str | None = None,
    description: str | None = None,
) -> LectureEvent:
    event = session.get(LectureEvent, event_id)
    if event is None or event.video_id != video_id:
        raise ReviewEntityNotFoundError("Lecture event not found.")
    before = _event_state(event)
    previous_type = event.event_type

    if review_status == "CORRECTED":
        if event_type is not None:
            event.event_type = event_type.value
            event.inference_type = (
                InferenceType.EXPLICIT.value
                if event_type in EXPLICIT_EVENT_TYPES
                else InferenceType.INFERRED.value
            )
        if title is not None:
            event.title = title
        if description is not None:
            event.description = description
    event.review_status = review_status
    event.updated_at = utc_now()
    session.add(event)
    session.flush()

    should_check_relations = (
        review_status == "REJECTED"
        or (
            review_status == "CORRECTED"
            and event.event_type != previous_type
        )
    )
    if should_check_relations:
        related = list(
            session.exec(
                select(LectureEventRelation).where(
                    LectureEventRelation.video_id == video_id,
                    LectureEventRelation.review_status != "REJECTED",
                    or_(
                        LectureEventRelation.source_event_id == event.id,
                        LectureEventRelation.target_event_id == event.id,
                    ),
                )
            ).all()
        )
        for relation in related:
            relation_invalid = (
                review_status == "REJECTED"
                or (
                    relation.source_event_id == event.id
                    and event.event_type != "QUESTION"
                )
                or (
                    relation.target_event_id == event.id
                    and event.event_type != "ANSWER"
                )
            )
            if not relation_invalid:
                continue
            relation_before = _relation_state(relation)
            relation.review_status = "REJECTED"
            relation.reviewed_by_id = actor_user_id
            relation.updated_at = utc_now()
            session.add(relation)
            _add_audit(
                session,
                video_id=video_id,
                entity_type="RELATION",
                entity_id=relation.id,
                action="REJECTED",
                actor_user_id=actor_user_id,
                before_state=relation_before,
                after_state=_relation_state(relation),
            )
    _add_audit(
        session,
        video_id=video_id,
        entity_type="EVENT",
        entity_id=event.id,
        action=review_status,
        actor_user_id=actor_user_id,
        before_state=before,
        after_state=_event_state(event),
    )
    session.commit()
    session.refresh(event)
    return event


def _find_duplicate_relation(
    session: Session,
    *,
    source_event_id: uuid.UUID,
    target_event_id: uuid.UUID,
    relation_type: str,
    excluding_id: uuid.UUID | None = None,
) -> LectureEventRelation | None:
    statement = select(LectureEventRelation).where(
        LectureEventRelation.source_event_id == source_event_id,
        LectureEventRelation.target_event_id == target_event_id,
        LectureEventRelation.relation_type == relation_type,
    )
    if excluding_id is not None:
        statement = statement.where(LectureEventRelation.id != excluding_id)
    return session.exec(statement).first()


def create_manual_relation(
    session: Session,
    *,
    video_id: uuid.UUID,
    source_event_id: uuid.UUID,
    target_event_id: uuid.UUID,
    actor_user_id: uuid.UUID,
) -> LectureEventRelation:
    source = session.get(LectureEvent, source_event_id)
    target = session.get(LectureEvent, target_event_id)
    if source is None or target is None:
        raise ReviewEntityNotFoundError("Source or target event not found.")
    validate_relation_events(source, target, video_id=video_id)
    if _find_duplicate_relation(
        session,
        source_event_id=source.id,
        target_event_id=target.id,
        relation_type="QUESTION_ANSWER",
    ):
        raise DuplicateRelationError("This question-answer relation already exists.")

    relation = LectureEventRelation(
        video_id=video_id,
        source_event_id=source.id,
        target_event_id=target.id,
        relation_type="QUESTION_ANSWER",
        confidence=1.0,
        created_by="HUMAN",
        review_status="CONFIRMED",
        reviewed_by_id=actor_user_id,
    )
    session.add(relation)
    session.flush()
    _add_audit(
        session,
        video_id=video_id,
        entity_type="RELATION",
        entity_id=relation.id,
        action="CREATE",
        actor_user_id=actor_user_id,
        before_state=None,
        after_state=_relation_state(relation),
    )
    session.commit()
    session.refresh(relation)
    return relation


def review_relation(
    session: Session,
    *,
    video_id: uuid.UUID,
    relation_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    review_status: str,
    target_event_id: uuid.UUID | None = None,
) -> LectureEventRelation:
    relation = session.get(LectureEventRelation, relation_id)
    if relation is None or relation.video_id != video_id:
        raise ReviewEntityNotFoundError("Lecture event relation not found.")
    before = _relation_state(relation)

    if target_event_id is not None:
        source = session.get(LectureEvent, relation.source_event_id)
        target = session.get(LectureEvent, target_event_id)
        if source is None or target is None:
            raise ReviewEntityNotFoundError("Source or target event not found.")
        validate_relation_events(source, target, video_id=video_id)
        if _find_duplicate_relation(
            session,
            source_event_id=source.id,
            target_event_id=target.id,
            relation_type=relation.relation_type,
            excluding_id=relation.id,
        ):
            raise DuplicateRelationError("This question-answer relation already exists.")
        relation.target_event_id = target.id

    relation.review_status = review_status
    relation.reviewed_by_id = actor_user_id
    relation.updated_at = utc_now()
    session.add(relation)
    session.flush()
    _add_audit(
        session,
        video_id=video_id,
        entity_type="RELATION",
        entity_id=relation.id,
        action=review_status,
        actor_user_id=actor_user_id,
        before_state=before,
        after_state=_relation_state(relation),
    )
    session.commit()
    session.refresh(relation)
    return relation
