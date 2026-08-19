import asyncio
import uuid

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine, select

from src.backend import config
from src.backend.models import ContentMetadata, LectureEvent, LectureEventRelation, Lesson
from src.backend.services.question_answer_links.candidates import (
    generate_question_answer_candidates,
)
from src.backend.services.question_answer_links.service import (
    RelationValidationError,
    process_question_answer_links,
    validate_relation_events,
)


def _event(
    video_id: uuid.UUID,
    event_type: str,
    start: float,
    *,
    title: str,
    source_index: int,
) -> LectureEvent:
    return LectureEvent(
        video_id=video_id,
        event_type=event_type,
        start_time=start,
        end_time=start + 5,
        title=title,
        confidence=0.9,
        inference_type=(
            "INFERRED" if event_type in {"TOPIC_CHANGE", "IMPORTANT"} else "EXPLICIT"
        ),
        source_segment_ids=[source_index],
    )


def test_candidate_generation_applies_window_and_topic_boundary():
    video_id = uuid.uuid4()
    question = _event(video_id, "QUESTION", 10, title="Q", source_index=1)
    before_boundary = _event(video_id, "ANSWER", 30, title="A1", source_index=3)
    boundary = _event(video_id, "TOPIC_CHANGE", 50, title="Topic", source_index=5)
    after_boundary = _event(video_id, "ANSWER", 55, title="A2", source_index=6)
    too_late = _event(video_id, "ANSWER", 200, title="A3", source_index=20)

    result = generate_question_answer_candidates(
        [question, before_boundary, boundary, after_boundary, too_late],
        max_window_seconds=90,
    )

    assert len(result) == 1
    assert [answer.id for answer in result[0].answers] == [before_boundary.id]


def test_candidate_generation_allows_no_confident_candidate():
    video_id = uuid.uuid4()
    question = _event(video_id, "QUESTION", 10, title="Q", source_index=1)
    answer = _event(video_id, "ANSWER", 300, title="A", source_index=30)

    result = generate_question_answer_candidates(
        [question, answer],
        max_window_seconds=60,
    )

    assert len(result) == 1
    assert result[0].answers == ()


def test_relation_validation_rejects_wrong_type_cross_video_and_self_link():
    video_id = uuid.uuid4()
    other_video_id = uuid.uuid4()
    question = _event(video_id, "QUESTION", 10, title="Q", source_index=1)
    answer = _event(video_id, "ANSWER", 20, title="A", source_index=2)
    wrong_source = _event(video_id, "EXAMPLE", 10, title="E", source_index=1)
    foreign_answer = _event(other_video_id, "ANSWER", 20, title="A2", source_index=2)

    validate_relation_events(question, answer, video_id=video_id)
    with pytest.raises(RelationValidationError, match="QUESTION to ANSWER"):
        validate_relation_events(wrong_source, answer, video_id=video_id)
    with pytest.raises(RelationValidationError, match="same lecture"):
        validate_relation_events(question, foreign_answer, video_id=video_id)
    question.event_type = "ANSWER"
    with pytest.raises(RelationValidationError, match="itself"):
        validate_relation_events(question, question, video_id=video_id)


class SelectProvider:
    def __init__(self, mode: str):
        self.mode = mode
        self.calls: dict[uuid.UUID, int] = {}

    async def select_links(
        self,
        question,
        candidate_answers,
        supporting_segments,
        *,
        corrective_instruction=None,
    ):
        self.calls[question.id] = self.calls.get(question.id, 0) + 1
        if self.mode == "partial" and question.title == "Question one":
            raise RuntimeError("synthetic outage")
        if self.mode == "invalid_id":
            return {
                "links": [
                    {
                        "question_event_id": str(question.id),
                        "answer_event_id": str(uuid.uuid4()),
                        "confidence": 0.95,
                    }
                ]
            }
        confidence = 0.5 if self.mode == "low" else 0.95
        selected = candidate_answers if self.mode == "multiple" else candidate_answers[:1]
        return {
            "links": [
                {
                    "question_event_id": str(question.id),
                    "answer_event_id": str(answer.id),
                    "confidence": confidence,
                }
                for answer in selected
            ]
        }


