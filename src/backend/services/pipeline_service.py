import asyncio
import hashlib
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from sqlalchemy import delete
from sqlmodel import Session
from sqlmodel import select

from .. import config
from ..database import engine
from ..models import Flashcard, Lesson, ContentMetadata, Category, Course, Module, Quiz, Question, QuestionOption, QuizAttempt, UserFlashcardProgress, LectureEvent
from .ai_service import AIService
from .artifact_service import build_ai_analysis
from .job_service import upsert_job_status
from .question_answer_links.provider import get_question_answer_link_provider
from .question_answer_links.service import process_question_answer_links
from .semantic_events.provider import get_semantic_event_provider
from .semantic_events.service import process_lecture_events
from .video_service import VideoService

logger = logging.getLogger(__name__)

executor = ThreadPoolExecutor(max_workers=2)


def _transcript_fingerprint(transcript: dict) -> str:
    source_language = str(transcript.get("source_language") or transcript.get("language") or "")
    by_language = transcript.get("segments_by_language")
    segments = (
        by_language.get(source_language, [])
        if isinstance(by_language, dict)
        else transcript.get("segments", [])
    )
    payload = json.dumps(
        {"source_language": source_language, "segments": segments},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def _run_transcription_sync(audio_path: Path, lesson_id: str):
    return AIService.transcribe(audio_path, lesson_id)


async def _run_artifact_task(name: str, coro):
    try:
        return await coro, None
    except Exception as exc:
        logger.exception("Artifact generation failed: %s", name)
        return None, str(exc)

async def run_video_pipeline(
    lesson_id: str,
    video_path: Path | str,
    output_language: str = "vi",
):
    video_path = Path(video_path)
    lesson_uuid = uuid.UUID(str(lesson_id))
    output_language = AIService.normalize_output_language(output_language)
    try:
        with Session(engine) as session:
            def update_status(new_status: str):
                lesson = session.get(Lesson, lesson_uuid)
                if lesson:
                    lesson.status = new_status
                    session.add(lesson)
                    session.commit()
                progress_map = {
                    "queued": 0,
                    "downloading": 5,
                    "extracting_audio": 20,
                    "transcribing": 50,
                    "translating": 65,
                    "ai_processing": 80,
                    "completed": 100,
                }
                upsert_job_status(
                    session,
                    lesson_id=lesson_id,
                    status=new_status,
                    progress=progress_map.get(new_status, 0),
                )

            update_status("extracting_audio")
            audio_path = VideoService.extract_audio(video_path)

            update_status("transcribing")
            loop = asyncio.get_event_loop()
            transcript_data = await loop.run_in_executor(
                executor, _run_transcription_sync, audio_path, lesson_id
            )
            original_transcript = transcript_data
            source_language = AIService.normalize_caption_language(original_transcript.get("language"))
            original_transcript["language"] = source_language
            update_status("translating")
            target_language = "en" if source_language == "vi" else "vi"
            translated_transcript = await AIService.translate_transcript_to_language_json(
                original_transcript, target_language
            )
            stored_transcript = AIService.build_bilingual_transcript(
                source_transcript=original_transcript,
                translated_transcript=translated_transcript,
                translation_error=None if translated_transcript else f"Khong the dich transcript sang {target_language}.",
                preferred_language=output_language,
            )
            segments_by_language = stored_transcript.get("segments_by_language", {})
            selected_segments = segments_by_language.get(output_language)
            selected_transcript_language = output_language
            if not isinstance(selected_segments, list):
                selected_transcript_language = source_language
                selected_segments = segments_by_language.get(source_language, original_transcript.get("segments", []))
            artifact_transcript = {
                **stored_transcript,
                "language": selected_transcript_language,
                "segments": selected_segments,
            }

            source_fingerprint = _transcript_fingerprint(stored_transcript)
            cached_content = session.exec(
                select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)
            ).first()
            cached_analysis = (
                cached_content.ai_analysis
                if cached_content and isinstance(cached_content.ai_analysis, dict)
                else {}
            )
            reused_learning_artifacts = (
                cached_analysis.get("source_fingerprint") == source_fingerprint
                and cached_analysis.get("output_language") == output_language
            )

            update_status("ai_processing")
            if reused_learning_artifacts:
                artifact_values = {
                    "summary": cached_analysis.get("summary", []),
                    "flashcards": cached_analysis.get("flashcards", []),
                    "quizzes": cached_analysis.get("quizzes", []),
                }
                artifact_errors = {name: None for name in artifact_values}
                logger.info("Reusing source-identical learning artifacts lesson_id=%s", lesson_id)
            else:
                artifact_results = await asyncio.gather(
                    _run_artifact_task(
                        "summary",
                        AIService.summarize_full_lecture(
                            artifact_transcript,
                            output_language=output_language,
                        ),
                    ),
                    _run_artifact_task(
                        "flashcards",
                        AIService.generate_grounded_flashcards(
                            artifact_transcript,
                            output_language=output_language,
                        ),
                    ),
                    _run_artifact_task(
                        "quizzes",
                        AIService.generate_persistent_quizzes(
                            artifact_transcript,
                            output_language=output_language,
                        ),
                    ),
                )
                artifact_names = ["summary", "flashcards", "quizzes"]
                artifact_values = dict(zip(artifact_names, [result for result, _ in artifact_results]))
                artifact_errors = dict(zip(artifact_names, [error for _, error in artifact_results]))
            for artifact_name, artifact_value in artifact_values.items():
                if isinstance(artifact_value, dict) and artifact_value.get("error") and not artifact_errors.get(artifact_name):
                    artifact_errors[artifact_name] = str(artifact_value.get("error"))
            summary = artifact_values.get("summary") or []
            flashcards = artifact_values.get("flashcards") or []
            persistent_quizzes = artifact_values.get("quizzes") or []

            # Auto-Categorization logic
            categories = session.exec(select(Category)).all()
            cat_names = [c.name for c in categories]
            best_cat_name = await AIService.identify_category(summary, cat_names)
            
            # Find or Create Course/Module if lesson is loose
            lesson = session.get(Lesson, lesson_uuid)
            if lesson and (lesson.duration_minutes or 0) <= 0:
                duration_seconds = VideoService.get_video_duration_seconds(video_path)
                if duration_seconds:
                    lesson.duration_minutes = max(1, int(round(duration_seconds / 60)))
            if lesson and not lesson.module_id:
                # Assign to a default "AI Auto-Generated" course in that category
                target_cat = next((c for c in categories if c.name == best_cat_name), categories[0] if categories else None)
                if target_cat:
                    course = session.exec(select(Course).where(Course.category_id == target_cat.id)).first()
                    if not course:
                        course = Course(title=f"Khóa học {target_cat.name}", category_id=target_cat.id, instructor_id=None)
                        session.add(course)
                        session.commit()
                        session.refresh(course)
                    
                    module = session.exec(select(Module).where(Module.course_id == course.id)).first()
                    if not module:
                        module = Module(title="Chương 1: Khởi đầu", course_id=course.id)
                        session.add(module)
                        session.commit()
                        session.refresh(module)
                    
                    lesson.module_id = module.id
                    session.add(lesson)

            ai_analysis = build_ai_analysis(
                transcript=stored_transcript,
                summary=summary,
                flashcards=flashcards,
                quizzes=persistent_quizzes,
                errors=artifact_errors,
                require_source_evidence=True,
                output_language=output_language,
            )
            ai_analysis["source_fingerprint"] = source_fingerprint
            for metadata_key in (
                "lecture_event_output_language",
                "lecture_intelligence_status",
            ):
                if metadata_key in cached_analysis:
                    ai_analysis[metadata_key] = cached_analysis[metadata_key]

            content_entry = session.exec(
                select(ContentMetadata).where(ContentMetadata.lesson_id == lesson_uuid)
            ).first()
            if content_entry:
                content_entry.video_url = str(video_path)
                content_entry.ai_analysis = ai_analysis
            else:
                content_entry = ContentMetadata(
                    lesson_id=lesson_uuid,
                    video_url=str(video_path),
                    ai_analysis=ai_analysis
                )
            session.add(content_entry)

            # Preserve existing study progress when a provider does not return
            # grounded replacement cards. Only evidence-backed cards replace it.
            if ai_analysis.get("flashcards") and not reused_learning_artifacts:
                previous_flashcards = session.exec(select(Flashcard).where(Flashcard.lesson_id == lesson_uuid)).all()
                for previous_flashcard in previous_flashcards:
                    session.exec(delete(UserFlashcardProgress).where(UserFlashcardProgress.flashcard_id == previous_flashcard.id))
                session.exec(delete(Flashcard).where(Flashcard.lesson_id == lesson_uuid))
                for fc in ai_analysis.get("flashcards", []):
                    session.add(
                        Flashcard(
                            lesson_id=lesson_uuid,
                            front=fc.get("front"),
                            back=fc.get("back"),
                            hint=fc.get("hint"),
                            source_segment_ids=fc.get("source_segment_ids", []),
                            source_event_ids=fc.get("source_event_ids", []),
                        )
                    )

            # Save persistent Quizzes
            if ai_analysis.get("quizzes") and not reused_learning_artifacts:
                previous_quizzes = session.exec(select(Quiz).where(Quiz.lesson_id == lesson_uuid)).all()
                for previous_quiz in previous_quizzes:
                    previous_questions = session.exec(select(Question).where(Question.quiz_id == previous_quiz.id)).all()
                    for previous_question in previous_questions:
                        session.exec(delete(QuestionOption).where(QuestionOption.question_id == previous_question.id))
                    session.exec(delete(Question).where(Question.quiz_id == previous_quiz.id))
                    session.exec(delete(QuizAttempt).where(QuizAttempt.quiz_id == previous_quiz.id))
                session.exec(delete(Quiz).where(Quiz.lesson_id == lesson_uuid))

                quiz = Quiz(title=f"Quiz: {lesson.title}", lesson_id=lesson_uuid)
                session.add(quiz)
                session.commit()
                session.refresh(quiz)
                
                for q_data in ai_analysis.get("quizzes", []):
                    question = Question(
                        quiz_id=quiz.id,
                        question_text=q_data["question_text"],
                        explanation=q_data["explanation"],
                        difficulty=q_data["difficulty"],
                        source_segment_ids=q_data.get("source_segment_ids", []),
                        source_event_ids=q_data.get("source_event_ids", []),
                    )
                    session.add(question)
                    session.commit()
                    session.refresh(question)
                    
                    for key, val in q_data["options"].items():
                        option = QuestionOption(
                            question_id=question.id,
                            option_text=val,
                            is_correct=(key == q_data["correct_answer"])
                        )
                        session.add(option)
            session.commit()

            existing_events = list(
                session.exec(
                    select(LectureEvent).where(LectureEvent.video_id == lesson_uuid)
                ).all()
            )
            event_language_matches = (
                cached_analysis.get("lecture_event_output_language") == output_language
            )
            should_process_events = not (
                reused_learning_artifacts
                and event_language_matches
                and existing_events
            )
            if should_process_events and config.GEMINI_API_KEY:
                try:
                    event_result = await process_lecture_events(
                        session,
                        lesson_id,
                        get_semantic_event_provider(),
                        output_language=output_language,
                    )
                    relation_result = await process_question_answer_links(
                        session,
                        lesson_id,
                        get_question_answer_link_provider(),
                    )
                    refreshed_content = session.exec(
                        select(ContentMetadata).where(
                            ContentMetadata.lesson_id == lesson_uuid
                        )
                    ).first()
                    if refreshed_content and isinstance(refreshed_content.ai_analysis, dict):
                        updated_analysis = dict(refreshed_content.ai_analysis)
                        updated_analysis["lecture_event_output_language"] = output_language
                        updated_analysis["lecture_intelligence_status"] = {
                            "status": (
                                "ready"
                                if event_result.failed_chunks == 0
                                else "partial"
                            ),
                            "events_created": event_result.events_created,
                            "failed_chunks": event_result.failed_chunks,
                            "relations_created": relation_result.relations_created,
                        }
                        refreshed_content.ai_analysis = updated_analysis
                        session.add(refreshed_content)
                        session.commit()
                except Exception as exc:
                    logger.warning(
                        "Lecture intelligence generation failed lesson_id=%s error_code=%s",
                        lesson_id,
                        type(exc).__name__,
                    )
            update_status("completed")
    except Exception as e:
        error_code = type(e).__name__
        with Session(engine) as session:
            lesson = session.get(Lesson, lesson_uuid)
            if lesson:
                lesson.status = "failed"
                session.add(lesson)
                session.commit()
            upsert_job_status(
                session,
                lesson_id=lesson_id,
                status="failed",
                progress=100,
                error_message=f"Pipeline failed ({error_code})",
            )
        logger.error("Pipeline failed for %s: %s", lesson_id, error_code)

def run_video_pipeline_sync(
    lesson_id: str,
    video_path: str,
    output_language: str = "vi",
):
    asyncio.run(
        run_video_pipeline(
            lesson_id,
            Path(video_path),
            output_language=output_language,
        )
    )

def shutdown_pipeline_executor():
    executor.shutdown(wait=True)
