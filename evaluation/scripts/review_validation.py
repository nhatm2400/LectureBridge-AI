from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PENDING_HUMAN_REVIEW = "PENDING_HUMAN_REVIEW"
AI_ASSISTED_PENDING_CONFIRMATION = "AI_ASSISTED_PENDING_CONFIRMATION"
HUMAN_VERIFIED = "HUMAN_VERIFIED"

ACTIVE_REVIEW_COUNTS = {
    "event-predictions-review.csv": 20,
    "qa-links-review.csv": 3,
    "context-recovery-review.csv": 9,
    "ask-review.csv": 15,
}

EVENT_JUDGMENTS = {
    "CORRECT",
    "PARTIALLY_CORRECT",
    "INCORRECT",
    "MISSING",
    "DUPLICATE",
}
TIMESTAMP_JUDGMENTS = {"CORRECT", "INCORRECT"}
CANONICAL_EVENT_TYPES = {
    "QUESTION",
    "ANSWER",
    "EXAMPLE",
    "TOPIC_CHANGE",
    "IMPORTANT",
    "ACTION",
    "DEADLINE",
    "EXAM_CUE",
}
BOOLEAN_LITERALS = {"true", "false"}


@dataclass(frozen=True)
class ReviewPackValidation:
    errors: list[str]
    completion: dict[str, tuple[int, int]]
    review_state: str
    metrics_allowed: bool

    @property
    def completed_total(self) -> int:
        return sum(value[0] for value in self.completion.values())

    @property
    def required_total(self) -> int:
        return sum(value[1] for value in self.completion.values())


def _value(row: dict[str, Any], field: str) -> str:
    return str(row.get(field) or "").strip()


def _read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def _review_boolean(
    row: dict[str, Any],
    field: str,
    *,
    location: str,
    errors: list[str],
) -> bool | None:
    raw = _value(row, field)
    if not raw:
        return None
    if raw not in BOOLEAN_LITERALS:
        errors.append(f"invalid_boolean_literal:{location}:{field}:{raw}")
        return None
    return raw == "true"


def _system_boolean(row: dict[str, Any], field: str) -> bool | None:
    raw = _value(row, field).lower()
    if raw == "true":
        return True
    if raw == "false":
        return False
    return None


def _json_boolean_array(
    row: dict[str, Any],
    field: str,
    *,
    location: str,
    errors: list[str],
) -> list[bool] | None:
    raw = _value(row, field)
    if not raw:
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        errors.append(f"invalid_context_json:{location}:{field}")
        return None
    if not isinstance(value, list) or any(type(item) is not bool for item in value):
        errors.append(f"context_array_not_boolean:{location}:{field}")
        return None
    return value


def _context_item_count(row: dict[str, Any], *, location: str, errors: list[str]) -> int | None:
    try:
        items = json.loads(_value(row, "model_context_items"))
    except json.JSONDecodeError:
        errors.append(f"invalid_model_context_items:{location}")
        return None
    if not isinstance(items, list):
        errors.append(f"model_context_items_not_array:{location}")
        return None
    return len(items)


def _validate_event_row(row: dict[str, Any], *, location: str, errors: list[str]) -> bool:
    judgment = _value(row, "reviewer_a_judgment")
    corrected_type = _value(row, "reviewer_a_corrected_type")
    timestamp = _value(row, "reviewer_a_timestamp_judgment")

    judgment_valid = not judgment or judgment in EVENT_JUDGMENTS
    timestamp_valid = not timestamp or timestamp in TIMESTAMP_JUDGMENTS
    corrected_valid = not corrected_type or corrected_type in CANONICAL_EVENT_TYPES

    if not judgment_valid:
        errors.append(f"invalid_event_judgment:{location}:{judgment}")
    if not timestamp_valid:
        errors.append(f"invalid_timestamp_judgment:{location}:{timestamp}")
    if not corrected_valid:
        errors.append(f"invalid_corrected_event_type:{location}:{corrected_type}")
    if corrected_type and corrected_type == _value(row, "event_type"):
        errors.append(f"corrected_event_type_unchanged:{location}")
        corrected_valid = False
    if judgment == "CORRECT" and corrected_type:
        errors.append(f"correct_event_must_not_have_corrected_type:{location}")
        corrected_valid = False

    # Every active event-prediction row has a canonical timestamp, so a blank
    # timestamp judgment means the row is a valid partial save, not complete.
    return bool(judgment and timestamp and judgment_valid and timestamp_valid and corrected_valid)


