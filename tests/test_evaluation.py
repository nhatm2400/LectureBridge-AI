import asyncio
from types import SimpleNamespace

import httpx
import pytest
from openai import RateLimitError

from evaluation.scripts.metrics import evaluate_ask, evaluate_context, evaluate_events, evaluate_qa
from evaluation.scripts.validate_artifacts import validate as validate_artifacts
from evaluation.scripts.run_real_provider_smoke import (
    SmokeCallController,
    SmokeRateLimitStageExhausted,
    _context_debug_artifact,
    _markdown,
    _retry_after_seconds,
    check_configured_model,
    run as run_smoke,
)


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
