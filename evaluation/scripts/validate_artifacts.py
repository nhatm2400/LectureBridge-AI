from __future__ import annotations

import csv
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from evaluation.scripts.prepare_human_review import build as build_review_pack
from evaluation.scripts.review_validation import (
    ACTIVE_REVIEW_COUNTS,
    HUMAN_VERIFIED,
    ReviewPackValidation,
    validate_review_pack,
)


EVALUATION_ROOT = ROOT / "evaluation"
REQUIRED_REVIEW_CSVS = {
    "event-predictions-review.csv",
    "event-recall-gold-review.csv",
    "qa-links-review.csv",
    "context-recovery-review.csv",
    "ask-review.csv",
}
ACTIVE_SINGLE_REVIEW_COUNTS = ACTIVE_REVIEW_COUNTS
SINGLE_REVIEWER_LIMITATION = (
    "This evaluation uses one human reviewer. Therefore, no inter-rater agreement "
    "or independent secondary-review reliability measure is reported."
)


def _review_pack_validation() -> ReviewPackValidation:
    _, _, generated = build_review_pack()
    return validate_review_pack(
        EVALUATION_ROOT / "review_pack",
        canonical_packs=generated["packs"],
    )


def validate() -> list[str]:
    errors: list[str] = []
    for path in sorted(EVALUATION_ROOT.rglob("*.json")):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            errors.append(f"invalid_json:{path.relative_to(ROOT).as_posix()}:{type(exc).__name__}")

    review_root = EVALUATION_ROOT / "review_pack"
    existing = {path.name for path in review_root.glob("*.csv")}
    for missing in sorted(REQUIRED_REVIEW_CSVS - existing):
        errors.append(f"missing_review_csv:{missing}")

    review_validation = _review_pack_validation()
    errors.extend(review_validation.errors)

    metrics_path = EVALUATION_ROOT / "results" / "verified_metrics.json"
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        if not review_validation.metrics_allowed and any(
            value is not None for value in metrics.get("metrics", {}).values()
        ):
            errors.append("metrics_calculated_before_single_reviewer_completion")
        if (
            metrics.get("review_status") == HUMAN_VERIFIED
            and review_validation.review_state != HUMAN_VERIFIED
        ):
            errors.append("metrics_status_verified_without_explicit_human_confirmation")
        if review_validation.review_state == HUMAN_VERIFIED:
            if metrics.get("review_status") != HUMAN_VERIFIED:
                errors.append("human_verified_review_has_stale_metrics_status")
            if metrics.get("status") != "COMPLETE":
                errors.append("human_verified_review_has_incomplete_metrics")
            if metrics.get("blockers"):
                errors.append("human_verified_metrics_have_blockers")
            if any(value is None for value in metrics.get("metrics", {}).values()):
                errors.append("human_verified_metrics_missing_results")
    elif review_validation.review_state == HUMAN_VERIFIED:
        errors.append("human_verified_metrics_missing")

    if (review_root / "reviewer-b-subset.json").exists():
        errors.append("inactive_reviewer_b_subset_present")

    for path in sorted(review_root.glob("*.csv")):
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
                errors.append(f"invalid_csv_header:{path.name}")
                continue
            rows = list(reader)
            for line_number, row in enumerate(rows, start=2):
                expected_count = ACTIVE_SINGLE_REVIEW_COUNTS.get(path.name)
                for field, value in row.items():
                    normalized = str(value or "").strip()
                    if expected_count is not None and field.startswith("reviewer_b_"):
                        expected = (
                            "UNUSED_SINGLE_REVIEWER"
                            if field == "reviewer_b_selected"
                            else ""
                        )
                        if normalized != expected:
                            errors.append(
                                f"reviewer_b_not_inactive:{path.name}:{line_number}:{field}"
                            )
                    if (
                        expected_count is not None
                        and field == "adjudicated_result"
                        and normalized != "UNUSED_SINGLE_REVIEWER"
                    ):
                        errors.append(
                            f"adjudication_not_inactive:{path.name}:{line_number}"
                        )

    guide_path = EVALUATION_ROOT / "guidelines" / "human-review-guide.md"
    if not guide_path.exists() or SINGLE_REVIEWER_LIMITATION not in guide_path.read_text(
        encoding="utf-8"
    ):
        errors.append("single_reviewer_limitation_missing")

    smoke_path = EVALUATION_ROOT / "results" / "real_provider_smoke.json"
    if smoke_path.exists():
        smoke = json.loads(smoke_path.read_text(encoding="utf-8"))
        if smoke.get("credential_value_logged") is not False:
            errors.append("smoke_credential_logging_flag_not_false")
    return errors


def main() -> int:
    errors = validate()
    review_validation = _review_pack_validation()
    print(f"EVALUATION_ARTIFACT_VALIDATION={'PASS' if not errors else 'FAIL'}")
    print(f"error_count={len(errors)}")
    print(f"review_state={review_validation.review_state}")
    for label, (completed, required) in review_validation.completion.items():
        print(f"{label}={completed}/{required}")
    print(
        f"Total={review_validation.completed_total}/{review_validation.required_total}"
    )
    for error in errors:
        print(error)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
