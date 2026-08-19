# Human reviewer instructions

Status: **PENDING_HUMAN_REVIEW**

The inputs are project-authored synthetic lectures. They are not classroom recordings and are not model-quality evidence by themselves. The latest Gemini smoke failed; therefore provider predictions were not exported into the review CSVs. `event-predictions-review.csv` intentionally contains headers only, and the other prediction fields remain blank. Do not review or score a blank provider output.

## Before review

1. Resolve the real-provider smoke blocker and rerun the normal harness.
2. Export only the resulting real-provider predictions into the provider columns.
3. Keep every `reviewer_a_*` and `reviewer_b_*` field blank until the named human performs the review.

## Reviewer A

- Review every predicted event for precision using `CORRECT`, `PARTIALLY_CORRECT`, or `INCORRECT`.
- Fully annotate the recall subset marked `full_recall_subset=true`.
- Review every Q-to-A row, Context Recovery window, and Grounded Ask case.
- Record a name/identifier and review date in the final handoff record; do not use `AUTHOR_DRAFT` as a human identity.

## Reviewer B

- Independently select and review 20–30% of each applicable pack.
- Set `reviewer_b_selected` only for the independently chosen subset.
- Do not inspect Reviewer A's judgments before completing the independent pass.
- Record disagreements for adjudication; do not silently overwrite Reviewer A.

## Scales

- Event precision: `CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`.
- Context completeness/usefulness: `0` fail, `1` partial, `2` good.
- Ask answer correctness: `0` incorrect, `1` partial, `2` correct.
- Citation correctness, retrieval hit, and claim support: explicit boolean judgments.

Only a human may change the pack status to `HUMAN_VERIFIED`. Metrics must not be computed from blank fields, author drafts, fake-provider outputs, or partial failed-smoke metadata.
