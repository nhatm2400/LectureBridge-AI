import asyncio
import csv
import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest
from openai import RateLimitError

from evaluation.scripts.metrics import evaluate_ask, evaluate_context, evaluate_events, evaluate_qa
from evaluation.scripts.validate_artifacts import validate as validate_artifacts
from evaluation.scripts.run_evaluation import build_results as build_evaluation_results
from evaluation.scripts.prepare_human_review import build as build_review_pack
from evaluation.scripts.review_validation import (
    AI_ASSISTED_PENDING_CONFIRMATION,
    HUMAN_VERIFIED,
    validate_review_pack,
)
from evaluation.scripts.run_real_provider_smoke import (
    SmokeCallController,
    SmokeRateLimitStageExhausted,
    _context_debug_artifact,
    _markdown,
    _retry_after_seconds,
    check_configured_model,
    run as run_smoke,
)


ROOT = Path(__file__).resolve().parents[1]


ACTIVE_REVIEW_PACK_FILES = (
    "event-predictions-review.csv",
    "qa-links-review.csv",
    "context-recovery-review.csv",
    "ask-review.csv",
)
REVIEW_PACK_FILES = ACTIVE_REVIEW_PACK_FILES + ("event-recall-gold-review.csv",)


def _set_human_verification_status(rows, status):
    for row in rows:
        row["human_verification_status"] = status


def _copy_review_pack(tmp_path):
    source = ROOT / "evaluation" / "review_pack"
    target = tmp_path / "review_pack"
    target.mkdir()
    for name in REVIEW_PACK_FILES:
        shutil.copyfile(source / name, target / name)
    for name in ACTIVE_REVIEW_PACK_FILES:
        _edit_review_csv(
            target / name,
            lambda rows: _set_human_verification_status(rows, ""),
        )
    return target


def _edit_review_csv(path, edit):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    edit(rows)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def _complete_reviewer_a(review_root, *, human_verified=False):
    def complete_events(rows):
        for row in rows:
            row["reviewer_a_judgment"] = "CORRECT"
            row["reviewer_a_corrected_type"] = ""
            row["reviewer_a_timestamp_judgment"] = "CORRECT"

    def complete_qa(rows):
        for row in rows:
            row["reviewer_a_link_correct"] = "true"
            row["reviewer_a_correct_answer_event_id"] = ""
            row["reviewer_a_should_have_no_answer"] = "false"

    def complete_context(rows):
        for row in rows:
            item_count = len(json.loads(row["model_context_items"]))
            values = json.dumps([True] * item_count, separators=(",", ":")).lower()
            row["reviewer_a_claim_grounded_json"] = values
            row["reviewer_a_claim_supported_by_citation_json"] = values
            row["reviewer_a_completeness"] = "2"
            row["reviewer_a_usefulness"] = "2"
            row["reviewer_a_unsupported_claim_present"] = "false"

    def complete_ask(rows):
        for row in rows:
            if row["model_abstained"].lower() == "true":
                row["reviewer_a_answer_correct"] = ""
                row["reviewer_a_answer_supported"] = ""
                row["reviewer_a_citation_correct"] = ""
                row["reviewer_a_abstention_correct"] = "true"
            else:
                row["reviewer_a_answer_correct"] = "true"
                row["reviewer_a_answer_supported"] = "true"
                row["reviewer_a_citation_correct"] = "true"
                row["reviewer_a_abstention_correct"] = ""
            row["reviewer_a_unsupported_claim_present"] = "false"

    for name, edit in (
        ("event-predictions-review.csv", complete_events),
        ("qa-links-review.csv", complete_qa),
        ("context-recovery-review.csv", complete_context),
        ("ask-review.csv", complete_ask),
    ):
        def apply(rows, *, row_edit=edit):
            row_edit(rows)
            if human_verified:
                for row in rows:
                    row["human_verification_status"] = HUMAN_VERIFIED

        _edit_review_csv(review_root / name, apply)


