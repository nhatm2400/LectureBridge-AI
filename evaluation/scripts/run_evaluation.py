from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from evaluation.scripts.metrics import evaluate_ask, evaluate_context, evaluate_events, evaluate_qa


RESULT_JSON = ROOT / "evaluation" / "results" / "verified_metrics.json"
RESULT_MD = ROOT / "evaluation" / "results" / "verified_metrics.md"


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_results() -> dict[str, Any]:
    gold = _load(ROOT / "evaluation" / "data" / "gold" / "event-gold-draft.json")
    qa_review = _load(ROOT / "evaluation" / "review_pack" / "qa-review-template.json")
    context_review = _load(ROOT / "evaluation" / "review_pack" / "context-review-template.json")
    ask_review = _load(ROOT / "evaluation" / "review_pack" / "ask-review-template.json")
    smoke_path = ROOT / "evaluation" / "results" / "real_provider_smoke.json"
    smoke = _load(smoke_path) if smoke_path.exists() else {"status": "NOT_RUN"}
    blockers: list[str] = []
    metrics: dict[str, Any] = {
        "events": None,
        "question_answer_links": None,
        "context_recovery": None,
        "grounded_ask": None,
    }

    predictions_path = ROOT / "evaluation" / "data" / "predictions" / "event-predictions.json"
    if gold.get("annotation_status") == "HUMAN_VERIFIED" and predictions_path.exists():
        metrics["events"] = evaluate_events(gold, _load(predictions_path))
    else:
        blockers.append("EVENT_GOLD_OR_PROVIDER_PREDICTIONS_NOT_HUMAN_VERIFIED")

    if qa_review.get("review_status") == "HUMAN_VERIFIED" and all(
        item.get("predicted_answer_event_ids") is not None for item in qa_review.get("items", [])
    ):
        metrics["question_answer_links"] = evaluate_qa(qa_review["items"])
    else:
        blockers.append("QA_REVIEW_PENDING")

    if context_review.get("review_status") == "HUMAN_VERIFIED" and all(
        window.get("claims") is not None
        and window.get("completeness") is not None
        and window.get("usefulness") is not None
        for window in context_review.get("windows", [])
    ):
        metrics["context_recovery"] = evaluate_context(context_review["windows"])
    else:
        blockers.append("CONTEXT_REVIEW_PENDING")

    if ask_review.get("review_status") == "HUMAN_VERIFIED" and all(
        question.get("system_result") is not None for question in ask_review.get("questions", [])
    ):
        metrics["grounded_ask"] = evaluate_ask(ask_review["questions"])
    else:
        blockers.append("ASK_REVIEW_PENDING")

    if smoke.get("status") != "PASS":
        blockers.append(f"REAL_PROVIDER_SMOKE_{smoke.get('status', 'NOT_RUN')}")
    return {
        "schema_version": 1,
        "fixture_notice": "SYNTHETIC — NOT MODEL QUALITY EVIDENCE",
        "status": "BLOCKED_PENDING_PROVIDER_AND_HUMAN_REVIEW" if blockers else "COMPLETE",
        "dataset": {
            "sample_count": len(gold.get("videos", [])),
            "total_duration_seconds": sum(video.get("duration_seconds", 0) for video in gold.get("videos", [])),
            "languages": ["vi", "en", "vi-en-code-switch"],
            "provenance": "Project-authored synthetic transcripts; no PII or third-party media.",
            "annotation_status": gold.get("annotation_status"),
        },
        "real_provider_smoke_status": smoke.get("status", "NOT_RUN"),
        "metrics": metrics,
        "blockers": blockers,
        "review_status": "PENDING_HUMAN_REVIEW" if blockers else "HUMAN_VERIFIED",
        "reporting_note": "Null metrics are intentionally not replaced with fixture or invented scores.",
    }


def _markdown(result: dict[str, Any]) -> str:
    lines = [
        "# LectureBridge Evaluation Metrics",
        "",
        "**SYNTHETIC — NOT MODEL QUALITY EVIDENCE**",
        "",
        f"Status: **{result['status']}**",
        "",
        "## Dataset",
        "",
        f"- Samples: {result['dataset']['sample_count']}",
        f"- Total scripted duration: {result['dataset']['total_duration_seconds'] / 60:.0f} minutes",
        f"- Languages: {', '.join(result['dataset']['languages'])}",
        f"- Annotation status: `{result['dataset']['annotation_status']}`",
        f"- Real-provider smoke: `{result['real_provider_smoke_status']}`",
        "",
        "## Metrics",
        "",
    ]
    for name, value in result["metrics"].items():
        lines.append(f"- {name}: `{json.dumps(value, ensure_ascii=False) if value is not None else 'NOT_AVAILABLE'}`")
    lines.extend(["", "## Blockers", ""])
    lines.extend(f"- `{blocker}`" for blocker in result["blockers"])
    lines.extend(
        [
            "",
            "No metric has been fabricated from fake-provider tests or unverified draft labels.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the LectureBridge evaluation status and available metrics.")
    parser.add_argument("--output-json", type=Path, default=RESULT_JSON)
    parser.add_argument("--output-md", type=Path, default=RESULT_MD)
    args = parser.parse_args()
    result = build_results()
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    args.output_md.write_text(_markdown(result), encoding="utf-8")
    print(f"LECTUREBRIDGE_EVALUATION={result['status']}")
    print(f"blocker_count={len(result['blockers'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
