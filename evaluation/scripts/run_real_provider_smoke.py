from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from openai import AsyncOpenAI, RateLimitError

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel, Session, create_engine

from src.backend import config
from src.backend.models import Category, ContentMetadata, Course, Lesson, Module
from src.backend.services.lecture_grounding.provider import OpenAILectureGroundingProvider
from src.backend.services.lecture_grounding.service import (
    ask_lecture,
    build_context_evidence,
    recover_lecture_context,
)
from src.backend.services.question_answer_links.provider import OpenAIQuestionAnswerLinkProvider
from src.backend.services.question_answer_links.service import (
    list_event_relations,
    process_question_answer_links,
)
from src.backend.services.semantic_events.provider import OpenAISemanticEventProvider
from src.backend.services.semantic_events.service import list_lecture_events, process_lecture_events


DEFAULT_MANIFEST = ROOT / "evaluation" / "data" / "smoke-manifest.json"
DEFAULT_OUTPUT = ROOT / "evaluation" / "results" / "real_provider_smoke.json"
DEFAULT_CONTEXT_DEBUG_OUTPUT = ROOT / "evaluation" / "results" / "context-debug-vi.json"
PROVIDER_NAME = "gemini-openai-compatible"


class SmokeProviderCallBudgetExceeded(RuntimeError):
    """Raised before a provider call would exceed the configured stage budget."""


class SmokeRateLimitStageExhausted(RuntimeError):
    """Raised after a service swallowed the terminal 429 for its stage."""


def _backoff_schedule() -> list[float]:
    values: list[float] = []
    for raw in config.SMOKE_RATE_LIMIT_BACKOFF_SECONDS.split(","):
        try:
            values.append(max(0.0, float(raw.strip())))
        except ValueError:
            continue
    return values or [5.0, 15.0]


def _retry_after_seconds(exc: RateLimitError) -> float | None:
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None)
    if headers:
        raw = headers.get("retry-after") or headers.get("Retry-After")
        try:
            if raw is not None:
                return max(0.0, float(raw))
        except (TypeError, ValueError):
            pass
    body = getattr(exc, "body", None)
    error = body.get("error", body) if isinstance(body, dict) else {}
    details = error.get("details", []) if isinstance(error, dict) else []
    for detail in details if isinstance(details, list) else []:
        if not isinstance(detail, dict):
            continue
        retry_delay = detail.get("retryDelay") or detail.get("retry_delay")
        if isinstance(retry_delay, str) and retry_delay.endswith("s"):
            try:
                return max(0.0, float(retry_delay[:-1]))
            except ValueError:
                continue
    return None