def test_event_metrics_use_one_to_one_temporal_type_matching():
    gold = {
        "videos": [
            {
                "video_id": "v1",
                "events": [
                    {"type": "QUESTION", "start_time": 10, "end_time": 20},
                    {"type": "ANSWER", "start_time": 25, "end_time": 35},
                ],
            }
        ]
    }
    predictions = {
        "videos": [
            {
                "video_id": "v1",
                "events": [
                    {"type": "QUESTION", "start_time": 11, "end_time": 19},
                    {"type": "QUESTION", "start_time": 12, "end_time": 18},
                    {"type": "ANSWER", "start_time": 50, "end_time": 55},
                ],
            }
        ]
    }
    result = evaluate_events(gold, predictions)
    assert result["overall"]["tp"] == 1
    assert result["overall"]["fp"] == 2
    assert result["overall"]["fn"] == 1
    assert result["timestamp"]["mean_absolute_start_error_seconds"] == 1


def test_qa_metrics_report_numerators_and_no_answer_accuracy():
    result = evaluate_qa(
        [
            {"video_id": "v", "question_event_id": "q1", "correct_answer_event_ids": ["a1"], "predicted_answer_event_ids": ["a1"]},
            {"video_id": "v", "question_event_id": "q2", "correct_answer_event_ids": [], "predicted_answer_event_ids": []},
        ]
    )
    assert result["pairing_accuracy"] == 1
    assert result["link"]["precision"] == 1
    assert result["no_answer_numerator"] == 1
    assert result["no_answer_denominator"] == 1


def test_context_and_ask_review_metrics_are_computed_from_review_fields():
    context = evaluate_context(
        [
            {"claims": [{"supported": True}, {"supported": False}], "completeness": 1, "usefulness": 2},
            {"claims": [{"supported": True}], "completeness": 2, "usefulness": 2},
        ]
    )
    assert context["grounded_claim_rate"] == 0.666667
    assert context["mean_usefulness_score"] == 2
    ask = evaluate_ask(
        [
            {"supported": True, "system_result": {"answer_correctness": 2, "citation_correct": True, "retrieval_hit": True, "unsupported_claim_count": 0}},
            {"supported": False, "system_result": {"supported": False, "unsupported_claim_count": 0}},
        ]
    )
    assert ask["supported_answer_correctness"] == 1
    assert ask["unsupported_abstention_accuracy"] == 1


def test_real_provider_smoke_is_honestly_blocked_without_key(monkeypatch):
    monkeypatch.setattr("evaluation.scripts.run_real_provider_smoke.config.GEMINI_API_KEY", "")
    result = asyncio.run(run_smoke({"samples": [{"sample_id": "one"}]}))
    assert result["status"] == "BLOCKED_BY_CONFIGURATION"
    assert result["sample_count_executed"] == 0
    assert result["credential_value_logged"] is False


def test_model_check_uses_fake_client_and_normalizes_gemini_ids(monkeypatch):
    class FakeModels:
        async def list(self):
            return SimpleNamespace(
                data=[
                    SimpleNamespace(id="models/gemini-2.5-flash"),
                    SimpleNamespace(id="gemini-2.5-pro"),
                ]
            )

    fake_client = SimpleNamespace(models=FakeModels())
    monkeypatch.setattr(
        "evaluation.scripts.run_real_provider_smoke.config.AI_MODEL",
        "gemini-2.5-flash",
    )
    result = asyncio.run(check_configured_model(fake_client))
    assert result["status"] == "PASS"
    assert result["configured_model_available"] is True
    assert result["available_models"] == ["gemini-2.5-flash", "gemini-2.5-pro"]


def test_smoke_markdown_records_failed_sample_without_prediction_fields():
    rendered = _markdown(
        {
            "status": "FAIL",
            "provider": "gemini-openai-compatible",
            "provider_model": "gemini-test",
            "sample_count_executed": 1,
            "samples": [
                {
                    "sample_id": "synthetic-vi",
                    "language": "vi",
                    "status": "FAILED",
                    "error_code": "RateLimitError",
                }
            ],
        }
    )
    assert "synthetic-vi" in rendered
    assert "NOT_RECORDED" in rendered


def test_gemini_retry_delay_is_read_without_exposing_response_body():
    error = SimpleNamespace(
        response=SimpleNamespace(headers={}),
        body={
            "error": {
                "details": [
                    {
                        "@type": "type.googleapis.com/google.rpc.RetryInfo",
                        "retryDelay": "12.5s",
                    }
                ]
            }
        },
    )
    assert _retry_after_seconds(error) == 12.5


