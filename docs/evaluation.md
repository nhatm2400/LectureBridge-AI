# Evaluation

## Evaluation design

LectureBridge has a finalized **small synthetic human-verified evaluation** built from three project-authored lecture transcripts:

- Vietnamese
- English
- Vietnamese-English code-switch

The final evaluated model is `gemini-3.5-flash-lite` through the repository's Gemini OpenAI-compatible provider abstraction. AI-assisted review suggestions were generated against canonical source evidence and subsequently manually verified by one human reviewer.

This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.

Canonical sources:

- [Verified metrics JSON](../evaluation/results/verified_metrics.json)
- [Final evaluation report](../evaluation/results/final-evaluation-report.md)
- [Canonical transcript fixtures](../evaluation/data/transcripts/)
- [Human review guide](../evaluation/guidelines/human-review-guide.md)

## Headline results

| Component | Human-verified result |
|---|---:|
| Event precision | 20/20 (100%) |
| Event recall | 11/12 (91.7%, VI/EN full-recall subset) |
| Q↔A linking | 3/3 |
| Context grounding | 51/51 |
| Context citation support | 51/51 |
| Ask answer correctness | 9/9 answered cases |
| Ask citation correctness | 8/9 |
| Unsupported-question abstention | 5/5 |

## Event detection

Across 20 reviewed Event predictions, precision was 100% (20/20). On the explicitly full-recall VI/EN gold subset, recall was 91.7% (11/12), with one missed topic transition.

- True-positive reviewed predictions: 20
- False-positive reviewed predictions: 0
- Full-recall gold matches: 11
- False-negative gold events: 1
- Reviewed prediction precision: 100%
- Full-recall gold recall: 91.67%
- Reviewed precision/recall harmonic F1: 95.65%
- Type correctness: 20/20
- Timestamp correctness: 20/20

Prediction precision and gold recall use different, explicitly reviewed populations. The harmonic F1 is secondary and combines those two transparently reported values; it is not a single-population benchmark. The confirmed false negative is `en-topic-serializable`, a missed topic transition.

## Q↔A linking

- Correct links: 3/3
- Link accuracy: 100%
- Corrected-link count: 0
- No-answer cases: 0, so no-answer accuracy is not applicable

The denominator is limited to the three reviewed Q↔A cases.

## Context Recovery

Nine Context Recovery windows contained 51 reviewed Context items.

- Grounded claims: 51/51
- Citation-supported claims: 51/51
- Unsupported-claim rate: 0%
- Completeness distribution: score 0 = 0, score 1 = 1, score 2 = 8
- Mean completeness: 1.888889/2
- Usefulness distribution: score 0 = 0, score 1 = 2, score 2 = 7
- Mean usefulness: 1.777778/2

The lower-quality cases remain part of the result: `cs-topic` was complete but redundant (completeness 2, usefulness 1), while `cs-injection` omitted important item-level coverage (completeness 1, usefulness 1).

## Grounded Ask

Fifteen Ask cases included ten supported and five unsupported questions.

- Answer correctness: 9/9 answered cases
- Answer support: 9/9 answered cases
- Citation correctness: 8/9
- Unsupported-claim rate: 0%
- Abstention correctness: 5/6
- Supported-question success: 9/10
- Unsupported-question abstention accuracy: 5/5

`vi-paraphrase` was correct and supported but had an incorrect citation judgment. `cs-paraphrase` abstained even though sufficient lecture evidence existed.

## Error analysis

The public result retains genuine weaknesses rather than hiding them:

- Event recall missed `en-topic-serializable`.
- `vi-paraphrase` exposed an Ask citation weakness.
- `cs-paraphrase` exposed an incorrect abstention.
- `cs-topic` exposed Context redundancy.
- `cs-injection` exposed Context incompleteness.

## Engineering evidence and quality evidence

Fake providers remain useful for regression tests of parsing, retries, source validation, authorization, persistence, and abstention. They are not model-quality evidence. The public quality numbers above come only from the finalized real-provider prediction population and the explicitly human-verified review artifacts.

Real-provider checks are intentionally separate from automated regression and are quota-bounded. No provider call is required to reproduce metrics from the finalized review pack.

## Reproduce the finalized metrics

From the repository root:

```powershell
uv run python evaluation/scripts/run_evaluation.py
uv run python evaluation/scripts/validate_artifacts.py
```

`run_evaluation.py` derives metrics only when every required review row is complete and explicitly marked `HUMAN_VERIFIED`. `validate_artifacts.py` rejects invalid schemas, premature metrics, partial verification, and inconsistent finalized artifacts.

## Responsible interpretation

- These are project-authored synthetic lectures, not representative classroom recordings.
- Three lectures and one reviewer form a small evaluation set.
- No statistical-significance claim is made.
- Results are specific to the evaluated model, provider-compatible endpoint, prompts, and fixtures.
- The results do not establish universal effectiveness for Deaf and Hard-of-Hearing learners.
- No inter-rater reliability is reported because only one human reviewer completed final verification.
- Accessibility conformance and learning outcomes require separate user-centered validation.

## Data and review layout

- `evaluation/data/transcripts/`: canonical synthetic transcript fixtures
- `evaluation/data/gold/`: project-authored gold references used by the review workflow
- `evaluation/review_pack/`: finalized human-review CSVs
- `evaluation/guidelines/`: annotation and review instructions
- `evaluation/results/`: verified metrics, final report, and reproducibility artifacts
