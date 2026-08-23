# LectureBridge Human Review Guide

Status: **PENDING_HUMAN_REVIEW**

## Evaluation design

One human reviewer reviews 100% of the 47-row evaluation set: 20 Event, 3 Q↔A, 9 Context Recovery, and 15 Grounded Ask rows.

AI-assisted review suggestions were generated against canonical source evidence and subsequently require manual human verification.

The review states are:

- `PENDING_HUMAN_REVIEW`: Reviewer A suggestions may still be empty.
- `AI_ASSISTED_PENDING_CONFIRMATION`: Reviewer A suggestions may be partially or fully populated and structurally validated, but remain provisional.
- `HUMAN_VERIFIED`: every required row is structurally complete and a human has explicitly confirmed every row by setting `human_verification_status=HUMAN_VERIFIED`. Completion alone never implies this state.

The required workflow is: AI-assisted suggestion → human checks every row → human corrects disagreements → explicit human confirmation → `HUMAN_VERIFIED` → verified metrics.

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

### Reviewer A CSV contract

- `reviewer_a_judgment`: `CORRECT`, `PARTIALLY_CORRECT`, `INCORRECT`, `MISSING`, or `DUPLICATE`.
- `reviewer_a_corrected_type`: blank, or one canonical type: `QUESTION`, `ANSWER`, `EXAMPLE`, `TOPIC_CHANGE`, `IMPORTANT`, `ACTION`, `DEADLINE`, or `EXAM_CUE`. Keep it blank when the predicted type is correct.
- `reviewer_a_timestamp_judgment`: `CORRECT` or `INCORRECT`. Active prediction rows have canonical timestamps, so this field is required for a complete row; blank is allowed while saving partial work.
- `reviewer_a_notes`: blank or free UTF-8 text.

## Q↔A review

- A link is correct only when the predicted answer responds to the predicted question and both are supported by their cited lecture evidence.
- Mark `should_have_no_answer` when no candidate answer in the lecture actually answers the question.
- Do not infer correctness merely because an author-draft pair exists.

Use lowercase `true` and `false` for Reviewer A Boolean CSV fields. Blank means genuinely not applicable or not yet reviewed; do not use `True`, `False`, `TRUE`, `FALSE`, `1`, `0`, `yes`, `no`, or `N/A`.

- Correct link: `reviewer_a_link_correct=true`, corrected answer ID blank, and `reviewer_a_should_have_no_answer=false`.
- Wrong link with another answer: link false, corrected answer event ID populated, and should-have-no-answer false.
- No answer exists: link false, corrected answer ID blank, and should-have-no-answer true.

## Context Recovery review

- **Grounded:** each claim is entailed or directly supported by its cited events/segments.
- **Citation support:** cited evidence specifically supports the associated claim, not merely the general topic.
- **Completeness:** `0` misses essential context, `1` covers part of it, `2` covers the important context for the window.
- **Usefulness:** `0` unusable/misleading, `1` partly useful, `2` clear and useful for resuming the lecture.
- Flag any unsupported claim even if the rest of the response is useful.

The two Reviewer A claim fields must be JSON Boolean arrays using lowercase JSON literals, for example `[true,true,false]`. Each array length must exactly equal the number of entries in `model_context_items`; `null` is not accepted. Completeness and usefulness are exact integer literals `0`, `1`, or `2`.

## Grounded Ask review

- Judge answer correctness and support separately. Retrieval success is not answer correctness.
- A citation is correct only if its mapped evidence and backend timestamp support the answer claim.
- Flag unsupported claims even when the overall answer is plausible.
- An abstention is correct only when the available lecture evidence is insufficient.
- For a supported question where the model abstains despite sufficient evidence, set `abstention_correct=false`.
- Do not automatically assume the fixture expectation is correct; decide from source evidence.

For a non-abstained answer, answer correctness, answer support, citation correctness, and unsupported-claim presence require lowercase Boolean judgments; abstention correctness remains blank. For an abstention with no substantive answer, answer correctness/support and citation correctness may remain blank when not applicable, but abstention correctness and unsupported-claim presence must be `true` or `false`.

## Completion and metrics gate

- Reviewer A must complete all 47 required rows.
- Do not calculate aggregate metrics from partially reviewed rows.
- Do not change prompts, rerun, or tune the model based on review outcomes before the evaluation is reported.
- Partial AI-assisted suggestions are valid and must not unlock metrics.
- Verified metrics remain unavailable until explicit human confirmation, structural completion of all 47 rows, and a passing evaluation validator.

## Limitation

This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.