class SmokeCallController:
    """Bound actual SDK calls and apply 429 backoff only in the smoke harness."""

    def __init__(self) -> None:
        self.max_calls_per_stage = max(
            1,
            min(int(config.SMOKE_RATE_LIMIT_MAX_ATTEMPTS), 3),
        )
        self.provider_delay_seconds = max(0.0, config.SMOKE_PROVIDER_DELAY_SECONDS)
        self.max_wait_seconds = max(0.0, config.SMOKE_RATE_LIMIT_MAX_WAIT_SECONDS)
        self.jitter_seconds = max(0.0, config.SMOKE_RATE_LIMIT_JITTER_SECONDS)
        self.backoff = _backoff_schedule()
        self.current_stage: str | None = None
        self.stats: dict[str, dict[str, Any]] = {}

    async def start_stage(self, stage: str, *, pace: bool) -> None:
        self.current_stage = stage
        stat = self.stats.setdefault(
            stage,
            {
                "provider_call_count": 0,
                "rate_limit_count": 0,
                "retry_wait_seconds": [],
                "pacing_delay_seconds": 0.0,
                "budget_exhausted": False,
            },
        )
        if pace and self.provider_delay_seconds:
            stat["pacing_delay_seconds"] = self.provider_delay_seconds
            await asyncio.sleep(self.provider_delay_seconds)

    async def call(self, operation: Callable[[], Awaitable[Any]]) -> Any:
        if self.current_stage is None:
            raise RuntimeError("Smoke provider stage was not initialized.")
        stat = self.stats[self.current_stage]
        while True:
            if stat["provider_call_count"] >= self.max_calls_per_stage:
                stat["budget_exhausted"] = True
                raise SmokeProviderCallBudgetExceeded(
                    f"Provider call budget exhausted for stage {self.current_stage}."
                )
            stat["provider_call_count"] += 1
            try:
                return await operation()
            except RateLimitError as exc:
                stat["rate_limit_count"] += 1
                if stat["provider_call_count"] >= self.max_calls_per_stage:
                    stat["budget_exhausted"] = True
                    raise
                retry_after = _retry_after_seconds(exc)
                schedule_index = min(stat["rate_limit_count"] - 1, len(self.backoff) - 1)
                wait_seconds = retry_after if retry_after is not None else self.backoff[schedule_index]
                if retry_after is None and self.jitter_seconds:
                    wait_seconds += random.uniform(0.0, self.jitter_seconds)
                wait_seconds = min(wait_seconds, self.max_wait_seconds)
                stat["retry_wait_seconds"].append(round(wait_seconds, 3))
                await asyncio.sleep(wait_seconds)

    def telemetry(self) -> dict[str, Any]:
        return {
            "max_provider_calls_per_stage": self.max_calls_per_stage,
            "stages": self.stats,
            "total_provider_call_count": sum(
                int(stat["provider_call_count"]) for stat in self.stats.values()
            ),
            "total_rate_limit_count": sum(
                int(stat["rate_limit_count"]) for stat in self.stats.values()
            ),
        }

    def raise_if_rate_limit_exhausted(self) -> None:
        if self.current_stage is None:
            return
        stat = self.stats[self.current_stage]
        if stat["rate_limit_count"] and stat["budget_exhausted"]:
            raise SmokeRateLimitStageExhausted(
                f"Rate-limit budget exhausted for stage {self.current_stage}."
            )


class _SemanticProvider:
    def __init__(self, delegate: OpenAISemanticEventProvider, controller: SmokeCallController):
        self.delegate = delegate
        self.controller = controller

    async def extract_events(self, chunk, output_language, *, corrective_instruction=None):
        return await self.controller.call(
            lambda: self.delegate.extract_events(
                chunk,
                output_language,
                corrective_instruction=corrective_instruction,
            )
        )


class _QuestionAnswerProvider:
    def __init__(self, delegate: OpenAIQuestionAnswerLinkProvider, controller: SmokeCallController):
        self.delegate = delegate
        self.controller = controller

    async def select_links(
        self,
        question,
        candidate_answers,
        supporting_segments,
        *,
        corrective_instruction=None,
    ):
        return await self.controller.call(
            lambda: self.delegate.select_links(
                question,
                candidate_answers,
                supporting_segments,
                corrective_instruction=corrective_instruction,
            )
        )


class _GroundingProvider:
    def __init__(self, delegate: OpenAILectureGroundingProvider, controller: SmokeCallController):
        self.delegate = delegate
        self.controller = controller

    async def recover_context(self, evidence_units, output_language, *, corrective_instruction=None):
        return await self.controller.call(
            lambda: self.delegate.recover_context(
                evidence_units,
                output_language,
                corrective_instruction=corrective_instruction,
            )
        )

    async def answer_question(
        self,
        question,
        evidence_units,
        output_language,
        *,
        corrective_instruction=None,
    ):
        return await self.controller.call(
            lambda: self.delegate.answer_question(
                question,
                evidence_units,
                output_language,
                corrective_instruction=corrective_instruction,
            )
        )


def _bounded(value: int, hard_maximum: int) -> int:
    return max(0, min(int(value), hard_maximum))


def _blocked_result(manifest: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "BLOCKED_BY_CONFIGURATION",
        "provider": PROVIDER_NAME,
        "provider_model": config.AI_MODEL,
        "reason": "GEMINI_API_KEY is not configured in the local environment.",
        "credential_value_logged": False,
        "model_check": "NOT_RUN",
        "sample_count_available": len(manifest.get("samples", [])),
        "sample_count_executed": 0,
        "samples": [],
    }


def _normalized_model_id(model_id: str) -> str:
    normalized = str(model_id or "").strip()
    return normalized.removeprefix("models/")


