# Human reviewer instructions

Status: **PENDING_HUMAN_REVIEW**

The packs contain real-provider predictions from `gemini-3.5-flash-lite` over project-authored synthetic lectures. Predictions include semantic mistakes and abstentions; technical eligibility does not imply model quality.

## Single-reviewer design

- Reviewer A is the only human reviewer and reviews every row in all four prediction packs.
- Required completion is 20/20 Event, 3/3 Q↔A, 9/9 Context Recovery, and 15/15 Grounded Ask rows.
- Use only source excerpts, canonical evidence IDs, and backend timestamps.
- Keep author drafts and automated expectations as unverified references.
- Do not use smoke status, model confidence, fixture expectation alone, or retrieval score alone as proof of correctness.
- Compatibility-only Reviewer B and adjudication columns are marked `UNUSED_SINGLE_REVIEWER` and are excluded from validation and metrics.
- Aggregate metrics remain unavailable until all 47 Reviewer A rows are complete and structurally valid.

## AI-assisted suggestions and confirmation

AI-assisted review suggestions were generated against canonical source evidence and subsequently require manual human verification.

AI suggestions are provisional. The workflow is: AI-assisted suggestion → human checks every row → human corrects disagreements → explicit human confirmation → `HUMAN_VERIFIED` → verified metrics. Never treat populated Reviewer A cells or a passing validator as human confirmation.

Canonical CSV literals:

- Event judgment: `CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `MISSING`, or `DUPLICATE`.
- Timestamp judgment: `CORRECT` or `INCORRECT`.
- Reviewer Boolean: lowercase `true` or `false`; blank only for a legitimate N/A or incomplete field.
- Context claim judgments: JSON Boolean arrays whose length equals `model_context_items`.
- Context completeness/usefulness: `0`, `1`, or `2`.

Save partial suggestions without setting `human_verification_status`. After manually checking and correcting all 47 rows, the human owner explicitly sets every active row's `human_verification_status` to `HUMAN_VERIFIED`. No tool may infer this state from completion alone.

## Limitation

This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.