def test_smoke_429_retries_share_one_bounded_stage_budget(monkeypatch):
    monkeypatch.setattr(
        "evaluation.scripts.run_real_provider_smoke.config.SMOKE_RATE_LIMIT_MAX_ATTEMPTS",
        3,
    )
    monkeypatch.setattr(
        "evaluation.scripts.run_real_provider_smoke.config.SMOKE_RATE_LIMIT_BACKOFF_SECONDS",
        "0,0",
    )
    monkeypatch.setattr(
        "evaluation.scripts.run_real_provider_smoke.config.SMOKE_RATE_LIMIT_JITTER_SECONDS",
        0,
    )
    controller = SmokeCallController()
    request = httpx.Request("POST", "https://provider.invalid/chat")
    response = httpx.Response(429, request=request)
    calls = 0

    async def always_limited():
        nonlocal calls
        calls += 1
        raise RateLimitError("rate limited", response=response, body={})

    async def exercise():
        await controller.start_stage("event_extraction", pace=False)
        with pytest.raises(RateLimitError):
            await controller.call(always_limited)
        with pytest.raises(SmokeRateLimitStageExhausted):
            controller.raise_if_rate_limit_exhausted()

    asyncio.run(exercise())
    assert calls == 3
    assert controller.telemetry()["total_provider_call_count"] == 3


def test_context_debug_artifact_contains_reason_codes_not_raw_content():
    artifact = _context_debug_artifact(
        {
            "selected_sample_id": "synthetic-vi-regularization",
            "samples": [
                {
                    "sample_id": "synthetic-vi-regularization",
                    "context_status": "FAIL",
                    "context_debug": [
                        {
                            "failure_class": "EMPTY_AFTER_VALIDATION",
                            "rejection_reason_codes": {"UNKNOWN_SOURCE_ID": 1},
                        }
                    ],
                    "provider_telemetry": {"stages": {}},
                }
            ],
        }
    )
    rendered = str(artifact)
    assert artifact["failure_class"] == "EMPTY_AFTER_VALIDATION"
    assert "prompt" not in rendered.lower()
    assert "transcript" not in rendered.lower()


def test_evaluation_json_and_csv_artifacts_are_structurally_valid():
    assert validate_artifacts() == []


def test_empty_reviewer_a_fields_are_valid_pending_review(tmp_path):
    review_root = _copy_review_pack(tmp_path)
    result = validate_review_pack(review_root)
    assert result.errors == []
    assert result.review_state == AI_ASSISTED_PENDING_CONFIRMATION
    assert result.completed_total == 47
    assert result.required_total == 47
    assert result.metrics_allowed is False


def test_valid_partial_ai_assisted_reviewer_a_fields_are_allowed(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0]["reviewer_a_judgment"] = "CORRECT"
        rows[0]["reviewer_a_timestamp_judgment"] = "CORRECT"

    _edit_review_csv(review_root / "event-predictions-review.csv", edit)
    result = validate_review_pack(review_root)
    assert result.errors == []
    assert result.review_state == AI_ASSISTED_PENDING_CONFIRMATION
    assert result.completion["Event"] == (20, 20)
    assert result.metrics_allowed is False


def test_invalid_reviewer_a_event_enum_is_rejected(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0]["reviewer_a_judgment"] = "PASS"

    _edit_review_csv(review_root / "event-predictions-review.csv", edit)
    result = validate_review_pack(review_root)
    assert any(error.startswith("invalid_event_judgment:") for error in result.errors)


def test_invalid_reviewer_a_boolean_literal_is_rejected(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0]["reviewer_a_link_correct"] = "True"

    _edit_review_csv(review_root / "qa-links-review.csv", edit)
    result = validate_review_pack(review_root)
    assert any(error.startswith("invalid_boolean_literal:") for error in result.errors)


def test_invalid_context_review_json_is_rejected(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0]["reviewer_a_claim_grounded_json"] = "[true,]"

    _edit_review_csv(review_root / "context-recovery-review.csv", edit)
    result = validate_review_pack(review_root)
    assert any(error.startswith("invalid_context_json:") for error in result.errors)