async def check_configured_model(
    client: AsyncOpenAI | None = None,
    controller: SmokeCallController | None = None,
) -> dict[str, Any]:
    """List provider models and verify the configured model without exposing a key."""
    provider_client = client or AsyncOpenAI(
        api_key=config.GEMINI_API_KEY,
        base_url=config.AI_BASE_URL,
        max_retries=0,
    )
    try:
        if controller is not None:
            await controller.start_stage("model_discovery", pace=False)
            response = await controller.call(provider_client.models.list)
        else:
            response = await provider_client.models.list()
        available = sorted(
            {
                _normalized_model_id(item.id)
                for item in response.data
                if _normalized_model_id(item.id)
            }
        )
    except Exception as exc:
        return {
            "status": "MODEL_DISCOVERY_FAILED",
            "configured_model": config.AI_MODEL,
            "configured_model_available": False,
            "available_model_count": 0,
            "available_models": [],
            "error_code": type(exc).__name__,
        }
    configured = _normalized_model_id(config.AI_MODEL)
    is_available = configured in available
    return {
        "status": "PASS" if is_available else "MODEL_NOT_AVAILABLE",
        "configured_model": configured,
        "configured_model_available": is_available,
        "available_model_count": len(available),
        "available_models": available,
    }


def _seed_sample(session: Session, sample: dict[str, Any], transcript: dict[str, Any]) -> str:
    category = Category(name="LectureBridge synthetic smoke")
    session.add(category)
    session.flush()
    course = Course(category_id=category.id, title="LectureBridge provider smoke")
    session.add(course)
    session.flush()
    module = Module(course_id=course.id, title="Smoke samples")
    session.add(module)
    session.flush()
    lesson_id = uuid.uuid5(uuid.NAMESPACE_URL, f"lecturebridge:{sample['sample_id']}")
    session.add(
        Lesson(
            id=lesson_id,
            module_id=module.id,
            title=sample["sample_id"],
            status="completed",
            duration_minutes=max(1, round(float(sample["duration_seconds"]) / 60)),
        )
    )
    source_language = "en" if sample["language"] == "en" else "vi"
    stored_transcript = {
        "video_id": str(lesson_id),
        "language": source_language,
        "source_language": source_language,
        "available_languages": [source_language],
        "segments": transcript["segments"],
        "segments_by_language": {source_language: transcript["segments"]},
    }
    session.add(
        ContentMetadata(
            lesson_id=lesson_id,
            ai_analysis={"transcript": stored_transcript},
        )
    )
    session.commit()
    return str(lesson_id)


def _context_input_diagnostics(
    session: Session,
    video_id: str,
    *,
    current_time: float,
    window_seconds: int,
) -> dict[str, Any]:
    units, _, segments_by_id, _ = build_context_evidence(
        session,
        video_id,
        current_time=current_time,
        window_seconds=window_seconds,
    )
    events = list_lecture_events(session, video_id)
    relations = list_event_relations(session, video_id)
    events_by_id = {str(event.id): event for event in events}
    relations_by_id = {str(relation.id): relation for relation in relations}
    referenced_event_ids = {
        event_id for unit in units for event_id in unit.source_event_ids
    }
    referenced_segment_ids = {
        segment_id for unit in units for segment_id in unit.source_segment_ids
    }
    referenced_relation_ids = {
        unit.evidence_id.removeprefix("relation:")
        for unit in units
        if unit.kind == "relation" and unit.evidence_id.startswith("relation:")
    }
    referenced_events = [
        events_by_id[event_id]
        for event_id in referenced_event_ids
        if event_id in events_by_id
    ]
    referenced_relations = [
        relations_by_id[relation_id]
        for relation_id in referenced_relation_ids
        if relation_id in relations_by_id
    ]
    return {
        "all_event_ids_exist": referenced_event_ids <= events_by_id.keys(),
        "all_relation_ids_exist": referenced_relation_ids <= relations_by_id.keys(),
        "all_segment_ids_canonical": referenced_segment_ids <= segments_by_id.keys(),
        "all_referenced_items_same_video": all(
            str(item.video_id) == video_id
            for item in [*referenced_events, *referenced_relations]
        ),
        "no_rejected_event_or_relation_in_context": all(
            event.review_status != "REJECTED" for event in referenced_events
        )
        and all(
            relation.review_status != "REJECTED" for relation in referenced_relations
        ),
    }


