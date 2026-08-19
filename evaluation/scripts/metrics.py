from __future__ import annotations

from collections import defaultdict
from typing import Any


def _ratio(numerator: int, denominator: int) -> float | None:
    return round(numerator / denominator, 6) if denominator else None


def _prf(tp: int, fp: int, fn: int) -> dict[str, int | float | None]:
    precision = _ratio(tp, tp + fp)
    recall = _ratio(tp, tp + fn)
    f1 = None
    if precision is not None and recall is not None and precision + recall > 0:
        f1 = round(2 * precision * recall / (precision + recall), 6)
    return {"tp": tp, "fp": fp, "fn": fn, "precision": precision, "recall": recall, "f1": f1}


def _iou(first: dict[str, Any], second: dict[str, Any]) -> float:
    start = max(float(first["start_time"]), float(second["start_time"]))
    end = min(float(first["end_time"]), float(second["end_time"]))
    intersection = max(0.0, end - start)
    union = max(float(first["end_time"]), float(second["end_time"])) - min(
        float(first["start_time"]), float(second["start_time"])
    )
    return intersection / union if union > 0 else 0.0


def evaluate_events(
    gold_payload: dict[str, Any],
    prediction_payload: dict[str, Any],
    *,
    iou_threshold: float = 0.30,
    start_tolerance_seconds: float = 5.0,
) -> dict[str, Any]:
    gold_by_video = {video["video_id"]: video.get("events", []) for video in gold_payload.get("videos", [])}
    pred_by_video = {video["video_id"]: video.get("events", []) for video in prediction_payload.get("videos", [])}
    matches: list[tuple[str, dict, dict]] = []
    unmatched_gold: list[tuple[str, dict]] = []
    unmatched_pred: list[tuple[str, dict]] = []

    for video_id in sorted(set(gold_by_video) | set(pred_by_video)):
        gold_events = gold_by_video.get(video_id, [])
        predicted_events = pred_by_video.get(video_id, [])
        candidates: list[tuple[float, int, int]] = []
        for gold_index, gold in enumerate(gold_events):
            for pred_index, prediction in enumerate(predicted_events):
                if gold.get("type") != prediction.get("type"):
                    continue
                overlap = _iou(gold, prediction)
                start_error = abs(float(gold["start_time"]) - float(prediction["start_time"]))
                if overlap >= iou_threshold or start_error <= start_tolerance_seconds:
                    tolerance_score = max(0.0, 1 - start_error / max(1.0, start_tolerance_seconds))
                    candidates.append((max(overlap, tolerance_score), gold_index, pred_index))
        used_gold: set[int] = set()
        used_pred: set[int] = set()
        for _, gold_index, pred_index in sorted(candidates, reverse=True):
            if gold_index in used_gold or pred_index in used_pred:
                continue
            used_gold.add(gold_index)
            used_pred.add(pred_index)
            matches.append((video_id, gold_events[gold_index], predicted_events[pred_index]))
        unmatched_gold.extend((video_id, event) for index, event in enumerate(gold_events) if index not in used_gold)
        unmatched_pred.extend((video_id, event) for index, event in enumerate(predicted_events) if index not in used_pred)

    overall = _prf(len(matches), len(unmatched_pred), len(unmatched_gold))
    classes = sorted(
        {event.get("type") for events in gold_by_video.values() for event in events}
        | {event.get("type") for events in pred_by_video.values() for event in events}
    )
    per_class = {}
    for event_type in classes:
        class_tp = sum(1 for _, gold, _ in matches if gold.get("type") == event_type)
        class_fp = sum(1 for _, event in unmatched_pred if event.get("type") == event_type)
        class_fn = sum(1 for _, event in unmatched_gold if event.get("type") == event_type)
        per_class[event_type] = _prf(class_tp, class_fp, class_fn)

    start_errors = [abs(float(gold["start_time"]) - float(pred["start_time"])) for _, gold, pred in matches]
    end_errors = [abs(float(gold["end_time"]) - float(pred["end_time"])) for _, gold, pred in matches]
    timestamp = {
        "matched_count": len(matches),
        "mean_absolute_start_error_seconds": round(sum(start_errors) / len(start_errors), 6) if start_errors else None,
        "mean_absolute_end_error_seconds": round(sum(end_errors) / len(end_errors), 6) if end_errors else None,
        "mean_absolute_timestamp_error_seconds": (
            round((sum(start_errors) + sum(end_errors)) / (2 * len(matches)), 6)
            if matches
            else None
        ),
    }
    return {
        "matching_rule": {
            "same_event_type": True,
            "minimum_interval_iou": iou_threshold,
            "or_start_tolerance_seconds": start_tolerance_seconds,
            "matching": "greedy highest temporal score, one-to-one within video",
        },
        "overall": overall,
        "per_class": per_class,
        "timestamp": timestamp,
        "counts": {
            "gold": len(matches) + len(unmatched_gold),
            "predicted": len(matches) + len(unmatched_pred),
            "matched": len(matches),
        },
    }


