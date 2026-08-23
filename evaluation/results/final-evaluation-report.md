# LectureBridge Final Evaluation Report

Status: **HUMAN_VERIFIED**

## A. Evaluation Design

- Three project-authored synthetic lectures covering Vietnamese, English, and Vietnamese-English code-switch content.
- Final evaluated model: `gemini-3.5-flash-lite` through the repository's Gemini OpenAI-compatible provider abstraction.
- One human reviewer reviewed 100% of the 47 prediction rows and confirmed the missing gold Event.
- AI-assisted review suggestions were generated against canonical source evidence and subsequently manually verified by one human reviewer.
- This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.

## B. Event Detection

Prediction precision and gold-event recall are reported separately because the recall gold sheet marks only VI and EN as full-recall subsets.

- Reviewed predictions: 20.
- Strictly correct predictions: 20.
- False-positive predictions: 0.
- Strict prediction precision: 1.0.
- Full-recall gold Events: 12.
- Matched gold Events: 11.
- False-negative gold Events: 1.
- Gold-event recall: 0.916667.
- Reviewed precision/recall harmonic F1: 0.956522.
- Type correctness: 20/20 (1.0).
- Timestamp correctness: 20/20 (1.0).
- `en-topic-serializable` is the confirmed false negative at segment 10, 600-660 seconds; no prediction was fabricated.

## C. Q-to-A Linking

- Correct links: 3/3.
- Link accuracy: 1.0.
- Corrected-link count: 0.
- No-answer cases: 0; no-answer accuracy is not applicable when the denominator is zero.

## D. Context Recovery

- Grounded claims: 51/51 (1.0).
- Citation-supported claims: 51/51 (1.0).
- Unsupported-claim rate: 0.0.
- Completeness distribution: {"0": 0, "1": 1, "2": 8}; mean 1.888889.
- Usefulness distribution: {"0": 0, "1": 2, "2": 7}; mean 1.777778.
- Confirmed lower-quality rows remain unchanged: `cs-topic` completeness 2/usefulness 1; `cs-injection` completeness 1/usefulness 1.

## E. Grounded Ask

- Answer correctness: 9/9 (1.0).
- Answer support: 9/9 (1.0).
- Citation correctness: 8/9 (0.888889).
- Unsupported-claim rate: 0.0.
- Abstention correctness: 5/6 (0.833333).
- Supported-question success: 9/10 (0.9).
- Unsupported-question abstention accuracy: 5/5 (1.0).

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
- This evaluation uses one human reviewer. Therefore, no inter-rater agreement or independent secondary-review reliability measure is reported.

## H. Reproducibility

- Model: `gemini-3.5-flash-lite`.
- Canonical transcripts: `evaluation/data/transcripts/`.
- Review packs: `evaluation/review_pack/event-predictions-review.csv`, `qa-links-review.csv`, `context-recovery-review.csv`, `ask-review.csv`, and `event-recall-gold-review.csv`.
- Review guide: `evaluation/guidelines/human-review-guide.md`.
- Verified metrics: `evaluation/results/verified_metrics.json`.