def _event_prediction(event) -> dict[str, Any]:
    return {
        "prediction_id": str(event.id),
        "event_type": event.event_type,
        "explicit_or_inferred": event.inference_type,
        "source_segment_ids": list(event.source_segment_ids),
        "backend_start_time": event.start_time,
        "backend_end_time": event.end_time,
        "title": event.title,
        "description": event.description,
        "confidence": event.confidence,
        "created_by": event.created_by,
        "review_status": event.review_status,
    }


def _relation_prediction(relation, events_by_id: dict[str, Any]) -> dict[str, Any]:
    question = events_by_id[str(relation.source_event_id)]
    answer = events_by_id[str(relation.target_event_id)]
    return {
        "prediction_id": str(relation.id),
        "question_event_id": str(relation.source_event_id),
        "answer_event_id": str(relation.target_event_id),
        "relation_type": relation.relation_type,
        "relation_status": relation.review_status,
        "confidence": relation.confidence,
        "source_event_ids": [str(question.id), str(answer.id)],
        "source_segment_ids": sorted(
            set(question.source_segment_ids + answer.source_segment_ids)
        ),
        "backend_start_time": min(question.start_time, answer.start_time),
        "backend_end_time": max(question.end_time, answer.end_time),
    }


def _context_item_prediction(item) -> dict[str, Any]:
    evidence_ids = [f"event:{event_id}" for event_id in item.source_event_ids]
    evidence_ids.extend(
        f"segment:{segment_id}" for segment_id in item.source_segment_ids
    )
    return {
        "accepted_context_item_type": item.type,
        "text": item.text,
        "canonical_evidence_ids": evidence_ids,
        "source_event_ids": list(item.source_event_ids),
        "source_segment_ids": list(item.source_segment_ids),
        "backend_start_time": item.timestamp,
        "backend_end_time": None,
    }


def _citation_prediction(citation) -> dict[str, Any]:
    return {
        "evidence_id": citation.evidence_id,
        "backend_start_time": citation.timestamp,
        "backend_end_time": citation.end_time,
        "source_event_ids": list(citation.source_event_ids),
        "source_segment_ids": list(citation.source_segment_ids),
    }


