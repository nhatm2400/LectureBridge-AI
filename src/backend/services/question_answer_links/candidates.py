from collections.abc import Sequence

from src.backend.models import LectureEvent

from .schemas import QuestionCandidateSet


def _has_valid_evidence(event: LectureEvent) -> bool:
    return (
        bool(event.source_segment_ids)
        and all(isinstance(index, int) and index >= 0 for index in event.source_segment_ids)
        and event.start_time >= 0
        and event.end_time >= event.start_time
    )


def generate_question_answer_candidates(
    events: Sequence[LectureEvent],
    *,
    max_window_seconds: float,
) -> list[QuestionCandidateSet]:
    if max_window_seconds <= 0:
        raise ValueError("max_window_seconds must be positive")
    active = [event for event in events if event.review_status != "REJECTED"]
    questions = sorted(
        (event for event in active if event.event_type == "QUESTION"),
        key=lambda event: (event.start_time, event.end_time, str(event.id)),
    )
    answers = sorted(
        (event for event in active if event.event_type == "ANSWER"),
        key=lambda event: (event.start_time, event.end_time, str(event.id)),
    )
    topic_boundaries = sorted(
        event.start_time
        for event in active
        if event.event_type == "TOPIC_CHANGE" and _has_valid_evidence(event)
    )

    results: list[QuestionCandidateSet] = []
    for question in questions:
        if not _has_valid_evidence(question):
            continue
        next_boundary = next(
            (time for time in topic_boundaries if time > question.end_time),
            None,
        )
        candidates = []
        for answer in answers:
            if answer.video_id != question.video_id or not _has_valid_evidence(answer):
                continue
            if answer.start_time < question.start_time:
                continue
            distance = max(0.0, answer.start_time - question.end_time)
            if distance > max_window_seconds:
                continue
            if next_boundary is not None and answer.start_time >= next_boundary:
                continue
            candidates.append(answer)
        results.append(
            QuestionCandidateSet(question=question, answers=tuple(candidates))
        )
    return results