def _validate_qa_row(
    row: dict[str, Any],
    *,
    location: str,
    answer_event_ids: set[str],
    errors: list[str],
) -> bool:
    link_correct = _review_boolean(
        row, "reviewer_a_link_correct", location=location, errors=errors
    )
    should_have_no_answer = _review_boolean(
        row, "reviewer_a_should_have_no_answer", location=location, errors=errors
    )
    corrected_answer_id = _value(row, "reviewer_a_correct_answer_event_id")
    consistent = True

    if corrected_answer_id and corrected_answer_id not in answer_event_ids:
        errors.append(f"corrected_answer_event_unknown:{location}:{corrected_answer_id}")
        consistent = False
    if link_correct is True:
        if corrected_answer_id:
            errors.append(f"correct_link_must_not_have_corrected_answer:{location}")
            consistent = False
        if should_have_no_answer is True:
            errors.append(f"correct_link_cannot_have_no_answer:{location}")
            consistent = False
    elif link_correct is False and should_have_no_answer is not None:
        if should_have_no_answer and corrected_answer_id:
            errors.append(f"no_answer_must_not_have_corrected_answer:{location}")
            consistent = False
        if not should_have_no_answer and not corrected_answer_id:
            errors.append(f"wrong_link_requires_corrected_answer:{location}")
            consistent = False

    return bool(
        link_correct is not None
        and should_have_no_answer is not None
        and consistent
    )


def _validate_context_row(row: dict[str, Any], *, location: str, errors: list[str]) -> bool:
    item_count = _context_item_count(row, location=location, errors=errors)
    grounded = _json_boolean_array(
        row, "reviewer_a_claim_grounded_json", location=location, errors=errors
    )
    cited = _json_boolean_array(
        row,
        "reviewer_a_claim_supported_by_citation_json",
        location=location,
        errors=errors,
    )
    arrays_valid = True
    if item_count is not None:
        for field, values in (
            ("reviewer_a_claim_grounded_json", grounded),
            ("reviewer_a_claim_supported_by_citation_json", cited),
        ):
            if values is not None and len(values) != item_count:
                errors.append(
                    f"context_array_length_mismatch:{location}:{field}:{len(values)}:{item_count}"
                )
                arrays_valid = False

    completeness = _value(row, "reviewer_a_completeness")
    usefulness = _value(row, "reviewer_a_usefulness")
    if completeness and completeness not in {"0", "1", "2"}:
        errors.append(f"invalid_context_score:{location}:reviewer_a_completeness:{completeness}")
    if usefulness and usefulness not in {"0", "1", "2"}:
        errors.append(f"invalid_context_score:{location}:reviewer_a_usefulness:{usefulness}")
    unsupported = _review_boolean(
        row,
        "reviewer_a_unsupported_claim_present",
        location=location,
        errors=errors,
    )

    return bool(
        grounded is not None
        and cited is not None
        and item_count is not None
        and arrays_valid
        and completeness in {"0", "1", "2"}
        and usefulness in {"0", "1", "2"}
        and unsupported is not None
    )


def _validate_ask_row(row: dict[str, Any], *, location: str, errors: list[str]) -> bool:
    model_abstained = _system_boolean(row, "model_abstained")
    if model_abstained is None:
        errors.append(f"invalid_system_model_abstained:{location}")
        return False

    answer_correct = _review_boolean(
        row, "reviewer_a_answer_correct", location=location, errors=errors
    )
    answer_supported = _review_boolean(
        row, "reviewer_a_answer_supported", location=location, errors=errors
    )
    citation_correct = _review_boolean(
        row, "reviewer_a_citation_correct", location=location, errors=errors
    )
    unsupported = _review_boolean(
        row,
        "reviewer_a_unsupported_claim_present",
        location=location,
        errors=errors,
    )
    abstention_correct = _review_boolean(
        row, "reviewer_a_abstention_correct", location=location, errors=errors
    )

    if model_abstained:
        answer_pair_consistent = (answer_correct is None) == (answer_supported is None)
        if not answer_pair_consistent:
            errors.append(f"abstention_answer_fields_must_be_both_blank_or_boolean:{location}")
        try:
            citation_count = int(_value(row, "citation_count") or 0)
        except ValueError:
            errors.append(f"invalid_system_citation_count:{location}")
            return False
        citation_complete = citation_count == 0 or citation_correct is not None
        return bool(
            answer_pair_consistent
            and citation_complete
            and unsupported is not None
            and abstention_correct is not None
        )

    if abstention_correct is not None:
        errors.append(f"non_abstention_requires_blank_abstention_judgment:{location}")
        return False
    return bool(
        answer_correct is not None
        and answer_supported is not None
        and citation_correct is not None
        and unsupported is not None
    )


def _csv_expected_value(value: Any) -> str:
    return "" if value is None else str(value)