def test_context_boolean_array_length_must_match_items(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0]["reviewer_a_claim_grounded_json"] = "[true]"

    _edit_review_csv(review_root / "context-recovery-review.csv", edit)
    result = validate_review_pack(review_root)
    assert any(error.startswith("context_array_length_mismatch:") for error in result.errors)


@pytest.mark.parametrize("field,value", [("reviewer_a_completeness", "3"), ("reviewer_a_usefulness", "-1")])
def test_context_scores_must_be_zero_to_two(tmp_path, field, value):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0][field] = value

    _edit_review_csv(review_root / "context-recovery-review.csv", edit)
    result = validate_review_pack(review_root)
    assert any(error.startswith("invalid_context_score:") for error in result.errors)


def test_complete_ai_assisted_review_does_not_become_human_verified(tmp_path):
    review_root = _copy_review_pack(tmp_path)
    _complete_reviewer_a(review_root)
    result = validate_review_pack(review_root)
    assert result.errors == []
    assert result.completed_total == 47
    assert result.review_state == AI_ASSISTED_PENDING_CONFIRMATION
    assert result.metrics_allowed is False


def test_metrics_remain_blocked_before_explicit_human_verification(tmp_path):
    review_root = _copy_review_pack(tmp_path)
    _complete_reviewer_a(review_root)
    result = validate_review_pack(review_root)
    assert result.metrics_allowed is False

    current_results = build_evaluation_results(review_root=review_root)
    assert all(value is None for value in current_results["metrics"].values())
    assert current_results["review_status"] == AI_ASSISTED_PENDING_CONFIRMATION


def test_explicit_human_verification_of_complete_valid_review_opens_metrics_gate(tmp_path):
    review_root = _copy_review_pack(tmp_path)
    _complete_reviewer_a(review_root, human_verified=True)
    result = validate_review_pack(review_root)
    assert result.errors == []
    assert result.completed_total == 47
    assert result.review_state == HUMAN_VERIFIED
    assert result.metrics_allowed is True


def test_human_verified_metrics_are_derived_from_review_csvs(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    for name in ACTIVE_REVIEW_PACK_FILES:
        _edit_review_csv(
            review_root / name,
            lambda rows: _set_human_verification_status(rows, HUMAN_VERIFIED),
        )

    result = build_evaluation_results(review_root=review_root)
    assert result["status"] == "COMPLETE"
    assert result["review_status"] == HUMAN_VERIFIED
    assert result["blockers"] == []

    events = result["metrics"]["events"]
    assert events["prediction_precision"]["true_positive_predictions"] == 20
    assert events["prediction_precision"]["false_positive_predictions"] == 0
    assert events["prediction_precision"]["strict_precision"] == 1.0
    assert events["gold_recall"]["true_positive_gold_matches"] == 11
    assert events["gold_recall"]["false_negative_gold_events"] == 1
    assert events["gold_recall"]["missing_event_ids"] == ["en-topic-serializable"]
    assert events["gold_recall"]["recall"] == 0.916667
    assert events["reviewed_precision_recall_f1"] == 0.956522

    qa = result["metrics"]["question_answer_links"]
    assert qa["correct_links"] == 3
    assert qa["link_accuracy"] == 1.0

    context = result["metrics"]["context_recovery"]
    assert context["grounded_claim_count"] == 51
    assert context["grounded_claim_rate"] == 1.0
    assert context["mean_completeness_score"] == 1.888889
    assert context["mean_usefulness_score"] == 1.777778

    ask = result["metrics"]["grounded_ask"]
    assert ask["answer_correct_count"] == 9
    assert ask["citation_correct_count"] == 8
    assert ask["supported_question_success_rate"] == 0.9
    assert ask["unsupported_question_abstention_accuracy"] == 1.0


def test_ai_assisted_validation_rejects_immutable_prediction_changes(tmp_path):
    review_root = _copy_review_pack(tmp_path)

    def edit(rows):
        rows[0]["model_answer"] = "changed prediction"

    _edit_review_csv(review_root / "ask-review.csv", edit)
    _, _, generated = build_review_pack()
    result = validate_review_pack(review_root, canonical_packs=generated["packs"])
    assert any(error.startswith("immutable_review_field_changed:") for error in result.errors)
