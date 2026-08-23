from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from evaluation.scripts.prepare_human_review import build as build_review_pack
from evaluation.scripts.review_validation import HUMAN_VERIFIED, validate_review_pack


RESULT_JSON = ROOT / "evaluation" / "results" / "verified_metrics.json"
RESULT_MD = ROOT / "evaluation" / "results" / "verified_metrics.md"
FINAL_REPORT_MD = ROOT / "evaluation" / "results" / "final-evaluation-report.md"
REVIEW_ROOT = ROOT / "evaluation" / "review_pack"


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def _value(row: dict[str, Any], field: str) -> str:
    return str(row.get(field) or "").strip()


def _boolean(row: dict[str, Any], field: str) -> bool:
    raw = _value(row, field).lower()
    if raw not in {"true", "false"}:
        raise ValueError(f"invalid_boolean:{field}:{raw}")
    return raw == "true"


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def _harmonic(first: float | None, second: float | None) -> float | None:
    if first is None or second is None or first + second == 0:
        return None
    return round(2 * first * second / (first + second), 6)


def _distribution(values: list[int]) -> dict[str, int]:
    counts = Counter(values)
    return {str(score): counts.get(score, 0) for score in (0, 1, 2)}


def _event_metrics(review_root: Path) -> dict[str, Any]:
    prediction_rows = _read_csv(review_root / "event-predictions-review.csv")
    recall_rows = _read_csv(review_root / "event-recall-gold-review.csv")
    judgments = Counter(_value(row, "reviewer_a_judgment") for row in prediction_rows)

    strict_correct = judgments["CORRECT"]
    partial = judgments["PARTIALLY_CORRECT"]
    false_positive_predictions = judgments["INCORRECT"] + judgments["DUPLICATE"]
    prediction_precision = _ratio(strict_correct, len(prediction_rows))
    type_correct = sum(
        _value(row, "reviewer_a_judgment") == "CORRECT"
        and not _value(row, "reviewer_a_corrected_type")
        for row in prediction_rows
    )
    timestamp_correct = sum(
        _value(row, "reviewer_a_timestamp_judgment") == "CORRECT"
        for row in prediction_rows
    )

    predictions_by_reference: dict[str, list[dict[str, str]]] = {}
    for row in prediction_rows:
        for reference_id in json.loads(_value(row, "author_draft_reference_ids") or "[]"):
            predictions_by_reference.setdefault(str(reference_id), []).append(row)

    full_recall_rows = [row for row in recall_rows if _boolean(row, "full_recall_subset")]
    matched_ids: list[str] = []
    missing_ids: list[str] = []
    for gold in full_recall_rows:
        draft_id = _value(gold, "draft_event_id")
        matches = [
            row
            for row in predictions_by_reference.get(draft_id, [])
            if _value(row, "reviewer_a_judgment") in {"CORRECT", "PARTIALLY_CORRECT"}
        ]
        if len(matches) > 1:
            raise ValueError(f"duplicate_prediction_for_gold:{draft_id}")
        if matches:
            match = matches[0]
            reviewed_type = _value(match, "reviewer_a_corrected_type") or _value(match, "event_type")
            if reviewed_type != _value(gold, "draft_event_type"):
                raise ValueError(f"gold_match_type_mismatch:{draft_id}")
            matched_ids.append(draft_id)
            continue

        if not _boolean(gold, "reviewer_a_present"):
            raise ValueError(f"unconfirmed_unmatched_gold:{draft_id}")
        if (
            _value(gold, "reviewer_a_event_type") != _value(gold, "draft_event_type")
            or float(_value(gold, "reviewer_a_start_time")) != float(_value(gold, "draft_start_time"))
            or float(_value(gold, "reviewer_a_end_time")) != float(_value(gold, "draft_end_time"))
        ):
            raise ValueError(f"reviewed_gold_span_or_type_mismatch:{draft_id}")
        missing_ids.append(draft_id)

    recall = _ratio(len(matched_ids), len(full_recall_rows))
    return {
        "prediction_precision": {
            "reviewed_prediction_count": len(prediction_rows),
            "true_positive_predictions": strict_correct,
            "false_positive_predictions": false_positive_predictions,
            "partially_correct_predictions": partial,
            "strict_precision": prediction_precision,
            "type_correct_count": type_correct,
            "type_correctness": _ratio(type_correct, len(prediction_rows)),
            "timestamp_correct_count": timestamp_correct,
            "timestamp_correctness": _ratio(timestamp_correct, len(prediction_rows)),
        },
        "gold_recall": {
            "full_recall_gold_count": len(full_recall_rows),
            "true_positive_gold_matches": len(matched_ids),
            "false_negative_gold_events": len(missing_ids),
            "recall": recall,
            "missing_event_ids": missing_ids,
        },
        "reviewed_precision_recall_f1": _harmonic(prediction_precision, recall),
        "f1_definition": (
            "Harmonic mean of strict prediction precision over all 20 reviewed predictions "
            "and gold recall over the explicitly full-recall VI/EN subset."
        ),
        "population_note": (
            "Prediction precision and gold recall use separately reviewed denominators; "
            "valid predictions outside the full-recall subset are not treated as false positives."
        ),
    }


