from src.backend.services.ai_service import AIService


def test_build_bilingual_transcript_from_english_source_keeps_timelines():
    source = {
        "video_id": "lesson-1",
        "language": "en",
        "segments": [
            {"start": 0.0, "end": 2.5, "text": "Welcome to the lesson."},
            {"start": 2.5, "end": 5.0, "text": "We will learn regularization."},
        ],
    }
    translated = {
        "video_id": "lesson-1",
        "language": "vi",
        "segments": [
            {"start": 0.0, "end": 2.5, "text": "Chao mung den voi bai hoc."},
            {"start": 2.5, "end": 5.0, "text": "Chung ta se hoc regularization."},
        ],
    }

    result = AIService.build_bilingual_transcript(source, translated)

    assert result["source_language"] == "en"
    assert result["available_languages"] == ["vi", "en"]
    assert result["segments_by_language"]["en"][0]["text"] == "Welcome to the lesson."
    assert result["segments_by_language"]["vi"][0]["text"] == "Chao mung den voi bai hoc."
    assert [
        (s["start"], s["end"]) for s in result["segments_by_language"]["en"]
    ] == [
        (s["start"], s["end"]) for s in result["segments_by_language"]["vi"]
    ]


def test_build_bilingual_transcript_from_vietnamese_source_keeps_timelines():
    source = {
        "video_id": "lesson-2",
        "language": "vi",
        "segments": [
            {"start": 10.0, "end": 12.0, "text": "Hom nay chung ta hoc AI."},
            {"start": 12.0, "end": 16.0, "text": "Bai hoc co hai phan."},
        ],
    }
    translated = {
        "video_id": "lesson-2",
        "language": "en",
        "segments": [
            {"start": 10.0, "end": 12.0, "text": "Today we learn AI."},
            {"start": 12.0, "end": 16.0, "text": "The lesson has two parts."},
        ],
    }

    result = AIService.build_bilingual_transcript(source, translated)

    assert result["source_language"] == "vi"
    assert result["available_languages"] == ["vi", "en"]
    assert result["segments_by_language"]["vi"][1]["text"] == "Bai hoc co hai phan."
    assert result["segments_by_language"]["en"][1]["text"] == "The lesson has two parts."
    assert [
        (s["start"], s["end"]) for s in result["segments_by_language"]["vi"]
    ] == [
        (s["start"], s["end"]) for s in result["segments_by_language"]["en"]
    ]


def test_build_bilingual_transcript_marks_translation_failed_without_mixing_data():
    source = {
        "video_id": "lesson-3",
        "language": "en",
        "segments": [{"start": 0.0, "end": 1.0, "text": "Only source caption."}],
    }

    result = AIService.build_bilingual_transcript(
        source,
        translated_transcript=None,
        translation_error="Provider timeout",
    )

    assert result["available_languages"] == ["en"]
    assert set(result["segments_by_language"]) == {"en"}
    assert result["translation_status"]["vi"]["status"] == "translation_failed"
    assert result["translation_status"]["vi"]["error"] == "Provider timeout"
