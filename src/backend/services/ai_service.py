import json
import logging
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI

from src.backend import config


logger = logging.getLogger(__name__)


class AIService:
    """Canonical transcript, translation, summary, and study-artifact provider calls."""

    TRANSCRIPT_DIR = Path("data/uploads/transcripts")
    MODEL_SIZE = config.WHISPER_MODEL_SIZE
    _whisper_model = None

    @staticmethod
    def _provider_client() -> AsyncOpenAI:
        """Build the configured OpenAI-compatible transport without logging secrets."""
        return AsyncOpenAI(
            api_key=config.GEMINI_API_KEY,
            base_url=config.AI_BASE_URL,
        )

    @staticmethod
    def normalize_caption_language(language: str | None) -> str:
        lang = (language or "").strip().lower()
        return "vi" if lang.startswith("vi") else "en"

    @staticmethod
    def _normalize_segments(segments: list[dict]) -> list[dict[str, Any]]:
        return [
            {
                "index": int(segment.get("index", index)),
                "start": float(segment.get("start", 0) or 0),
                "end": float(segment.get("end", 0) or 0),
                "text": str(segment.get("text", "")).strip(),
            }
            for index, segment in enumerate(segments or [])
        ]

    @classmethod
    def _canonical_segment_chunks(
        cls,
        transcript_data: dict,
        *,
        chunk_size: int = 40,
    ) -> list[list[dict[str, Any]]]:
        segments = cls._normalize_segments(transcript_data.get("segments", []))
        payload = [
            {"segment_id": segment["index"], "text": segment["text"]}
            for segment in segments
            if segment["text"]
        ]
        return [payload[index : index + chunk_size] for index in range(0, len(payload), chunk_size)]

    @classmethod
    def build_bilingual_transcript(
        cls,
        source_transcript: dict,
        translated_transcript: dict | None = None,
        translation_error: str | None = None,
    ) -> dict:
        source_language = cls.normalize_caption_language(source_transcript.get("language"))
        source_segments = cls._normalize_segments(source_transcript.get("segments", []))
        target_language = "en" if source_language == "vi" else "vi"
        segments_by_language: dict[str, list[dict[str, Any]]] = {
            source_language: source_segments
        }
        translation_status = {
            target_language: {
                "status": "translation_failed",
                "error": translation_error or "Translation is not available.",
            }
        }

        if translated_transcript and translated_transcript.get("language") == target_language:
            translated_segments = cls._normalize_segments(translated_transcript.get("segments", []))
            timeline_matches = len(translated_segments) == len(source_segments) and all(
                translated["start"] == source["start"] and translated["end"] == source["end"]
                for source, translated in zip(source_segments, translated_segments)
            )
            if timeline_matches:
                segments_by_language[target_language] = translated_segments
                translation_status[target_language] = {"status": "completed", "error": None}
            else:
                translation_status[target_language]["error"] = (
                    "Translated timeline does not match source transcript."
                )

        preferred_language = "vi" if "vi" in segments_by_language else source_language
        return {
            "video_id": source_transcript.get("video_id")
            or (translated_transcript or {}).get("video_id"),
            "language": preferred_language,
            "source_language": source_language,
            "target_language": target_language,
            "available_languages": [
                language for language in ("vi", "en") if language in segments_by_language
            ],
            "translation_status": translation_status,
            "segments": segments_by_language[preferred_language],
            "segments_by_language": segments_by_language,
        }

    @classmethod
    def get_whisper_model(cls):
        if cls._whisper_model is None:
            from faster_whisper import WhisperModel

            logger.info("Loading Whisper model size=%s on CPU", cls.MODEL_SIZE)
            cls._whisper_model = WhisperModel(
                cls.MODEL_SIZE,
                device="cpu",
                compute_type="int8",
            )
        return cls._whisper_model

    @classmethod
    def transcribe(cls, audio_path: Path, video_id: str) -> dict:
        cls.TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)
        transcript_path = cls.TRANSCRIPT_DIR / f"{video_id}.json"
        if transcript_path.exists():
            return json.loads(transcript_path.read_text(encoding="utf-8"))

        segments, info = cls.get_whisper_model().transcribe(str(audio_path), beam_size=5)
        result = {
            "video_id": video_id,
            "language": info.language,
            "segments": [
                {
                    "index": index,
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": segment.text.strip(),
                }
                for index, segment in enumerate(segments)
            ],
        }
        transcript_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return result

    @classmethod
    async def summarize_full_lecture(cls, transcript_data: dict) -> list[str]:
        """Summarize every canonical transcript chunk, then synthesize all chunks."""
        if not config.GEMINI_API_KEY:
            return []
        chunks = cls._canonical_segment_chunks(transcript_data)
        if not chunks:
            return []
        client = cls._provider_client()
        try:
            partials: list[str] = []
            for chunk in chunks:
                response = await client.chat.completions.create(
                    model=config.AI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Summarize only the supplied lecture evidence in Vietnamese. "
                                "Do not use outside knowledge."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                "Return concise bullet points beginning with '-'. Evidence JSON:\n"
                                + json.dumps(chunk, ensure_ascii=False)
                            ),
                        },
                    ],
                    max_completion_tokens=400,
                )
                partials.append(response.choices[0].message.content or "")

            if len(partials) == 1:
                summary_text = partials[0]
            else:
                response = await client.chat.completions.create(
                    model=config.AI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Synthesize all supplied chunk summaries in Vietnamese. "
                                "Preserve topics from the end of the lecture and add no facts."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                "Return concise bullet points beginning with '-':\n"
                                + json.dumps(partials, ensure_ascii=False)
                            ),
                        },
                    ],
                    max_completion_tokens=700,
                )
                summary_text = response.choices[0].message.content or ""
            return [
                line.strip()
                for line in summary_text.splitlines()
                if line.strip().startswith("-")
            ]
        except Exception as exc:
            logger.error("Full lecture summary provider failed: %s", type(exc).__name__)
            return []

    @classmethod
    async def generate_grounded_flashcards(cls, transcript_data: dict) -> list[dict[str, Any]]:
        """Generate evidence-linked flashcards across every transcript chunk."""
        if not config.GEMINI_API_KEY:
            return []
        chunks = cls._canonical_segment_chunks(transcript_data)
        client = cls._provider_client()
        flashcards: list[dict[str, Any]] = []
        for chunk in chunks:
            try:
                response = await client.chat.completions.create(
                    model=config.AI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Create Vietnamese study flashcards using only the supplied lecture "
                                "evidence. Never invent a fact or source identifier."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                "Return JSON {\"flashcards\":[{\"front\":str,\"back\":str,"
                                "\"hint\":str|null,\"source_segment_ids\":[int]}]}. "
                                "Create at most two useful cards for this chunk. Each card must cite "
                                "one or more segment_id values from this JSON:\n"
                                + json.dumps(chunk, ensure_ascii=False)
                            ),
                        },
                    ],
                    response_format={"type": "json_object"},
                )
                payload = json.loads(response.choices[0].message.content or "{}")
                if isinstance(payload.get("flashcards"), list):
                    flashcards.extend(payload["flashcards"][:2])
            except Exception as exc:
                logger.warning("Flashcard chunk failed: %s", type(exc).__name__)
        return flashcards[:10]

    @classmethod
    async def generate_persistent_quizzes(cls, transcript_data: dict) -> list[dict[str, Any]]:
        """Generate evidence-linked quiz items across every transcript chunk."""
        if not config.GEMINI_API_KEY:
            return []
        chunks = cls._canonical_segment_chunks(transcript_data)
        client = cls._provider_client()
        quizzes: list[dict[str, Any]] = []
        for chunk in chunks:
            try:
                response = await client.chat.completions.create(
                    model=config.AI_MODEL,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "Create Vietnamese multiple-choice questions using only the supplied "
                                "lecture evidence. Never invent a fact or source identifier."
                            ),
                        },
                        {
                            "role": "user",
                            "content": (
                                "Return JSON {\"quizzes\":[{\"question_text\":str,"
                                "\"options\":{\"A\":str,\"B\":str,\"C\":str,\"D\":str},"
                                "\"correct_answer\":\"A|B|C|D\",\"explanation\":str,"
                                "\"difficulty\":str,\"source_segment_ids\":[int]}]}. "
                                "Create at most two useful questions for this chunk. Every item must "
                                "cite segment_id values from this JSON:\n"
                                + json.dumps(chunk, ensure_ascii=False)
                            ),
                        },
                    ],
                    response_format={"type": "json_object"},
                )
                payload = json.loads(response.choices[0].message.content or "{}")
                if isinstance(payload.get("quizzes"), list):
                    quizzes.extend(payload["quizzes"][:2])
            except Exception as exc:
                logger.warning("Quiz chunk failed: %s", type(exc).__name__)
        return quizzes[:10]

    @classmethod
    async def translate_transcript_to_vi(cls, transcript_data: dict) -> dict:
        translated = await cls.translate_transcript_to_language_json(transcript_data, "vi")
        return translated or transcript_data

    @classmethod
    async def translate_transcript_to_language_json(
        cls,
        transcript_data: dict,
        target_language: str,
    ) -> dict | None:
        target = (target_language or "").strip().lower()
        if target not in {"vi", "en"}:
            return None
        source = cls.normalize_caption_language(transcript_data.get("language"))
        normalized = cls._normalize_segments(transcript_data.get("segments", []))
        if source == target:
            return {**transcript_data, "language": target, "segments": normalized}
        if not config.GEMINI_API_KEY or not normalized:
            return None

        client = cls._provider_client()
        translator_system = (
            "Translate each segment accurately into natural academic Vietnamese."
            if target == "vi"
            else "Translate each segment accurately into natural academic English."
        )

        async def translate_chunk(chunk: list[dict[str, Any]]) -> list[dict[str, Any]]:
            source_payload = [
                {"index": segment["index"], "text": segment["text"]}
                for segment in chunk
            ]
            last_error: Exception | None = None
            for _ in range(2):
                try:
                    response = await client.chat.completions.create(
                        model=config.AI_MODEL,
                        messages=[
                            {
                                "role": "system",
                                "content": (
                                    translator_system
                                    + " Preserve every index and return no extra segments."
                                ),
                            },
                            {
                                "role": "user",
                                "content": (
                                    "Return JSON {\"segments\":[{\"index\":int,\"text\":str}]}:\n"
                                    + json.dumps(source_payload, ensure_ascii=False)
                                ),
                            },
                        ],
                        response_format={"type": "json_object"},
                    )
                    payload = json.loads(response.choices[0].message.content or "{}")
                    translated = payload.get("segments")
                    if not isinstance(translated, list) or len(translated) != len(chunk):
                        raise ValueError("Translation segment count mismatch")
                    by_index = {
                        int(item["index"]): str(item["text"]).strip()
                        for item in translated
                        if isinstance(item, dict) and "index" in item and "text" in item
                    }
                    if set(by_index) != {segment["index"] for segment in chunk}:
                        raise ValueError("Translation segment indices mismatch")
                    return [
                        {**segment, "text": by_index[segment["index"]]}
                        for segment in chunk
                    ]
                except Exception as exc:
                    last_error = exc
            raise RuntimeError("Translation chunk failed") from last_error

        try:
            translated_segments: list[dict[str, Any]] = []
            for index in range(0, len(normalized), 20):
                translated_segments.extend(await translate_chunk(normalized[index : index + 20]))
            return {**transcript_data, "language": target, "segments": translated_segments}
        except Exception as exc:
            logger.error("Transcript translation failed: %s", type(exc).__name__)
            return None

    @classmethod
    async def identify_category(
        cls,
        transcript_summary: list,
        available_categories: list[str],
    ) -> str:
        if not config.GEMINI_API_KEY or not available_categories:
            return "Chung"
        client = cls._provider_client()
        try:
            response = await client.chat.completions.create(
                model=config.AI_MODEL,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Choose exactly one category from this list for the lecture summary. "
                            "Return only the category name, or Chung if none fits. Categories: "
                            + json.dumps(available_categories, ensure_ascii=False)
                            + "\nSummary: "
                            + json.dumps(transcript_summary, ensure_ascii=False)
                        ),
                    }
                ],
                max_completion_tokens=50,
            )
            candidate = (response.choices[0].message.content or "").strip()
            return candidate if candidate in available_categories else "Chung"
        except Exception as exc:
            logger.warning("Category provider failed: %s", type(exc).__name__)
            return "Chung"