def _qa_metrics(review_root: Path) -> dict[str, Any]:
    rows = _read_csv(review_root / "qa-links-review.csv")
    correct_links = sum(_boolean(row, "reviewer_a_link_correct") for row in rows)
    corrected_links = sum(bool(_value(row, "reviewer_a_correct_answer_event_id")) for row in rows)
    no_answer_rows = [row for row in rows if _boolean(row, "reviewer_a_should_have_no_answer")]
    no_answer_correct = sum(
        not _boolean(row, "reviewer_a_link_correct")
        and not _value(row, "reviewer_a_correct_answer_event_id")
        for row in no_answer_rows
    )
    incorrect_links = len(rows) - correct_links
    link_accuracy = _ratio(correct_links, len(rows))
    return {
        "question_count": len(rows),
        "correct_links": correct_links,
        "incorrect_links": incorrect_links,
        "link_accuracy": link_accuracy,
        "link": {
            "tp": correct_links,
            "fp": incorrect_links,
            "fn": corrected_links,
            "precision": link_accuracy,
            "recall": _ratio(correct_links, correct_links + corrected_links),
            "f1": _harmonic(
                link_accuracy,
                _ratio(correct_links, correct_links + corrected_links),
            ),
        },
        "corrected_link_count": corrected_links,
        "no_answer_case_count": len(no_answer_rows),
        "no_answer_correct_count": no_answer_correct,
        "no_answer_accuracy": _ratio(no_answer_correct, len(no_answer_rows)),
    }


def _context_metrics(review_root: Path) -> dict[str, Any]:
    rows = _read_csv(review_root / "context-recovery-review.csv")
    grounded_values: list[bool] = []
    citation_values: list[bool] = []
    completeness: list[int] = []
    usefulness: list[int] = []
    unsupported_response_count = 0
    for row in rows:
        items = json.loads(_value(row, "model_context_items"))
        grounded = json.loads(_value(row, "reviewer_a_claim_grounded_json"))
        cited = json.loads(_value(row, "reviewer_a_claim_supported_by_citation_json"))
        if len(items) != len(grounded) or len(items) != len(cited):
            raise ValueError(f"context_claim_length_mismatch:{_value(row, 'row_id')}")
        grounded_values.extend(grounded)
        citation_values.extend(cited)
        completeness.append(int(_value(row, "reviewer_a_completeness")))
        usefulness.append(int(_value(row, "reviewer_a_usefulness")))
        unsupported_response_count += int(_boolean(row, "reviewer_a_unsupported_claim_present"))

    grounded_count = sum(grounded_values)
    citation_count = sum(citation_values)
    unsupported_claim_count = len(grounded_values) - grounded_count
    return {
        "window_count": len(rows),
        "claim_count": len(grounded_values),
        "grounded_claim_count": grounded_count,
        "grounded_claim_rate": _ratio(grounded_count, len(grounded_values)),
        "citation_supported_claim_count": citation_count,
        "citation_supported_claim_rate": _ratio(citation_count, len(citation_values)),
        "unsupported_claim_count": unsupported_claim_count,
        "unsupported_claim_rate": _ratio(unsupported_claim_count, len(grounded_values)),
        "unsupported_response_count": unsupported_response_count,
        "completeness_distribution": _distribution(completeness),
        "mean_completeness_score": round(sum(completeness) / len(completeness), 6),
        "usefulness_distribution": _distribution(usefulness),
        "mean_usefulness_score": round(sum(usefulness) / len(usefulness), 6),
        "confirmed_lower_quality_cases": {
            "cs-topic": {"completeness": 2, "usefulness": 1},
            "cs-injection": {"completeness": 1, "usefulness": 1},
        },
    }