def evaluate_qa(items: list[dict[str, Any]]) -> dict[str, Any]:
    gold_links: set[tuple[str, str, str]] = set()
    predicted_links: set[tuple[str, str, str]] = set()
    exact = 0
    no_answer_total = 0
    no_answer_correct = 0
    for item in items:
        video_id = str(item["video_id"])
        question_id = str(item["question_event_id"])
        gold_answers = {str(value) for value in item.get("correct_answer_event_ids", [])}
        predicted_answers = {str(value) for value in item.get("predicted_answer_event_ids", [])}
        gold_links.update((video_id, question_id, answer_id) for answer_id in gold_answers)
        predicted_links.update((video_id, question_id, answer_id) for answer_id in predicted_answers)
        exact += int(gold_answers == predicted_answers)
        if not gold_answers:
            no_answer_total += 1
            no_answer_correct += int(not predicted_answers)
    tp = len(gold_links & predicted_links)
    link_metrics = _prf(tp, len(predicted_links - gold_links), len(gold_links - predicted_links))
    return {
        "question_count": len(items),
        "pairing_accuracy": _ratio(exact, len(items)),
        "pairing_accuracy_numerator": exact,
        "link": link_metrics,
        "no_answer_abstention_accuracy": _ratio(no_answer_correct, no_answer_total),
        "no_answer_numerator": no_answer_correct,
        "no_answer_denominator": no_answer_total,
    }


def evaluate_context(windows: list[dict[str, Any]]) -> dict[str, Any]:
    claims = [claim for window in windows for claim in (window.get("claims") or [])]
    supported = sum(1 for claim in claims if claim.get("supported") is True)
    unsupported = sum(1 for claim in claims if claim.get("supported") is False)
    completeness = [int(window["completeness"]) for window in windows]
    usefulness = [int(window["usefulness"]) for window in windows]
    return {
        "window_count": len(windows),
        "claim_count": len(claims),
        "grounded_claim_rate": _ratio(supported, len(claims)),
        "unsupported_claim_rate": _ratio(unsupported, len(claims)),
        "mean_completeness_score": round(sum(completeness) / len(completeness), 6) if completeness else None,
        "mean_usefulness_score": round(sum(usefulness) / len(usefulness), 6) if usefulness else None,
    }


def evaluate_ask(questions: list[dict[str, Any]]) -> dict[str, Any]:
    supported_items = [item for item in questions if item.get("supported")]
    unsupported_items = [item for item in questions if not item.get("supported")]
    supported_correct = sum(
        1 for item in supported_items if int(item["system_result"]["answer_correctness"]) == 2
    )
    citation_correct = sum(
        1 for item in supported_items if item["system_result"].get("citation_correct") is True
    )
    retrieval_hits = sum(
        1 for item in supported_items if item["system_result"].get("retrieval_hit") is True
    )
    abstained = sum(
        1 for item in unsupported_items if item["system_result"].get("supported") is False
    )
    unsupported_claims = sum(
        int(item["system_result"].get("unsupported_claim_count", 0)) for item in questions
    )
    return {
        "question_count": len(questions),
        "supported_count": len(supported_items),
        "unsupported_count": len(unsupported_items),
        "supported_answer_correctness": _ratio(supported_correct, len(supported_items)),
        "grounding_citation_correctness": _ratio(citation_correct, len(supported_items)),
        "retrieval_hit_rate": _ratio(retrieval_hits, len(supported_items)),
        "unsupported_abstention_accuracy": _ratio(abstained, len(unsupported_items)),
        "unsupported_claim_count": unsupported_claims,
        "unsupported_claim_rate_per_question": _ratio(unsupported_claims, len(questions)),
    }