async def _run_sample(
    sample: dict[str, Any],
    *,
    max_ask: int,
    max_context: int,
    stop_after: str,
    client: AsyncOpenAI,
    controller: SmokeCallController,
) -> dict[str, Any]:
    started = time.perf_counter()
    transcript_path = ROOT / sample["transcript_path"]
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        video_id = _seed_sample(session, sample, transcript)
        output_language = "en" if sample["language"] == "en" else "vi"
        semantic_provider = _SemanticProvider(
            OpenAISemanticEventProvider(client=client),
            controller,
        )
        link_provider = _QuestionAnswerProvider(
            OpenAIQuestionAnswerLinkProvider(client=client),
            controller,
        )
        grounding_provider = _GroundingProvider(
            OpenAILectureGroundingProvider(client=client),
            controller,
        )
        await controller.start_stage("event_extraction", pace=False)
        event_result = await process_lecture_events(
            session,
            video_id,
            semantic_provider,
            output_language=output_language,
        )
        controller.raise_if_rate_limit_exhausted()
        await controller.start_stage("question_answer_linking", pace=True)
        relation_result = await process_question_answer_links(
            session,
            video_id,
            link_provider,
        )
        controller.raise_if_rate_limit_exhausted()
        context_results: list[dict[str, Any]] = []
        for window_index, window in enumerate(
            sample.get("context_windows", [])[:max_context]
        ):
            context_case_id = window.get("id", f"context-{window_index + 1}")
            await controller.start_stage(
                f"context_recovery:{context_case_id}", pace=True
            )
            current_time = float(window["current_time"])
            window_seconds = int(window["window_seconds"])
            diagnostics = {
                "current_time": current_time,
                "window_seconds": window_seconds,
                "input_validation": _context_input_diagnostics(
                    session,
                    video_id,
                    current_time=current_time,
                    window_seconds=window_seconds,
                ),
            }
            context_response = await recover_lecture_context(
                session,
                video_id,
                grounding_provider,
                current_time=current_time,
                window_seconds=window_seconds,
                output_language=output_language,
                diagnostics=diagnostics,
            )
            context_results.append(
                {
                    "supported": context_response.supported,
                    "validated_item_count": len(context_response.items),
                    "all_items_have_source": all(
                        bool(item.source_event_ids or item.source_segment_ids)
                        for item in context_response.items
                    ),
                    "all_timestamps_backend_mapped": all(
                        item.timestamp >= 0 for item in context_response.items
                    ),
                    "diagnostics": diagnostics,
                    "prediction": {
                        "case_id": context_case_id,
                        "scenario": window.get("scenario"),
                        "window": {
                            "current_time": current_time,
                            "window_seconds": window_seconds,
                            "start_time": max(0.0, current_time - window_seconds),
                            "end_time": current_time,
                        },
                        "supported": context_response.supported,
                        "summary": context_response.summary,
                        "items": [
                            _context_item_prediction(item)
                            for item in context_response.items
                        ],
                    },
                }
            )
        ask_results: list[dict[str, Any]] = []
        if stop_after == "full":
            for query_index, query in enumerate(sample.get("ask_queries", [])[:max_ask]):
                expected_supported = bool(query["expected_supported"])
                question_id = query.get("id", f"ask-{query_index + 1}")
                await controller.start_stage(
                    (
                        f"ask_supported:{question_id}"
                        if expected_supported
                        else f"ask_unsupported:{question_id}"
                    ),
                    pace=True,
                )
                ask_diagnostics = {"expected_supported": expected_supported}
                ask_response = await ask_lecture(
                    session,
                    video_id,
                    grounding_provider,
                    question=query["question"],
                    output_language=output_language,
                    diagnostics=ask_diagnostics,
                )
                ask_results.append(
                    {
                        "expected_supported": expected_supported,
                        "actual_supported": ask_response.supported,
                        "behavior_matches_expectation": (
                            ask_response.supported == expected_supported
                        ),
                        "citation_count": len(ask_response.citations),
                        "citations_mapped": all(
                            citation.timestamp >= 0
                            and bool(citation.source_segment_ids or citation.source_event_ids)
                            for citation in ask_response.citations
                        ),
                        "diagnostics": ask_diagnostics,
                        "prediction": {
                            "question_id": question_id,
                            "category": query.get("category"),
                            "question": query["question"],
                            "expected_case": (
                                "SUPPORTED" if expected_supported else "UNSUPPORTED"
                            ),
                            "supported": ask_response.supported,
                            "answer": ask_response.answer,
                            "used_evidence_ids": list(
                                ask_diagnostics.get("accepted_evidence_ids", [])
                            ),
                            "citations": [
                                _citation_prediction(citation)
                                for citation in ask_response.citations
                            ],
                            "abstention": not ask_response.supported,
                        },
                    }
                )
        events = list_lecture_events(session, video_id)
        events_by_id = {str(event.id): event for event in events}
        relations = list_event_relations(session, video_id)
        event_predictions = [_event_prediction(event) for event in events]
        relation_predictions = [
            _relation_prediction(relation, events_by_id) for relation in relations
        ]
    context_pass = bool(context_results) and all(
        item["supported"]
        and item["all_items_have_source"]
        and item["all_timestamps_backend_mapped"]
        for item in context_results
    )
    supported_asks = [item for item in ask_results if item["expected_supported"]]
    unsupported_asks = [item for item in ask_results if not item["expected_supported"]]
    supported_ask_pass = bool(supported_asks) and all(
        item["actual_supported"]
        and item["behavior_matches_expectation"]
        and item["citation_count"] > 0
        and item["citations_mapped"]
        for item in supported_asks
    )
    unsupported_abstention = bool(unsupported_asks) and all(
        not item["actual_supported"] and item["behavior_matches_expectation"]
        for item in unsupported_asks
    )
    structured_parse_pass = (
        event_result.failed_chunks == 0 and relation_result.failed_questions == 0
    )
    required_gates = [
        structured_parse_pass,
        event_result.events_created > 0,
        relation_result.relations_created > 0,
        context_pass,
    ]
    if stop_after == "full":
        required_gates.extend([supported_ask_pass, unsupported_abstention])
    sample_pass = all(required_gates)
    context_input_valid = all(
        all(item["diagnostics"]["input_validation"].values())
        for item in context_results
    )
    return {
        "status": "PASS" if sample_pass else "FAIL",
        "sample_id": sample["sample_id"],
        "language": sample["language"],
        "duration_seconds": sample["duration_seconds"],
        "provider": PROVIDER_NAME,
        "model": config.AI_MODEL,
        "event_count": event_result.events_created,
        "failed_chunks": event_result.failed_chunks,
        "relation_count": relation_result.relations_created,
        "failed_questions": relation_result.failed_questions,
        "structured_parse_status": "PASS" if structured_parse_pass else "FAIL",
        "context_status": "PASS" if context_pass else "FAIL",
        "supported_ask_status": (
            "PASS" if supported_ask_pass else "FAIL"
        ) if stop_after == "full" else "NOT_RUN",
        "unsupported_abstention": unsupported_abstention if stop_after == "full" else None,
        "citation_count": (
            sum(item["citation_count"] for item in supported_asks)
            if stop_after == "full"
            else None
        ),
        "source_id_validation": (
            "PASS" if structured_parse_pass and context_input_valid else "FAIL"
        ),
        "timestamps_backend_derived": all(
            item["all_timestamps_backend_mapped"] for item in context_results
        ) and (
            all(item["citations_mapped"] for item in supported_asks)
            if stop_after == "full"
            else True
        ),
        "stop_after": stop_after,
        "fixture_transcript_path": sample["transcript_path"],
        "prediction_status": "REAL_PROVIDER_COMPLETE",
        "predictions": {
            "events": event_predictions,
            "question_answer_links": relation_predictions,
            "context_recovery": [
                item["prediction"] for item in context_results
            ],
            "grounded_ask": [item["prediction"] for item in ask_results],
        },
        "context_debug": [item["diagnostics"] for item in context_results],
        "ask_debug": [item["diagnostics"] for item in ask_results],
        "provider_telemetry": controller.telemetry(),
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
    }