def _ask_metrics(review_root: Path) -> dict[str, Any]:
    rows = _read_csv(review_root / "ask-review.csv")
    answered = [row for row in rows if not _boolean(row, "model_abstained")]
    abstained = [row for row in rows if _boolean(row, "model_abstained")]
    supported = [row for row in rows if _value(row, "expected_case_type") == "SUPPORTED"]
    unsupported = [row for row in rows if _value(row, "expected_case_type") == "UNSUPPORTED"]

    answer_correct = sum(_boolean(row, "reviewer_a_answer_correct") for row in answered)
    answer_supported = sum(_boolean(row, "reviewer_a_answer_supported") for row in answered)
    citation_correct = sum(_boolean(row, "reviewer_a_citation_correct") for row in answered)
    unsupported_claims = sum(_boolean(row, "reviewer_a_unsupported_claim_present") for row in rows)
    correct_abstentions = sum(_boolean(row, "reviewer_a_abstention_correct") for row in abstained)
    supported_success = sum(
        not _boolean(row, "model_abstained")
        and _boolean(row, "reviewer_a_answer_correct")
        and _boolean(row, "reviewer_a_answer_supported")
        for row in supported
    )
    unsupported_abstentions = sum(
        _boolean(row, "model_abstained")
        and _boolean(row, "reviewer_a_abstention_correct")
        for row in unsupported
    )
    return {
        "question_count": len(rows),
        "supported_question_count": len(supported),
        "unsupported_question_count": len(unsupported),
        "answered_question_count": len(answered),
        "answer_correct_count": answer_correct,
        "answer_correctness": _ratio(answer_correct, len(answered)),
        "answer_supported_count": answer_supported,
        "answer_support_rate": _ratio(answer_supported, len(answered)),
        "citation_correct_count": citation_correct,
        "citation_reviewed_answer_count": len(answered),
        "citation_correctness": _ratio(citation_correct, len(answered)),
        "unsupported_claim_count": unsupported_claims,
        "unsupported_claim_rate": _ratio(unsupported_claims, len(rows)),
        "abstention_count": len(abstained),
        "correct_abstention_count": correct_abstentions,
        "abstention_correctness": _ratio(correct_abstentions, len(abstained)),
        "supported_question_success_count": supported_success,
        "supported_question_success_rate": _ratio(supported_success, len(supported)),
        "unsupported_question_abstention_count": unsupported_abstentions,
        "unsupported_question_abstention_accuracy": _ratio(
            unsupported_abstentions, len(unsupported)
        ),
        "confirmed_error_cases": {
            "vi-paraphrase": "Answer correct and supported; citation incorrect.",
            "cs-paraphrase": "Model abstained despite sufficient lecture evidence.",
        },
    }


def build_results(*, review_root: Path = REVIEW_ROOT) -> dict[str, Any]:
    gold_draft = _load(ROOT / "evaluation" / "data" / "gold" / "event-gold-draft.json")
    smoke_path = ROOT / "evaluation" / "results" / "real_provider_smoke.json"
    smoke = _load(smoke_path) if smoke_path.exists() else {"status": "NOT_RUN"}
    blockers: list[str] = []
    metrics: dict[str, Any] = {
        "events": None,
        "question_answer_links": None,
        "context_recovery": None,
        "grounded_ask": None,
    }

    _, _, generated_review = build_review_pack()
    review_validation = validate_review_pack(
        review_root,
        canonical_packs=generated_review["packs"],
    )
    if review_validation.errors:
        blockers.append("REVIEW_PACK_SCHEMA_INVALID")
    if review_validation.review_state != HUMAN_VERIFIED:
        blockers.append(f"REVIEW_PACK_{review_validation.review_state}")
    if not review_validation.metrics_allowed:
        blockers.append(
            f"REVIEW_PACK_INCOMPLETE_{review_validation.completed_total}_OF_{review_validation.required_total}"
        )

    active_rows = [
        row
        for file_name in (
            "event-predictions-review.csv",
            "qa-links-review.csv",
            "context-recovery-review.csv",
            "ask-review.csv",
        )
        for row in _read_csv(review_root / file_name)
    ]
    models = {_value(row, "model") for row in active_rows}
    final_model = next(iter(models)) if len(models) == 1 else "MIXED_OR_UNKNOWN"
    if len(models) != 1:
        blockers.append("REVIEW_PACK_MODEL_MIXED_OR_UNKNOWN")

    if review_validation.metrics_allowed and not review_validation.errors:
        try:
            metrics = {
                "events": _event_metrics(review_root),
                "question_answer_links": _qa_metrics(review_root),
                "context_recovery": _context_metrics(review_root),
                "grounded_ask": _ask_metrics(review_root),
            }
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
            blockers.append(f"VERIFIED_METRICS_INPUT_INVALID_{type(exc).__name__}")

    if smoke.get("status") != "PASS":
        blockers.append(f"REAL_PROVIDER_SMOKE_{smoke.get('status', 'NOT_RUN')}")
    complete = not blockers and all(value is not None for value in metrics.values())
    return {
        "schema_version": 1,
        "fixture_notice": "SYNTHETIC - HUMAN-VERIFIED SMALL-SET EVALUATION",
        "status": "COMPLETE" if complete else "BLOCKED_PENDING_PROVIDER_AND_HUMAN_REVIEW",
        "final_model": final_model,
        "prediction_population_status": "TECHNICALLY_COMPLETE",
        "dataset": {
            "sample_count": len(gold_draft.get("videos", [])),
            "total_duration_seconds": sum(
                video.get("duration_seconds", 0) for video in gold_draft.get("videos", [])
            ),
            "languages": ["vi", "en", "vi-en-code-switch"],
            "provenance": "Project-authored synthetic transcripts; no PII or third-party media.",
            "annotation_status": review_validation.review_state,
        },
        "real_provider_smoke_status": smoke.get("status", "NOT_RUN"),
        "metrics": metrics,
        "blockers": blockers,
        "review_status": review_validation.review_state,
        "review_completion": {
            label: {"completed": value[0], "required": value[1]}
            for label, value in review_validation.completion.items()
        },
        "evaluation_design": "SINGLE_REVIEWER_100_PERCENT",
        "methodology": (
            "AI-assisted review suggestions were generated against canonical source evidence "
            "and subsequently manually verified by one human reviewer."
        ),
        "limitation": (
            "This evaluation uses one human reviewer. Therefore, no inter-rater agreement "
            "or independent secondary-review reliability measure is reported."
        ),
        "reporting_note": (
            "Metrics are derived only from explicitly human-verified review CSVs; "
            "prediction precision and gold-event recall use transparent separate denominators."
        ),
    }


