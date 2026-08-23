from __future__ import annotations

import csv
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
EVALUATION = ROOT / "evaluation"
RUN_ROOT = EVALUATION / "results" / "provider-runs-flash-lite"
REVIEW_ROOT = EVALUATION / "review_pack"
RESULTS_ROOT = EVALUATION / "results"
MODEL = "gemini-3.5-flash-lite"
PROVIDER = "gemini-openai-compatible"
SAMPLE_ORDER = (
    "synthetic-vi-regularization",
    "synthetic-en-transactions",
    "synthetic-codeswitch-accessibility",
)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _json_cell(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def _transcript(sample: dict[str, Any]) -> tuple[dict[int, dict[str, Any]], dict[str, Any]]:
    document = _load_json(ROOT / sample["transcript_path"])
    return {int(item["index"]): item for item in document["segments"]}, document


def _excerpt(segment_ids: list[int], segments: dict[int, dict[str, Any]]) -> str:
    return " ".join(
        str(segments[segment_id].get("text") or "").strip()
        for segment_id in segment_ids
        if segment_id in segments
    ).strip()


def _draft_references(
    sample_id: str,
    event: dict[str, Any],
    draft_events: dict[str, list[dict[str, Any]]],
) -> list[str]:
    predicted_sources = set(event.get("source_segment_ids", []))
    return [
        item["id"]
        for item in draft_events.get(sample_id, [])
        if predicted_sources.intersection(item.get("source_segment_ids", []))
    ]


def _sample_language(manifest_sample: dict[str, Any]) -> str:
    return str(manifest_sample["language"])


def _technical_errors(
    sample: dict[str, Any],
    manifest_sample: dict[str, Any],
    segments: dict[int, dict[str, Any]],
) -> list[str]:
    errors: list[str] = []
    sample_id = sample["sample_id"]
    predictions = sample.get("predictions") or {}
    events = predictions.get("events") or []
    relations = predictions.get("question_answer_links") or []
    contexts = predictions.get("context_recovery") or []
    asks = predictions.get("grounded_ask") or []
    events_by_id = {item["prediction_id"]: item for item in events}
    relations_by_id = {item["prediction_id"]: item for item in relations}

    if sample.get("model") != MODEL:
        errors.append(f"{sample_id}:wrong_model")
    if sample.get("failed_chunks") != 0:
        errors.append(f"{sample_id}:failed_chunks")
    if sample.get("structured_parse_status") != "PASS":
        errors.append(f"{sample_id}:structured_parse")
    if sample.get("source_id_validation") != "PASS":
        errors.append(f"{sample_id}:source_validation")
    if sample.get("timestamps_backend_derived") is not True:
        errors.append(f"{sample_id}:timestamps_not_backend_derived")
    if sample.get("provider_telemetry", {}).get("total_rate_limit_count") != 0:
        errors.append(f"{sample_id}:rate_limit")
    if not events:
        errors.append(f"{sample_id}:missing_events")
    if len(contexts) != len(manifest_sample.get("context_windows", [])):
        errors.append(f"{sample_id}:incomplete_context_population")
    if len(asks) != len(manifest_sample.get("ask_queries", [])):
        errors.append(f"{sample_id}:incomplete_ask_population")

    for event in events:
        event_id = event["prediction_id"]
        source_ids = event.get("source_segment_ids") or []
        if not source_ids or any(segment_id not in segments for segment_id in source_ids):
            errors.append(f"{sample_id}:event_unknown_segment:{event_id}")
            continue
        expected_start = min(float(segments[item]["start"]) for item in source_ids)
        expected_end = max(float(segments[item]["end"]) for item in source_ids)
        if float(event["backend_start_time"]) != expected_start:
            errors.append(f"{sample_id}:event_start_mismatch:{event_id}")
        if float(event["backend_end_time"]) != expected_end:
            errors.append(f"{sample_id}:event_end_mismatch:{event_id}")

    evidence: dict[str, dict[str, Any]] = {}
    for segment_id, segment in segments.items():
        evidence[f"segment:{segment_id}"] = {
            "start": float(segment["start"]),
            "end": float(segment["end"]),
            "source_event_ids": [],
            "source_segment_ids": [segment_id],
        }
    for event_id, event in events_by_id.items():
        evidence[f"event:{event_id}"] = {
            "start": float(event["backend_start_time"]),
            "end": float(event["backend_end_time"]),
            "source_event_ids": [event_id],
            "source_segment_ids": list(event["source_segment_ids"]),
        }
    for relation_id, relation in relations_by_id.items():
        question = events_by_id.get(relation["question_event_id"])
        answer = events_by_id.get(relation["answer_event_id"])
        if question is None or answer is None:
            errors.append(f"{sample_id}:relation_unknown_event:{relation_id}")
            continue
        evidence[f"relation:{relation_id}"] = {
            "start": float(question["backend_start_time"]),
            "end": float(answer["backend_end_time"]),
            "source_event_ids": [question["prediction_id"], answer["prediction_id"]],
            "source_segment_ids": sorted(
                set(question["source_segment_ids"] + answer["source_segment_ids"])
            ),
        }

    for context in contexts:
        for index, item in enumerate(context.get("items", [])):
            event_ids = item.get("source_event_ids") or []
            segment_ids = item.get("source_segment_ids") or []
            if any(event_id not in events_by_id for event_id in event_ids):
                errors.append(f"{sample_id}:context_unknown_event:{context['case_id']}:{index}")
            if any(segment_id not in segments for segment_id in segment_ids):
                errors.append(f"{sample_id}:context_unknown_segment:{context['case_id']}:{index}")
            canonical = {
                *[f"event:{event_id}" for event_id in event_ids],
                *[f"segment:{segment_id}" for segment_id in segment_ids],
            }
            if set(item.get("canonical_evidence_ids") or []) != canonical:
                errors.append(f"{sample_id}:context_noncanonical_ids:{context['case_id']}:{index}")
            starts = [events_by_id[item_id]["backend_start_time"] for item_id in event_ids]
            starts.extend(segments[item_id]["start"] for item_id in segment_ids)
            if not starts or float(item["backend_start_time"]) != min(map(float, starts)):
                errors.append(f"{sample_id}:context_timestamp_mismatch:{context['case_id']}:{index}")

    for ask in asks:
        question_id = ask["question_id"]
        used_ids = ask.get("used_evidence_ids") or []
        citation_ids = [item["evidence_id"] for item in ask.get("citations", [])]
        if any(item not in evidence for item in [*used_ids, *citation_ids]):
            errors.append(f"{sample_id}:ask_unknown_evidence:{question_id}")
        if used_ids != citation_ids:
            errors.append(f"{sample_id}:ask_used_citation_mismatch:{question_id}")
        for citation in ask.get("citations", []):
            mapped = evidence.get(citation["evidence_id"])
            if mapped is None:
                continue
            if float(citation["backend_start_time"]) != mapped["start"]:
                errors.append(f"{sample_id}:citation_start_mismatch:{question_id}")
            if float(citation["backend_end_time"]) != mapped["end"]:
                errors.append(f"{sample_id}:citation_end_mismatch:{question_id}")
            if citation.get("source_event_ids") != mapped["source_event_ids"]:
                errors.append(f"{sample_id}:citation_event_mapping:{question_id}")
            if citation.get("source_segment_ids") != mapped["source_segment_ids"]:
                errors.append(f"{sample_id}:citation_segment_mapping:{question_id}")
    return errors


def build() -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    manifest = _load_json(EVALUATION / "data" / "human-review-manifest.json")
    manifest_by_id = {item["sample_id"]: item for item in manifest["samples"]}
    draft = _load_json(EVALUATION / "data" / "gold" / "event-gold-draft.json")
    draft_events = {item["video_id"]: item["events"] for item in draft["videos"]}
    records: list[dict[str, Any]] = []
    technical_errors: list[str] = []

    for sample_id in SAMPLE_ORDER:
        run_path = RUN_ROOT / f"{sample_id}.json"
        run = _load_json(run_path)
        sample = run["samples"][0]
        manifest_sample = manifest_by_id[sample_id]
        segments, transcript_document = _transcript(manifest_sample)
        errors = _technical_errors(sample, manifest_sample, segments)
        technical_errors.extend(errors)
        mismatches = []
        for ask in sample["predictions"]["grounded_ask"]:
            expected_supported = ask["expected_case"] == "SUPPORTED"
            if ask["supported"] != expected_supported:
                mismatches.append(
                    {
                        "capability": "GROUNDED_ASK",
                        "question_id": ask["question_id"],
                        "expected_case_type": ask["expected_case"],
                        "model_supported": ask["supported"],
                        "model_abstained": ask["abstention"],
                        "quality_status": "PENDING_HUMAN_REVIEW",
                    }
                )
        records.append(
            {
                "sample_id": sample_id,
                "language": _sample_language(manifest_sample),
                "provider": PROVIDER,
                "model": MODEL,
                "fixture": {
                    "transcript_path": manifest_sample["transcript_path"],
                    "fixture_notice": transcript_document.get("fixture_notice"),
                    "provenance": transcript_document.get("provenance") or manifest["provenance"],
                },
                "source_run_artifact": run_path.relative_to(ROOT).as_posix(),
                "source_run_generated_at": run.get("generated_at"),
                "source_run_automated_status": sample.get("status"),
                "prediction_status": "COMPLETE" if not errors else "TECHNICALLY_INVALID",
                "engineering_status": "PASS" if not errors else "FAIL",
                "model_quality_status": "PENDING_HUMAN_REVIEW",
                "known_automated_expectation_mismatches": mismatches,
                "technical_validation_errors": errors,
                "provider_telemetry": sample.get("provider_telemetry"),
                "predictions": sample["predictions"],
            }
        )

    export = {
        "schema_version": 1,
        "provider": PROVIDER,
        "model": MODEL,
        "generated_at": datetime.now(UTC).isoformat(),
        "fixture_provenance": manifest["provenance"],
        "evaluation_policy": {
            "engineering_validation": "Technical eligibility only; semantic mistakes remain reviewable predictions.",
            "model_quality": "Pending completion by the single human reviewer over all required rows.",
            "author_draft_status": "AUTHOR_DRAFT_REQUIRES_HUMAN_REVIEW",
        },
        "sample_ids": list(SAMPLE_ORDER),
        "languages": [record["language"] for record in records],
        "metrics": {
            "events": None,
            "question_answer_links": None,
            "context_recovery": None,
            "grounded_ask": None,
        },
        "samples": records,
    }

    event_rows: list[dict[str, Any]] = []
    qa_rows: list[dict[str, Any]] = []
    context_rows: list[dict[str, Any]] = []
    ask_rows: list[dict[str, Any]] = []
    units: list[dict[str, str]] = []

    for record in records:
        sample_id = record["sample_id"]
        language = record["language"]
        manifest_sample = manifest_by_id[sample_id]
        segments, _ = _transcript(manifest_sample)
        predictions = record["predictions"]
        events = predictions["events"]
        events_by_id = {item["prediction_id"]: item for item in events}
        relations_by_question: dict[str, list[dict[str, Any]]] = {}
        for relation in predictions["question_answer_links"]:
            relations_by_question.setdefault(relation["question_event_id"], []).append(relation)

        for event in events:
            row_id = f"event:{sample_id}:{event['prediction_id']}"
            row = {
                "row_id": row_id,
                "sample_id": sample_id,
                "language": language,
                "provider": PROVIDER,
                "model": MODEL,
                "prediction_status": record["prediction_status"],
                "engineering_status": record["engineering_status"],
                "prediction_id": event["prediction_id"],
                "event_type": event["event_type"],
                "explicit_or_inferred": event["explicit_or_inferred"],
                "source_segment_ids": _json_cell(event["source_segment_ids"]),
                "backend_start_time": event["backend_start_time"],
                "backend_end_time": event["backend_end_time"],
                "title": event["title"],
                "description": event["description"],
                "confidence": event["confidence"],
                "source_excerpt": _excerpt(event["source_segment_ids"], segments),
                "author_draft_status": "AUTHOR_DRAFT_REQUIRES_HUMAN_REVIEW",
                "author_draft_reference_ids": _json_cell(
                    _draft_references(sample_id, event, draft_events)
                ),
                "reviewer_a_judgment": "",
                "reviewer_a_corrected_type": "",
                "reviewer_a_timestamp_judgment": "",
                "reviewer_a_notes": "",
                "reviewer_b_selected": "",
                "reviewer_b_judgment": "",
                "reviewer_b_corrected_type": "",
                "reviewer_b_timestamp_judgment": "",
                "reviewer_b_notes": "",
                "adjudicated_result": "",
                "human_verification_status": "",
            }
            event_rows.append(row)
            units.append({"row_id": row_id, "sample_id": sample_id, "language": language, "capability": "EVENT"})

        for question in [item for item in events if item["event_type"] == "QUESTION"]:
            linked = relations_by_question.get(question["prediction_id"], []) or [None]
            for relation_index, relation in enumerate(linked, start=1):
                answer = events_by_id.get(relation["answer_event_id"]) if relation else None
                relation_key = relation["prediction_id"] if relation else f"no-link-{relation_index}"
                row_id = f"qa:{sample_id}:{question['prediction_id']}:{relation_key}"
                question_refs = _draft_references(sample_id, question, draft_events)
                answer_refs = _draft_references(sample_id, answer, draft_events) if answer else []
                source_ids = sorted(
                    set(question["source_segment_ids"] + (answer["source_segment_ids"] if answer else []))
                )
                qa_rows.append(
                    {
                        "row_id": row_id,
                        "sample_id": sample_id,
                        "language": language,
                        "provider": PROVIDER,
                        "model": MODEL,
                        "prediction_status": record["prediction_status"],
                        "engineering_status": record["engineering_status"],
                        "relation_prediction_id": relation["prediction_id"] if relation else "",
                        "relation_prediction_status": "LINK_PREDICTED" if relation else "NO_LINK_PREDICTED",
                        "question_event_id": question["prediction_id"],
                        "question_event": question["title"],
                        "question_timestamp": question["backend_start_time"],
                        "predicted_answer_event_id": answer["prediction_id"] if answer else "",
                        "predicted_answer_event": answer["title"] if answer else "",
                        "answer_timestamp": answer["backend_start_time"] if answer else "",
                        "source_segment_ids": _json_cell(source_ids),
                        "source_evidence": _excerpt(source_ids, segments),
                        "author_draft_status": "AUTHOR_DRAFT_REQUIRES_HUMAN_REVIEW",
                        "author_draft_question_reference_ids": _json_cell(question_refs),
                        "author_draft_answer_reference_ids": _json_cell(answer_refs),
                        "reviewer_a_link_correct": "",
                        "reviewer_a_correct_answer_event_id": "",
                        "reviewer_a_should_have_no_answer": "",
                        "reviewer_a_notes": "",
                        "reviewer_b_selected": "",
                        "reviewer_b_link_correct": "",
                        "reviewer_b_correct_answer_event_id": "",
                        "reviewer_b_should_have_no_answer": "",
                        "reviewer_b_notes": "",
                        "adjudicated_result": "",
                        "human_verification_status": "",
                    }
                )
                units.append({"row_id": row_id, "sample_id": sample_id, "language": language, "capability": "QA"})

        for context in predictions["context_recovery"]:
            row_id = f"context:{sample_id}:{context['case_id']}"
            evidence_ids = sorted(
                {
                    evidence_id
                    for item in context["items"]
                    for evidence_id in item["canonical_evidence_ids"]
                }
            )
            timestamps = [
                {
                    "start": item["backend_start_time"],
                    "end": item["backend_end_time"],
                }
                for item in context["items"]
            ]
            context_rows.append(
                {
                    "row_id": row_id,
                    "case_id": context["case_id"],
                    "sample_id": sample_id,
                    "language": language,
                    "provider": PROVIDER,
                    "model": MODEL,
                    "prediction_status": record["prediction_status"],
                    "engineering_status": record["engineering_status"],
                    "scenario": context["scenario"],
                    "window_start": context["window"]["start_time"],
                    "window_end": context["window"]["end_time"],
                    "window_seconds": context["window"]["window_seconds"],
                    "model_supported": context["supported"],
                    "model_summary": context["summary"],
                    "model_context_items": _json_cell(context["items"]),
                    "canonical_evidence_ids": _json_cell(evidence_ids),
                    "backend_timestamps": _json_cell(timestamps),
                    "reviewer_a_claim_grounded_json": "",
                    "reviewer_a_claim_supported_by_citation_json": "",
                    "reviewer_a_completeness": "",
                    "reviewer_a_usefulness": "",
                    "reviewer_a_unsupported_claim_present": "",
                    "reviewer_a_notes": "",
                    "reviewer_b_selected": "",
                    "reviewer_b_claim_grounded_json": "",
                    "reviewer_b_claim_supported_by_citation_json": "",
                    "reviewer_b_completeness": "",
                    "reviewer_b_usefulness": "",
                    "reviewer_b_unsupported_claim_present": "",
                    "reviewer_b_notes": "",
                    "adjudicated_result": "",
                    "human_verification_status": "",
                }
            )
            units.append({"row_id": row_id, "sample_id": sample_id, "language": language, "capability": "CONTEXT"})

        for ask in predictions["grounded_ask"]:
            row_id = f"ask:{sample_id}:{ask['question_id']}"
            ask_rows.append(
                {
                    "row_id": row_id,
                    "sample_id": sample_id,
                    "language": language,
                    "provider": PROVIDER,
                    "model": MODEL,
                    "prediction_status": record["prediction_status"],
                    "engineering_status": record["engineering_status"],
                    "question_id": ask["question_id"],
                    "question": ask["question"],
                    "expected_case_type": ask["expected_case"],
                    "category": ask["category"],
                    "model_supported": ask["supported"],
                    "model_answer": ask["answer"],
                    "used_evidence_ids": _json_cell(ask["used_evidence_ids"]),
                    "citations": _json_cell(ask["citations"]),
                    "citation_count": len(ask["citations"]),
                    "model_abstained": ask["abstention"],
                    "automated_expectation_match": ask["supported"] == (ask["expected_case"] == "SUPPORTED"),
                    "reviewer_a_answer_correct": "",
                    "reviewer_a_answer_supported": "",
                    "reviewer_a_citation_correct": "",
                    "reviewer_a_unsupported_claim_present": "",
                    "reviewer_a_abstention_correct": "",
                    "reviewer_a_notes": "",
                    "reviewer_b_selected": "",
                    "reviewer_b_answer_correct": "",
                    "reviewer_b_answer_supported": "",
                    "reviewer_b_citation_correct": "",
                    "reviewer_b_unsupported_claim_present": "",
                    "reviewer_b_abstention_correct": "",
                    "reviewer_b_notes": "",
                    "adjudicated_result": "",
                    "human_verification_status": "",
                }
            )
            units.append({"row_id": row_id, "sample_id": sample_id, "language": language, "capability": "ASK"})

    for rows in (event_rows, qa_rows, context_rows, ask_rows):
        for row in rows:
            row["reviewer_b_selected"] = "UNUSED_SINGLE_REVIEWER"
            row["adjudicated_result"] = "UNUSED_SINGLE_REVIEWER"

    packs = {
        "event-predictions-review.csv": event_rows,
        "qa-links-review.csv": qa_rows,
        "context-recovery-review.csv": context_rows,
        "ask-review.csv": ask_rows,
    }
    return export, technical_errors, {"packs": packs}


def _validate_outputs(
    export: dict[str, Any],
    technical_errors: list[str],
    packs: dict[str, list[dict[str, Any]]],
) -> list[str]:
    errors = list(technical_errors)
    if export["model"] != MODEL or any(item["model"] != MODEL for item in export["samples"]):
        errors.append("mixed_or_wrong_model")
    if {item["sample_id"] for item in export["samples"]} != set(SAMPLE_ORDER):
        errors.append("missing_sample")
    if any(item["prediction_status"] != "COMPLETE" for item in export["samples"]):
        errors.append("incomplete_prediction")
    if any(item["engineering_status"] != "PASS" for item in export["samples"]):
        errors.append("engineering_failure")

    code_switch = next(
        item for item in export["samples"] if item["sample_id"] == "synthetic-codeswitch-accessibility"
    )
    cs_paraphrase = next(
        item
        for item in code_switch["predictions"]["grounded_ask"]
        if item["question_id"] == "cs-paraphrase"
    )
    if not (
        cs_paraphrase["expected_case"] == "SUPPORTED"
        and cs_paraphrase["supported"] is False
        and cs_paraphrase["abstention"] is True
        and cs_paraphrase["citations"] == []
    ):
        errors.append("cs_paraphrase_not_preserved")

    expected_counts = {
        "event-predictions-review.csv": sum(
            len(item["predictions"]["events"]) for item in export["samples"]
        ),
        "qa-links-review.csv": sum(
            sum(1 for event in item["predictions"]["events"] if event["event_type"] == "QUESTION")
            for item in export["samples"]
        ),
        "context-recovery-review.csv": 9,
        "ask-review.csv": 15,
    }
    for name, expected in expected_counts.items():
        if len(packs[name]) != expected:
            errors.append(f"wrong_review_row_count:{name}")
    for name, rows in packs.items():
        for line, row in enumerate(rows, start=2):
            for field, value in row.items():
                if field.startswith("reviewer_a_") and str(value or "").strip():
                    errors.append(f"reviewer_field_prefilled:{name}:{line}:{field}")
                if field.startswith("reviewer_b_"):
                    expected = "UNUSED_SINGLE_REVIEWER" if field == "reviewer_b_selected" else ""
                    if str(value or "") != expected:
                        errors.append(f"reviewer_b_not_inactive:{name}:{line}:{field}")
                if field == "adjudicated_result" and value != "UNUSED_SINGLE_REVIEWER":
                    errors.append(f"adjudication_not_inactive:{name}:{line}")
                if field == "human_verification_status" and str(value or "").strip():
                    errors.append(f"human_status_prefilled:{name}:{line}")

    serialized = json.dumps(
        {"export": export, "packs": packs},
        ensure_ascii=False,
    )
    forbidden = {
        "credential_pattern": r"AIza[0-9A-Za-z_-]{20,}",
        "raw_prompt": r'"raw_prompt"',
        "chain_of_thought": r'"chain_of_thought"|"chain-of-thought"',
    }
    for name, pattern in forbidden.items():
        if re.search(pattern, serialized, flags=re.IGNORECASE):
            errors.append(f"forbidden_content:{name}")
    return errors


def _guide() -> str:
    return """# LectureBridge Human Review Guide

Status: **PENDING_HUMAN_REVIEW**

## Evaluation design

One human reviewer reviews 100% of the 47-row evaluation set: 20 Event, 3 Q↔A, 9 Context Recovery, and 15 Grounded Ask rows.

Review every model output directly against the synthetic source evidence. Automated smoke expectations and author drafts are references, not verified gold and not instructions to mark a row correct.

Do not use any of the following as proof of correctness:

- smoke PASS/FAIL status;
- model confidence;
- fixture expectation alone;
- retrieval score alone.

## Event review

- **Correct event:** the event is materially present in its cited source segments and its title/description preserve the lecture meaning.
- **Type correctness:** select the event type that best matches the evidence. Use `CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `MISSING`, or `DUPLICATE` for the overall judgment.
- **Timestamp correctness:** start/end must cover the cited canonical segments. Allow only boundary differences caused by those segment boundaries; do not grant tolerance for unrelated content.
- **Duplicate:** two predictions express substantially the same event over the same evidence without adding a distinct reviewable event.
- **Missing:** record a source-supported author-reference event that has no adequate prediction. Author draft remains provisional until reviewed.

## Q↔A review

- A link is correct only when the predicted answer responds to the predicted question and both are supported by their cited lecture evidence.
- Mark `should_have_no_answer` when no candidate answer in the lecture actually answers the question.
- Do not infer correctness merely because an author-draft pair exists.

## Context Recovery review

- **Grounded:** each claim is entailed or directly supported by its cited events/segments.
- **Citation support:** cited evidence specifically supports the associated claim, not merely the general topic.
- **Completeness:** `0` misses essential context, `1` covers part of it, `2` covers the important context for the window.
- **Usefulness:** `0` unusable/misleading, `1` partly useful, `2` clear and useful for resuming the lecture.
- Flag any unsupported claim even if the rest of the response is useful.

## Grounded Ask review

- Judge answer correctness and support separately. Retrieval success is not answer correctness.
- A citation is correct only if its mapped evidence and backend timestamp support the answer claim.
- Flag unsupported claims even when the overall answer is plausible.
- An abstention is correct only when the available lecture evidence is insufficient.
- For a supported question where the model abstains despite sufficient evidence, set `abstention_correct=false`.
- Do not automatically assume the fixture expectation is correct; decide from source evidence.

## Completion and metrics gate

- Reviewer A must complete all 47 required rows.
- Do not calculate aggregate metrics from partially reviewed rows.
- Do not change prompts, rerun, or tune the model based on review outcomes before the evaluation is reported.

## Limitation

This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.
"""


def _reviewer_instructions() -> str:
    return f"""# Human reviewer instructions

Status: **PENDING_HUMAN_REVIEW**

The packs contain real-provider predictions from `{MODEL}` over project-authored synthetic lectures. Predictions include semantic mistakes and abstentions; technical eligibility does not imply model quality.

## Single-reviewer design

- Reviewer A is the only human reviewer and reviews every row in all four prediction packs.
- Required completion is 20/20 Event, 3/3 Q↔A, 9/9 Context Recovery, and 15/15 Grounded Ask rows.
- Use only source excerpts, canonical evidence IDs, and backend timestamps.
- Keep author drafts and automated expectations as unverified references.
- Do not use smoke status, model confidence, fixture expectation alone, or retrieval score alone as proof of correctness.
- Compatibility-only Reviewer B and adjudication columns are marked `UNUSED_SINGLE_REVIEWER` and are excluded from validation and metrics.
- Aggregate metrics remain unavailable until all 47 Reviewer A rows are complete and structurally valid.

## Limitation

This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.
"""


def _report(export: dict[str, Any], packs: dict[str, list[dict[str, Any]]], subset: dict[str, Any], errors: list[str]) -> str:
    by_id = {item["sample_id"]: item for item in export["samples"]}
    mismatch_count = sum(len(item["known_automated_expectation_mismatches"]) for item in export["samples"])
    ready = not errors
    lines = [
        "# Human Review Preparation Report",
        "",
        "## A. Evaluation Policy",
        "",
        "Engineering validity is separated from model quality. Technically complete predictions remain reviewable even when an automated semantic expectation fails. Author drafts and smoke expectations are not human-verified gold.",
        "",
        "## B. Final Model",
        "",
        f"All canonical predictions use `{MODEL}` through `{PROVIDER}`. No `gemini-3.5-flash` prediction payload is included.",
        "",
        "## C. Complete Prediction Population",
        "",
    ]
    for sample_id in SAMPLE_ORDER:
        item = by_id[sample_id]
        predictions = item["predictions"]
        lines.append(
            f"- `{sample_id}`: prediction `{item['prediction_status']}`, engineering `{item['engineering_status']}`; "
            f"{len(predictions['events'])} events, {len(predictions['question_answer_links'])} Q↔A links, "
            f"{len(predictions['context_recovery'])} Context windows, {len(predictions['grounded_ask'])} Ask cases."
        )
    lines.extend(
        [
            "",
            "## D. Known Model Quality Failures",
            "",
            f"{mismatch_count} automated expectation mismatch is retained for human review. `cs-paraphrase` remains a supported-task case with `model_supported=false`, `model_abstained=true`, and zero citations. It is not treated as a technical failure and is not relabeled.",
            "",
            "## E. Event Review Pack",
            "",
            f"`event-predictions-review.csv` contains {len(packs['event-predictions-review.csv'])} real-provider event rows with source excerpts and author-draft references; judgments are blank.",
            "",
            "## F. Q&A Review Pack",
            "",
            f"`qa-links-review.csv` contains {len(packs['qa-links-review.csv'])} predicted question-link rows; judgments are blank.",
            "",
            "## G. Context Review Pack",
            "",
            f"`context-recovery-review.csv` contains {len(packs['context-recovery-review.csv'])} windows with full model items, canonical evidence IDs, and backend timestamps; judgments are blank.",
            "",
            "## H. Grounded Ask Review Pack",
            "",
            f"`ask-review.csv` contains {len(packs['ask-review.csv'])} supported/unsupported cases. Failed answers and abstentions are retained, including `cs-paraphrase`; judgments are blank.",
            "",
            "## I. Reviewer B Sampling",
            "",
            f"Deterministic seed `{subset['seed']}` selected {subset['selected_count']} of {subset['population_size']} rows ({subset['selected_rate']:.2%}). The subset covers VI, EN, code-switch, Event, Q↔A, Context, Grounded Ask, and includes `cs-paraphrase`.",
            "",
            "## J. Human Review Guide",
            "",
            "`evaluation/guidelines/human-review-guide.md` defines source-first operational criteria and explicitly prevents automated expectations from becoming reviewer judgments.",
            "",
            "## K. Validation",
            "",
            f"Structural validation: `{'PASS' if ready else 'FAIL'}`. Error count: {len(errors)}.",
        ]
    )
    for error in errors:
        lines.append(f"- `{error}`")
    lines.extend(
        [
            "- All aggregate quality metrics remain `null`.",
            "- No reviewer or adjudication judgment is prefilled.",
            "- Credential, raw-prompt, and chain-of-thought patterns are absent from generated artifacts.",
            "",
            "## L. Manual Next Step",
            "",
            "Reviewer A reviews 100% of rows. Reviewer B independently reviews the deterministic subset, after which disagreements are adjudicated. Only then may verified metrics be calculated.",
            "",
            f"HUMAN_REVIEW_PACK_READY: {'YES' if ready else 'NO'}",
        ]
    )
    return "\n".join(lines) + "\n"


def _single_reviewer_report(
    export: dict[str, Any],
    packs: dict[str, list[dict[str, Any]]],
    errors: list[str],
) -> str:
    ready = not errors
    lines = [
        "# Human Review Preparation Report",
        "",
        "## A. Evaluation Design",
        "",
        "This evaluation uses one human reviewer. Reviewer A reviews 100% of the 47-row evaluation population. Reviewer B, secondary-subset review, inter-rater agreement, and disagreement adjudication are not part of the active workflow.",
        "",
        "## B. Final Model",
        "",
        f"All canonical predictions use `{MODEL}` through `{PROVIDER}`. No `gemini-3.5-flash` prediction payload is included.",
        "",
        "## C. Review Population",
        "",
        "The active population is 20 Event rows, 3 Q↔A rows, 9 Context Recovery rows, and 15 Grounded Ask rows: 47/47 rows total. Canonical predictions are preserved unchanged.",
        "",
        "## D. Event Review",
        "",
        f"`event-predictions-review.csv` contains {len(packs['event-predictions-review.csv'])}/20 rows. Reviewer A judgment fields are blank.",
        "",
        "## E. Q↔A Review",
        "",
        f"`qa-links-review.csv` contains {len(packs['qa-links-review.csv'])}/3 rows. Reviewer A judgment fields are blank.",
        "",
        "## F. Context Review",
        "",
        f"`context-recovery-review.csv` contains {len(packs['context-recovery-review.csv'])}/9 rows. Reviewer A judgment fields are blank.",
        "",
        "## G. Grounded Ask Review",
        "",
        f"`ask-review.csv` contains {len(packs['ask-review.csv'])}/15 rows. `cs-paraphrase` remains supported-task, `model_supported=false`, `model_abstained=true`, and citation count 0. Reviewer A decides correctness from evidence.",
        "",
        "## H. Reviewer Instructions",
        "",
        "Reviewer A reviews every row directly from source evidence. Smoke status, model confidence, fixture expectation alone, and retrieval score alone are not proof of correctness. Compatibility-only Reviewer B/adjudication columns are marked `UNUSED_SINGLE_REVIEWER`.",
        "",
        "## I. Metric Gate",
        "",
        "All metrics remain `null` until Reviewer A completes 20/20 Event, 3/3 Q↔A, 9/9 Context Recovery, and 15/15 Grounded Ask rows. Partial review cannot produce final metrics.",
        "",
        "## J. Evaluation Limitations",
        "",
        "This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.",
        "",
        "## K. Validation",
        "",
        f"Structural validation: `{'PASS' if ready else 'FAIL'}`. Error count: {len(errors)}.",
    ]
    for error in errors:
        lines.append(f"- `{error}`")
    lines.extend(
        [
            "- Canonical predictions remain unchanged.",
            "- All 47 active review rows are present.",
            "- Reviewer A judgment fields are blank.",
            "- Reviewer B and adjudication are inactive and excluded from metrics.",
            "- All aggregate quality metrics remain `null`.",
            "- No provider call is performed by this workflow conversion.",
            "- Credential, raw-prompt, and chain-of-thought patterns are absent from generated workflow artifacts.",
            "",
            "## L. Manual Next Step",
            "",
            "Reviewer A completes all 47 rows.",
            "",
            f"SINGLE_REVIEWER_PACK_READY: {'YES' if ready else 'NO'}",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> int:
    candidate_export, technical_errors, generated = build()
    packs = generated["packs"]
    canonical_path = RESULTS_ROOT / "real-provider-predictions.json"
    if canonical_path.exists():
        export = _load_json(canonical_path)
        current_by_id = {item["sample_id"]: item for item in export["samples"]}
        candidate_by_id = {
            item["sample_id"]: item for item in candidate_export["samples"]
        }
        if export.get("model") != MODEL or export.get("provider") != PROVIDER:
            technical_errors.append("canonical_model_or_provider_changed")
        for sample_id in SAMPLE_ORDER:
            current = current_by_id.get(sample_id)
            candidate = candidate_by_id.get(sample_id)
            if current is None or candidate is None:
                technical_errors.append(f"canonical_missing_sample:{sample_id}")
            elif current.get("predictions") != candidate.get("predictions"):
                technical_errors.append(f"canonical_prediction_changed:{sample_id}")
    else:
        export = candidate_export

    errors = _validate_outputs(export, technical_errors, packs)

    if not canonical_path.exists():
        _write_json(canonical_path, export)
    for name, rows in packs.items():
        _write_csv(REVIEW_ROOT / name, list(rows[0].keys()), rows)
    (EVALUATION / "guidelines" / "human-review-guide.md").write_text(
        _guide(), encoding="utf-8"
    )
    (REVIEW_ROOT / "reviewer-instructions.md").write_text(
        _reviewer_instructions(), encoding="utf-8"
    )

    verified_metrics = {
        "schema_version": 1,
        "fixture_notice": "SYNTHETIC — NOT MODEL QUALITY EVIDENCE",
        "status": "BLOCKED_PENDING_HUMAN_REVIEW",
        "final_model": MODEL,
        "prediction_population_status": "TECHNICALLY_COMPLETE",
        "metrics": {
            "events": None,
            "question_answer_links": None,
            "context_recovery": None,
            "grounded_ask": None,
        },
        "review_status": "PENDING_HUMAN_REVIEW",
        "evaluation_design": "SINGLE_REVIEWER_100_PERCENT",
        "required_completion": {
            "events": 20,
            "question_answer_links": 3,
            "context_recovery": 9,
            "grounded_ask": 15,
            "total": 47,
        },
        "blockers": ["REVIEWER_A_PENDING_47_ROWS"],
        "reporting_note": "Null metrics are intentionally preserved until Reviewer A completes all 47 rows.",
    }
    _write_json(RESULTS_ROOT / "verified_metrics.json", verified_metrics)
    (RESULTS_ROOT / "verified_metrics.md").write_text(
        "# Verified metrics\n\n"
        "Status: **PENDING_HUMAN_REVIEW**\n\n"
        f"Final model: `{MODEL}`\n\n"
        "- Event metrics: `null`\n"
        "- Q↔A metrics: `null`\n"
        "- Context metrics: `null`\n"
        "- Grounded Ask metrics: `null`\n\n"
        "Reviewer A must complete all 47 rows before calculation.\n\n"
        "This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.\n",
        encoding="utf-8",
    )
    (RESULTS_ROOT / "human-review-preparation-report.md").write_text(
        _single_reviewer_report(export, packs, errors), encoding="utf-8"
    )

    review_population = sum(len(rows) for rows in packs.values())
    print(f"SINGLE_REVIEWER_PREPARATION={'PASS' if not errors else 'FAIL'}")
    print(f"error_count={len(errors)}")
    print(f"review_population={review_population}")
    for error in errors:
        print(error)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