async def run(
    manifest: dict[str, Any],
    *,
    sample_id: str | None = None,
    stop_after: str = "full",
    skip_model_discovery: bool = False,
) -> dict[str, Any]:
    if not config.GEMINI_API_KEY.strip():
        return _blocked_result(manifest)
    client = AsyncOpenAI(
        api_key=config.GEMINI_API_KEY,
        base_url=config.AI_BASE_URL,
        max_retries=0,
    )
    model_controller = SmokeCallController()
    model_check = (
        {
            "status": "SKIPPED_AFTER_VERIFIED_DISCOVERY",
            "configured_model": config.AI_MODEL,
            "configured_model_available": True,
            "available_model_count": None,
            "available_models": [],
        }
        if skip_model_discovery
        else await check_configured_model(client, model_controller)
    )
    if not skip_model_discovery and model_check["status"] != "PASS":
        return {
            "status": model_check["status"],
            "provider": PROVIDER_NAME,
            "provider_model": config.AI_MODEL,
            "credential_value_logged": False,
            "model_check": model_check,
            "sample_count_available": len(manifest.get("samples", [])),
            "sample_count_executed": 0,
            "model_discovery_telemetry": model_controller.telemetry(),
            "samples": [],
        }
    max_samples = _bounded(config.MAX_REAL_PROVIDER_SAMPLES, 3)
    max_ask = _bounded(config.MAX_ASK_QUERIES_PER_SAMPLE, 5)
    max_context = _bounded(config.MAX_CONTEXT_CALLS_PER_SAMPLE, 3)
    available_samples = list(manifest.get("samples", []))
    selected_samples = (
        [sample for sample in available_samples if sample.get("sample_id") == sample_id]
        if sample_id
        else available_samples[:max_samples]
    )
    if sample_id and not selected_samples:
        return {
            "status": "SAMPLE_NOT_FOUND",
            "provider": PROVIDER_NAME,
            "provider_model": config.AI_MODEL,
            "credential_value_logged": False,
            "model_check": model_check,
            "sample_count_available": len(available_samples),
            "sample_count_executed": 0,
            "samples": [],
        }
    results = []
    for sample in selected_samples:
        controller = SmokeCallController()
        try:
            results.append(
                await _run_sample(
                    sample,
                    max_ask=max_ask,
                    max_context=max_context,
                    stop_after=stop_after,
                    client=client,
                    controller=controller,
                )
            )
        except Exception as exc:
            telemetry = controller.telemetry()
            rate_limited = isinstance(exc, RateLimitError) or any(
                stat["rate_limit_count"] and stat["budget_exhausted"]
                for stat in telemetry["stages"].values()
            )
            results.append(
                {
                    "sample_id": sample.get("sample_id"),
                    "language": sample.get("language"),
                    "duration_seconds": sample.get("duration_seconds"),
                    "provider": PROVIDER_NAME,
                    "model": config.AI_MODEL,
                    "status": "FAILED",
                    "error_code": type(exc).__name__,
                    "failure_class": "RATE_LIMIT" if rate_limited else "PROVIDER_ERROR",
                    "failed_stage": controller.current_stage,
                    "event_count": None,
                    "failed_chunks": None,
                    "relation_count": None,
                    "context_status": "NOT_COMPLETED",
                    "supported_ask_status": "NOT_COMPLETED",
                    "unsupported_abstention": None,
                    "citation_count": None,
                    "stop_after": stop_after,
                    "context_debug": [],
                    "provider_telemetry": telemetry,
                    "latency_ms": None,
                }
            )
    passed = bool(results) and all(result.get("status") == "PASS" for result in results)
    return {
        "status": "PASS" if passed else "FAIL",
        "generated_at": datetime.now(UTC).isoformat(),
        "provider": PROVIDER_NAME,
        "provider_model": config.AI_MODEL,
        "credential_value_logged": False,
        "model_check": model_check,
        "model_discovery_telemetry": model_controller.telemetry(),
        "limits": {
            "max_real_provider_samples": max_samples,
            "max_ask_queries_per_sample": max_ask,
            "max_context_calls_per_sample": max_context,
            "max_provider_calls_per_stage": model_controller.max_calls_per_stage,
            "theoretical_max_sample_provider_calls": (
                2 + max_context + (max_ask if stop_after == "full" else 0)
            ) * model_controller.max_calls_per_stage,
            "theoretical_max_invocation_provider_calls": (
                3 + max_context + (max_ask if stop_after == "full" else 0)
            ) * model_controller.max_calls_per_stage,
        },
        "sample_count_available": len(available_samples),
        "sample_count_executed": len(results),
        "selected_sample_id": sample_id,
        "stop_after": stop_after,
        "samples": results,
    }