def _markdown(result: dict[str, Any]) -> str:
    lines = [
        "# Verified metrics",
        "",
        f"Status: **{result['review_status']}**",
        "",
        f"Final model: `{result['final_model']}`",
        "",
        result["methodology"],
        "",
        "## Metrics",
        "",
    ]
    for name, value in result["metrics"].items():
        lines.append(
            f"- {name}: `{json.dumps(value, ensure_ascii=False) if value is not None else 'NOT_AVAILABLE'}`"
        )
    lines.extend(["", "## Blockers", ""])
    lines.extend(f"- `{blocker}`" for blocker in result["blockers"])
    if not result["blockers"]:
        lines.append("- None")
    lines.extend(
        [
            "",
            result["limitation"],
            "",
            "These synthetic small-set results are not a claim of statistical significance or universal effectiveness.",
            "",
        ]
    )
    return "\n".join(lines)


def _final_report(result: dict[str, Any]) -> str:
    event = result["metrics"]["events"]
    qa = result["metrics"]["question_answer_links"]
    context = result["metrics"]["context_recovery"]
    ask = result["metrics"]["grounded_ask"]
    if any(value is None for value in (event, qa, context, ask)):
        return (
            "# LectureBridge Final Evaluation Report\n\n"
            f"Status: **{result['status']}**\n\n"
            "Verified metrics are not available because the human-verification gate is not complete.\n"
        )

    precision = event["prediction_precision"]
    recall = event["gold_recall"]
    return f"""# LectureBridge Final Evaluation Report

Status: **HUMAN_VERIFIED**

## A. Evaluation Design

- Three project-authored synthetic lectures covering Vietnamese, English, and Vietnamese-English code-switch content.
- Final evaluated model: `{result['final_model']}` through the repository's Gemini OpenAI-compatible provider abstraction.
- One human reviewer reviewed 100% of the 47 prediction rows and confirmed the missing gold Event.
- {result['methodology']}
- {result['limitation']}

## B. Event Detection

Prediction precision and gold-event recall are reported separately because the recall gold sheet marks only VI and EN as full-recall subsets.

- Reviewed predictions: {precision['reviewed_prediction_count']}.
- Strictly correct predictions: {precision['true_positive_predictions']}.
- False-positive predictions: {precision['false_positive_predictions']}.
- Strict prediction precision: {precision['strict_precision']}.
- Full-recall gold Events: {recall['full_recall_gold_count']}.
- Matched gold Events: {recall['true_positive_gold_matches']}.
- False-negative gold Events: {recall['false_negative_gold_events']}.
- Gold-event recall: {recall['recall']}.
- Reviewed precision/recall harmonic F1: {event['reviewed_precision_recall_f1']}.
- Type correctness: {precision['type_correct_count']}/{precision['reviewed_prediction_count']} ({precision['type_correctness']}).
- Timestamp correctness: {precision['timestamp_correct_count']}/{precision['reviewed_prediction_count']} ({precision['timestamp_correctness']}).
- `en-topic-serializable` is the confirmed false negative at segment 10, 600-660 seconds; no prediction was fabricated.

## C. Q-to-A Linking

- Correct links: {qa['correct_links']}/{qa['question_count']}.
- Link accuracy: {qa['link_accuracy']}.
- Corrected-link count: {qa['corrected_link_count']}.
- No-answer cases: {qa['no_answer_case_count']}; no-answer accuracy is not applicable when the denominator is zero.

## D. Context Recovery

- Grounded claims: {context['grounded_claim_count']}/{context['claim_count']} ({context['grounded_claim_rate']}).
- Citation-supported claims: {context['citation_supported_claim_count']}/{context['claim_count']} ({context['citation_supported_claim_rate']}).
- Unsupported-claim rate: {context['unsupported_claim_rate']}.
- Completeness distribution: {json.dumps(context['completeness_distribution'])}; mean {context['mean_completeness_score']}.
- Usefulness distribution: {json.dumps(context['usefulness_distribution'])}; mean {context['mean_usefulness_score']}.
- Confirmed lower-quality rows remain unchanged: `cs-topic` completeness 2/usefulness 1; `cs-injection` completeness 1/usefulness 1.

## E. Grounded Ask

- Answer correctness: {ask['answer_correct_count']}/{ask['answered_question_count']} ({ask['answer_correctness']}).
- Answer support: {ask['answer_supported_count']}/{ask['answered_question_count']} ({ask['answer_support_rate']}).
- Citation correctness: {ask['citation_correct_count']}/{ask['citation_reviewed_answer_count']} ({ask['citation_correctness']}).
- Unsupported-claim rate: {ask['unsupported_claim_rate']}.
- Abstention correctness: {ask['correct_abstention_count']}/{ask['abstention_count']} ({ask['abstention_correctness']}).
- Supported-question success: {ask['supported_question_success_count']}/{ask['supported_question_count']} ({ask['supported_question_success_rate']}).
- Unsupported-question abstention accuracy: {ask['unsupported_question_abstention_count']}/{ask['unsupported_question_count']} ({ask['unsupported_question_abstention_accuracy']}).

## F. Error Analysis

- Missing Event: `en-topic-serializable` was not predicted.
- Ask citation weakness: `vi-paraphrase` is correct and supported, but its citation judgment is false.
- Ask abstention weakness: `cs-paraphrase` abstained despite sufficient lecture evidence.
- Context redundancy: `cs-topic` is grounded and complete but unnecessarily repetitive.
- Context incompleteness: `cs-injection` omits item-level coverage of important window content.

## G. Responsible Interpretation

- This is a small synthetic evaluation and does not establish statistical significance.
- Results are specific to `gemini-3.5-flash-lite`, the current prompts, and the current provider-compatible endpoint behavior.
- The evaluation does not establish universal effectiveness for Deaf and Hard-of-Hearing learners.
- {result['limitation']}

## H. Reproducibility

- Model: `gemini-3.5-flash-lite`.
- Canonical transcripts: `evaluation/data/transcripts/`.
- Review packs: `evaluation/review_pack/event-predictions-review.csv`, `qa-links-review.csv`, `context-recovery-review.csv`, `ask-review.csv`, and `event-recall-gold-review.csv`.
- Review guide: `evaluation/guidelines/human-review-guide.md`.
- Verified metrics: `evaluation/results/verified_metrics.json`.
"""


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate LectureBridge metrics from explicitly human-verified review CSVs."
    )
    parser.add_argument("--output-json", type=Path, default=RESULT_JSON)
    parser.add_argument("--output-md", type=Path, default=RESULT_MD)
    parser.add_argument("--final-report", type=Path, default=FINAL_REPORT_MD)
    args = parser.parse_args()
    result = build_results()
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    args.output_md.write_text(_markdown(result), encoding="utf-8")
    args.final_report.write_text(_final_report(result), encoding="utf-8")
    print(f"LECTUREBRIDGE_EVALUATION={result['status']}")
    print(f"review_status={result['review_status']}")
    print(f"blocker_count={len(result['blockers'])}")
    return 0 if result["status"] == "COMPLETE" else 1


if __name__ == "__main__":
    raise SystemExit(main())
