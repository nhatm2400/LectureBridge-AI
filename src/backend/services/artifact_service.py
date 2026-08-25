from typing import Any

from src.backend.services.lecture_grounding.learning import validate_artifact_evidence


ARTIFACT_KEYS = ("summary", "flashcards", "quizzes")


def _status_ready(data: Any) -> bool:
    if data is None:
        return False
    if isinstance(data, (list, dict)):
        return bool(data)
    return True


def artifact_status(data: Any, error: str | None = None) -> dict[str, Any]:
    if error:
        return {"status": "failed", "error": error}
    return {"status": "ready" if _status_ready(data) else "empty", "error": None}


def normalize_summary(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def normalize_flashcards(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        front = str(item.get("front", "")).strip()
        back = str(item.get("back", "")).strip()
        if not front or not back:
            continue
        hint = item.get("hint")
        items.append(
            {
                "front": front,
                "back": back,
                "hint": str(hint).strip() if hint else None,
                "source_segment_ids": list(item.get("source_segment_ids", [])),
                "source_event_ids": list(item.get("source_event_ids", [])),
            }
        )
    return items


def normalize_quizzes(
    value: Any,
    *,
    output_language: str = "vi",
) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    items: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        question_text = str(item.get("question_text", "")).strip()
        options = item.get("options", {})
        correct_answer = str(item.get("correct_answer", "")).strip()
        if not question_text or not isinstance(options, dict) or correct_answer not in options:
            continue
        items.append(
            {
                "question_text": question_text,
                "options": options,
                "correct_answer": correct_answer,
                "explanation": str(item.get("explanation", "")).strip(),
                "difficulty": str(
                    item.get(
                        "difficulty",
                        "Medium" if output_language == "en" else "Trung binh",
                    )
                ).strip(),
                "source_segment_ids": list(item.get("source_segment_ids", [])),
                "source_event_ids": list(item.get("source_event_ids", [])),
            }
        )
    return items


def build_ai_analysis(
    *,
    transcript: dict,
    summary: Any,
    flashcards: Any,
    quizzes: Any,
    errors: dict[str, str | None] | None = None,
    require_source_evidence: bool = False,
    output_language: str = "vi",
) -> dict[str, Any]:
    """Build the single canonical learning-artifact payload stored with a lesson."""
    errors = errors or {}
    transcript_segments = transcript.get("segments", []) if isinstance(transcript, dict) else []
    segment_count = len(transcript_segments) if isinstance(transcript_segments, list) else 0
    grounded_flashcards = (
        validate_artifact_evidence(
            flashcards,
            segment_count=segment_count,
            item_type="flashcard",
        )
        if require_source_evidence
        else flashcards
    )
    grounded_quizzes = (
        validate_artifact_evidence(
            quizzes,
            segment_count=segment_count,
            item_type="quiz",
        )
        if require_source_evidence
        else quizzes
    )
    normalized = {
        "transcript": transcript,
        "summary": normalize_summary(summary),
        "flashcards": normalize_flashcards(grounded_flashcards),
        "quizzes": normalize_quizzes(
            grounded_quizzes,
            output_language=output_language,
        ),
        "output_language": output_language,
    }
    normalized["artifact_status"] = {
        "transcript": {"status": "ready", "error": None},
        "summary": artifact_status(normalized["summary"], errors.get("summary")),
        "flashcards": artifact_status(normalized["flashcards"], errors.get("flashcards")),
        "quizzes": artifact_status(normalized["quizzes"], errors.get("quizzes")),
    }
    return normalized
