from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
EVALUATION_ROOT = ROOT / "evaluation"
REQUIRED_REVIEW_CSVS = {
    "event-predictions-review.csv",
    "event-recall-gold-review.csv",
    "qa-links-review.csv",
    "context-recovery-review.csv",
    "ask-review.csv",
}


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

    metrics_path = EVALUATION_ROOT / "results" / "verified_metrics.json"
    pending_review = True
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
        pending_review = metrics.get("review_status") != "HUMAN_VERIFIED"

    for path in sorted(review_root.glob("*.csv")):
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)):
                errors.append(f"invalid_csv_header:{path.name}")
                continue
            for line_number, row in enumerate(reader, start=2):
                if None in row:
                    errors.append(f"invalid_csv_width:{path.name}:{line_number}")
                if pending_review:
                    for field, value in row.items():
                        if field.startswith("reviewer_") and str(value or "").strip():
                            errors.append(
                                f"human_field_filled_before_verification:{path.name}:{line_number}:{field}"
                            )

    smoke_path = EVALUATION_ROOT / "results" / "real_provider_smoke.json"
    if smoke_path.exists():
        smoke = json.loads(smoke_path.read_text(encoding="utf-8"))
        if smoke.get("credential_value_logged") is not False:
            errors.append("smoke_credential_logging_flag_not_false")
    return errors


def main() -> int:
    errors = validate()
    print(f"EVALUATION_ARTIFACT_VALIDATION={'PASS' if not errors else 'FAIL'}")
    print(f"error_count={len(errors)}")
    for error in errors:
        print(error)
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