def _markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Real-provider smoke",
        "",
        f"Status: **{result['status']}**",
        "",
        f"- Provider: `{result.get('provider', PROVIDER_NAME)}`",
        f"- Model: `{result.get('provider_model', config.AI_MODEL)}`",
        f"- Credential value logged: `{result.get('credential_value_logged', False)}`",
        f"- Samples executed: `{result.get('sample_count_executed', 0)}`",
    ]
    if result.get("reason"):
        lines.append(f"- Reason: {result['reason']}")
    model_check = result.get("model_check")
    if isinstance(model_check, dict):
        lines.extend(
            [
                f"- Model check: `{model_check.get('status')}`",
                f"- Available model count: `{model_check.get('available_model_count', 0)}`",
            ]
        )
    samples = result.get("samples", [])
    if samples:
        lines.extend(
            [
                "",
                "| Sample | Language | Status | Events | Failed chunks | Relations | Context | Supported Ask | Unsupported abstention | Citations | Latency ms |",
                "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        for sample in samples:
            values = {
                key: sample.get(key, "NOT_RECORDED")
                for key in (
                    "sample_id",
                    "language",
                    "status",
                    "event_count",
                    "failed_chunks",
                    "relation_count",
                    "context_status",
                    "supported_ask_status",
                    "unsupported_abstention",
                    "citation_count",
                    "latency_ms",
                )
            }
            lines.append(
                "| {sample_id} | {language} | {status} | {event_count} | {failed_chunks} | "
                "{relation_count} | {context_status} | {supported_ask_status} | "
                "{unsupported_abstention} | {citation_count} | {latency_ms} |".format(**values)
            )
        failures = [sample for sample in samples if sample.get("status") != "PASS"]
        if failures:
            lines.extend(["", "## Failure metadata", ""])
            for sample in failures:
                telemetry = sample.get("provider_telemetry", {})
                stage = sample.get("failed_stage")
                stage_stats = telemetry.get("stages", {}).get(stage, {})
                lines.extend(
                    [
                        f"- Sample: `{sample.get('sample_id')}`",
                        f"- Failure class: `{sample.get('failure_class', sample.get('error_code', 'OTHER'))}`",
                        f"- Failed stage: `{stage or 'NOT_RECORDED'}`",
                        f"- Provider calls in failed stage: `{stage_stats.get('provider_call_count', 0)}`",
                        f"- Rate limits in failed stage: `{stage_stats.get('rate_limit_count', 0)}`",
                        f"- Retry waits (seconds): `{stage_stats.get('retry_wait_seconds', [])}`",
                    ]
                )
    lines.extend(
        [
            "",
            "This artifact records non-sensitive execution metadata only. It is not a substitute for human-reviewed quality metrics.",
            "",
        ]
    )
    return "\n".join(lines)


def _context_debug_artifact(result: dict[str, Any]) -> dict[str, Any]:
    samples = result.get("samples", [])
    sample = samples[0] if samples else {}
    windows = sample.get("context_debug", [])
    failure_classes = [
        window.get("failure_class") for window in windows if window.get("failure_class")
    ]
    failure_class = (
        failure_classes[0]
        if failure_classes
        else sample.get("failure_class")
        or ("NONE" if sample.get("context_status") == "PASS" else "OTHER")
    )
    stages = sample.get("provider_telemetry", {}).get("stages", {})
    failed_stage = sample.get("failed_stage")
    rate_limit_stage_name = (
        failed_stage
        if sample.get("failure_class") == "RATE_LIMIT" and failed_stage in stages
        else "context_recovery"
    )
    rate_limit_stage = stages.get(rate_limit_stage_name, {})
    return {
        "sample_id": sample.get("sample_id") or result.get("selected_sample_id"),
        "context_status": sample.get("context_status", "NOT_COMPLETED"),
        "failure_class": failure_class,
        "failed_stage": failed_stage,
        "windows": windows,
        "rate_limit_metadata": {
            "stage": rate_limit_stage_name,
            "provider_call_count": rate_limit_stage.get("provider_call_count", 0),
            "rate_limit_count": rate_limit_stage.get("rate_limit_count", 0),
            "retry_wait_seconds": rate_limit_stage.get("retry_wait_seconds", []),
            "budget_exhausted": rate_limit_stage.get("budget_exhausted", False),
        },
        "sensitive_content_logged": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a bounded, manual real-provider LectureBridge smoke test.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--sample",
        required=True,
        help="Run exactly one manifest sample by sample_id.",
    )
    parser.add_argument(
        "--stop-after",
        choices=("context", "full"),
        default="full",
    )
    parser.add_argument("--context-debug-output", type=Path)
    parser.add_argument(
        "--skip-model-discovery-after-verification",
        action="store_true",
        help="Skip discovery only after a separate discovery check passed in this run sequence.",
    )
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    result = asyncio.run(
        run(
            manifest,
            sample_id=args.sample,
            stop_after=args.stop_after,
            skip_model_discovery=args.skip_model_discovery_after_verification,
        )
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.output.with_suffix(".md").write_text(_markdown(result), encoding="utf-8")
    context_debug_output = args.context_debug_output
    if args.stop_after == "context" and context_debug_output is None:
        context_debug_output = DEFAULT_CONTEXT_DEBUG_OUTPUT
    if context_debug_output is not None:
        context_debug_output.parent.mkdir(parents=True, exist_ok=True)
        context_debug_output.write_text(
            json.dumps(_context_debug_artifact(result), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"REAL_PROVIDER_SMOKE={result['status']}")
    print(f"sample_count_executed={result['sample_count_executed']}")
    return 0 if result["status"] in {"PASS", "BLOCKED_BY_CONFIGURATION"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