@pytest.fixture
def qa_db(monkeypatch: pytest.MonkeyPatch):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    video_id = uuid.uuid4()
    monkeypatch.setattr(config, "QA_LINK_MAX_WINDOW_SECONDS", 120)
    monkeypatch.setattr(config, "QA_LINK_MIN_CONFIDENCE", 0.70)
    monkeypatch.setattr(config, "QA_LINK_MAX_ATTEMPTS", 2)
    monkeypatch.setattr(config, "QA_LINK_CONTEXT_RADIUS_SEGMENTS", 1)

    transcript = [
        {"index": index, "start": index * 10, "end": (index + 1) * 10, "text": f"segment {index}"}
        for index in range(12)
    ]
    with Session(engine) as session:
        session.add(Lesson(id=video_id, module_id=uuid.uuid4(), title="QA lecture"))
        session.add(
            ContentMetadata(
                lesson_id=video_id,
                ai_analysis={
                    "transcript": {
                        "source_language": "vi",
                        "segments_by_language": {"vi": transcript},
                    }
                },
            )
        )
        events = [
            _event(video_id, "QUESTION", 10, title="Question one", source_index=1),
            _event(video_id, "ANSWER", 20, title="Answer one", source_index=2),
            _event(video_id, "ANSWER", 30, title="Answer two", source_index=3),
            _event(video_id, "QUESTION", 60, title="Question two", source_index=6),
            _event(video_id, "ANSWER", 70, title="Answer three", source_index=7),
            _event(video_id, "ANSWER", 80, title="Answer four", source_index=8),
        ]
        session.add_all(events)
        session.commit()
        ids = {event.title: event.id for event in events}
    return engine, video_id, ids


@pytest.mark.parametrize(
    ("mode", "expected_created", "minimum_rejected"),
    [("low", 0, 2), ("invalid_id", 0, 2), ("multiple", 6, 0)],
)
def test_linking_abstains_or_accepts_multiple_valid_candidates(
    qa_db,
    mode,
    expected_created,
    minimum_rejected,
):
    engine, video_id, _ids = qa_db
    with Session(engine) as session:
        result = asyncio.run(
            process_question_answer_links(session, str(video_id), SelectProvider(mode))
        )

    assert result.relations_created == expected_created
    assert result.relations_rejected >= minimum_rejected


def test_partial_provider_failure_does_not_crash_other_questions(qa_db):
    engine, video_id, _ids = qa_db
    provider = SelectProvider("partial")
    with Session(engine) as session:
        result = asyncio.run(
            process_question_answer_links(session, str(video_id), provider)
        )

    assert result.failed_questions == 1
    assert result.processed_questions == 1
    assert result.relations_created == 1
    failed_question_id = next(
        question_id for question_id, calls in provider.calls.items() if calls == 2
    )
    assert provider.calls[failed_question_id] == 2


def test_reprocess_replaces_unreviewed_ai_and_preserves_reviewed_human_rejected(qa_db):
    engine, video_id, ids = qa_db
    with Session(engine) as session:
        session.add_all(
            [
                LectureEventRelation(
                    video_id=video_id,
                    source_event_id=ids["Question one"],
                    target_event_id=ids["Answer one"],
                    confidence=0.8,
                ),
                LectureEventRelation(
                    video_id=video_id,
                    source_event_id=ids["Question one"],
                    target_event_id=ids["Answer two"],
                    confidence=0.9,
                    review_status="CONFIRMED",
                ),
                LectureEventRelation(
                    video_id=video_id,
                    source_event_id=ids["Question two"],
                    target_event_id=ids["Answer three"],
                    confidence=1.0,
                    created_by="HUMAN",
                    review_status="CONFIRMED",
                ),
                LectureEventRelation(
                    video_id=video_id,
                    source_event_id=ids["Question two"],
                    target_event_id=ids["Answer four"],
                    confidence=0.6,
                    review_status="REJECTED",
                ),
            ]
        )
        session.commit()
        result = asyncio.run(
            process_question_answer_links(
                session,
                str(video_id),
                SelectProvider("multiple"),
            )
        )
        stored = list(
            session.exec(
                select(LectureEventRelation).where(
                    LectureEventRelation.video_id == video_id
                )
            ).all()
        )

    assert result.relations_preserved == 3
    assert len(stored) == 6
    assert sum(relation.review_status == "CONFIRMED" for relation in stored) == 2
    assert sum(relation.review_status == "REJECTED" for relation in stored) == 1
    assert sum(
        relation.created_by == "AI" and relation.review_status == "UNREVIEWED"
        for relation in stored
    ) == 3