def _validate_immutable_fields(
    file_name: str,
    rows: list[dict[str, str]],
    canonical_rows: list[dict[str, Any]],
    *,
    errors: list[str],
) -> None:
    current_by_id = {_value(row, "row_id"): row for row in rows}
    canonical_by_id = {_csv_expected_value(row.get("row_id")): row for row in canonical_rows}
    if set(current_by_id) != set(canonical_by_id):
        errors.append(f"immutable_row_ids_changed:{file_name}")
        return
    for row_id, current in current_by_id.items():
        canonical = canonical_by_id[row_id]
        for field, expected in canonical.items():
            if field.startswith("reviewer_a_") or field == "human_verification_status":
                continue
            if _value(current, field) != _csv_expected_value(expected).strip():
                errors.append(f"immutable_review_field_changed:{file_name}:{row_id}:{field}")


def validate_review_pack(
    review_root: Path,
    *,
    canonical_packs: dict[str, list[dict[str, Any]]] | None = None,
) -> ReviewPackValidation:
    errors: list[str] = []
    rows_by_file: dict[str, list[dict[str, str]]] = {}
    completion: dict[str, tuple[int, int]] = {}

    for file_name, expected_count in ACTIVE_REVIEW_COUNTS.items():
        path = review_root / file_name
        if not path.exists():
            errors.append(f"missing_review_csv:{file_name}")
            rows_by_file[file_name] = []
            continue
        fieldnames, rows = _read_csv(path)
        rows_by_file[file_name] = rows
        if not fieldnames or len(fieldnames) != len(set(fieldnames)):
            errors.append(f"invalid_csv_header:{file_name}")
        if len(rows) != expected_count:
            errors.append(f"wrong_single_reviewer_row_count:{file_name}:{len(rows)}")
        for line_number, row in enumerate(rows, start=2):
            if None in row:
                errors.append(f"invalid_csv_width:{file_name}:{line_number}")
        if canonical_packs is not None and file_name in canonical_packs:
            _validate_immutable_fields(
                file_name,
                rows,
                canonical_packs[file_name],
                errors=errors,
            )

    event_rows = rows_by_file.get("event-predictions-review.csv", [])
    answer_event_ids = {
        _value(row, "prediction_id")
        for row in event_rows
        if _value(row, "event_type") == "ANSWER"
    }
    validators = {
        "event-predictions-review.csv": lambda row, location: _validate_event_row(
            row, location=location, errors=errors
        ),
        "qa-links-review.csv": lambda row, location: _validate_qa_row(
            row,
            location=location,
            answer_event_ids=answer_event_ids,
            errors=errors,
        ),
        "context-recovery-review.csv": lambda row, location: _validate_context_row(
            row, location=location, errors=errors
        ),
        "ask-review.csv": lambda row, location: _validate_ask_row(
            row, location=location, errors=errors
        ),
    }
    labels = {
        "event-predictions-review.csv": "Event",
        "qa-links-review.csv": "QA",
        "context-recovery-review.csv": "Context",
        "ask-review.csv": "Ask",
    }

    reviewer_values_present = False
    all_rows: list[dict[str, str]] = []
    row_complete: dict[str, list[bool]] = {}
    for file_name, validator in validators.items():
        rows = rows_by_file.get(file_name, [])
        completed: list[bool] = []
        for line_number, row in enumerate(rows, start=2):
            location = f"{file_name}:{line_number}"
            completed.append(validator(row, location))
            reviewer_values_present = reviewer_values_present or any(
                _value(row, field)
                for field in row
                if field.startswith("reviewer_a_")
            )
        row_complete[file_name] = completed
        completion[labels[file_name]] = (
            sum(completed),
            ACTIVE_REVIEW_COUNTS[file_name],
        )
        all_rows.extend(rows)

    human_statuses = [_value(row, "human_verification_status") for row in all_rows]
    for index, status in enumerate(human_statuses):
        if status and status != HUMAN_VERIFIED:
            errors.append(f"invalid_human_verification_status:{index + 1}:{status}")
    any_human_confirmation = any(status == HUMAN_VERIFIED for status in human_statuses)
    all_human_confirmed = bool(human_statuses) and all(
        status == HUMAN_VERIFIED for status in human_statuses
    )
    if any_human_confirmation and not all_human_confirmed:
        errors.append("partial_human_verification_not_allowed")

    all_complete = all(done == required for done, required in completion.values())
    if all_human_confirmed and all_complete and not errors:
        review_state = HUMAN_VERIFIED
    elif reviewer_values_present or any_human_confirmation:
        review_state = AI_ASSISTED_PENDING_CONFIRMATION
        if all_human_confirmed:
            errors.append("human_verification_requires_complete_valid_review")
    else:
        review_state = PENDING_HUMAN_REVIEW

    return ReviewPackValidation(
        errors=errors,
        completion=completion,
        review_state=review_state,
        metrics_allowed=review_state == HUMAN_VERIFIED and all_complete and not errors,
    )
