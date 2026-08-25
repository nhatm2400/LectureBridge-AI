from src.backend.services.artifact_service import build_ai_analysis


def test_build_ai_analysis_normalizes_canonical_artifacts_and_marks_ready():
    result = build_ai_analysis(
        transcript={"segments": [{"index": 0, "text": "AI source"}]},
        summary=["  Y chinh 1  ", ""],
        flashcards=[
            {
                "front": "AI la gi?",
                "back": "Tri tue nhan tao",
                "source_segment_ids": [0],
            }
        ],
        quizzes=[
            {
                "question_text": "AI la gi?",
                "options": {"A": "Dung", "B": "Sai"},
                "correct_answer": "A",
                "explanation": "Giai thich",
                "difficulty": "De",
                "source_segment_ids": [0],
            }
        ],
        require_source_evidence=True,
    )

    assert result["summary"] == ["Y chinh 1"]
    assert result["flashcards"][0]["front"] == "AI la gi?"
    assert result["quizzes"][0]["correct_answer"] == "A"
    assert set(result) == {
        "transcript",
        "summary",
        "flashcards",
        "quizzes",
        "artifact_status",
        "output_language",
    }
    assert result["output_language"] == "vi"
    assert result["artifact_status"]["summary"]["status"] == "ready"
    assert result["artifact_status"]["quizzes"]["status"] == "ready"


def test_build_ai_analysis_marks_failed_artifact_without_breaking_others():
    result = build_ai_analysis(
        transcript={"segments": []},
        summary=["Ready"],
        flashcards=[],
        quizzes=[],
        errors={"flashcards": "provider timeout"},
    )

    assert result["summary"] == ["Ready"]
    assert result["artifact_status"]["summary"]["status"] == "ready"
    assert result["artifact_status"]["flashcards"]["status"] == "failed"
    assert result["artifact_status"]["flashcards"]["error"] == "provider timeout"
