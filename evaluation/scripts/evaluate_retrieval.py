from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path
from typing import Any

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.backend.models import Category, ContentMetadata, Course, Lesson, Module
from src.backend.services.lecture_grounding.service import build_ask_evidence


DEFAULT_QUESTIONS = ROOT / "evaluation" / "review_pack" / "ask-review-template.json"
DEFAULT_OUTPUT = ROOT / "evaluation" / "results" / "retrieval_paraphrase.json"
TRANSCRIPTS = {
    "synthetic-vi-regularization": ROOT / "evaluation" / "data" / "transcripts" / "synthetic-vi-regularization.json",
    "synthetic-en-transactions": ROOT / "evaluation" / "data" / "transcripts" / "synthetic-en-transactions.json",
    "synthetic-codeswitch-accessibility": ROOT / "evaluation" / "data" / "transcripts" / "synthetic-codeswitch-accessibility.json",
}


def _seed(session: Session, video_id: str, transcript: dict[str, Any]) -> str:
    category = Category(name=f"Retrieval {video_id}")
    session.add(category)
    session.flush()
    course = Course(category_id=category.id, title=video_id)
    session.add(course)
    session.flush()
    module = Module(course_id=course.id, title="Evaluation")
    session.add(module)
    session.flush()
    lesson_id = uuid.uuid5(uuid.NAMESPACE_URL, f"retrieval:{video_id}")
    session.add(Lesson(id=lesson_id, module_id=module.id, title=video_id, status="completed"))
    language = "en" if transcript.get("language") == "en" else "vi"
    session.add(
        ContentMetadata(
            lesson_id=lesson_id,
            ai_analysis={
                "transcript": {
                    "source_language": language,
                    "segments": transcript["segments"],
                    "segments_by_language": {language: transcript["segments"]},
                }
            },
        )
    )
    session.commit()
    return str(lesson_id)


def evaluate(payload: dict[str, Any]) -> dict[str, Any]:
    questions_by_video: dict[str, list[dict[str, Any]]] = {}
    for question in payload.get("questions", []):
        questions_by_video.setdefault(question["video_id"], []).append(question)
    results = []
    for video_id, questions in questions_by_video.items():
        transcript = json.loads(TRANSCRIPTS[video_id].read_text(encoding="utf-8"))
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            lesson_id = _seed(session, video_id, transcript)
            for question in questions:
                units = build_ask_evidence(session, lesson_id, question["question"])
                retrieved_segments = sorted(
                    {segment_id for unit in units for segment_id in unit.source_segment_ids}
                )
                expected = set(question.get("expected_source_segment_ids", []))
                hit = bool(expected & set(retrieved_segments)) if question.get("supported") else None
                results.append(
                    {
                        "id": question["id"],
                        "category": question["category"],
                        "supported": question["supported"],
                        "retrieval_hit": hit,
                        "retrieved_unit_count": len(units),
                        "retrieved_source_segment_ids": retrieved_segments,
                    }
                )
    supported = [item for item in results if item["supported"]]
    paraphrased = [item for item in supported if item["category"] == "paraphrased"]
    return {
        "status": "ENGINEERING_DIAGNOSTIC_NOT_HUMAN_GOLD",
        "question_count": len(results),
        "supported_question_count": len(supported),
        "supported_retrieval_hit_rate": (
            round(sum(bool(item["retrieval_hit"]) for item in supported) / len(supported), 6)
            if supported
            else None
        ),
        "paraphrase_question_count": len(paraphrased),
        "paraphrase_retrieval_hit_rate": (
            round(sum(bool(item["retrieval_hit"]) for item in paraphrased) / len(paraphrased), 6)
            if paraphrased
            else None
        ),
        "results": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate lexical retrieval on project-authored diagnostic questions.")
    parser.add_argument("--questions", type=Path, default=DEFAULT_QUESTIONS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = evaluate(json.loads(args.questions.read_text(encoding="utf-8")))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"supported_retrieval_hit_rate={result['supported_retrieval_hit_rate']}")
    print(f"paraphrase_retrieval_hit_rate={result['paraphrase_retrieval_hit_rate']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
