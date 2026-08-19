# Evaluation

## Evidence policy

Everything under `evaluation/data/` is project-authored synthetic material unless explicitly marked otherwise.

**SYNTHETIC — NOT MODEL QUALITY EVIDENCE**

Fake providers verify parsing, retry bounds, source validation, abstention, authorization, and persistence. They do not establish model quality. Quality metrics remain `null` until complete real-provider predictions and the required human reviews exist.

## Layout

- `data/transcripts/`: Vietnamese, English, and Vietnamese-English code-switch fixtures.
- `data/gold/`: draft event annotations awaiting human verification.
- `guidelines/`: event annotation rules.
- `review_pack/`: CSV packs, JSON templates, and reviewer instructions.
- `scripts/`: metric, retrieval, artifact-validation, and real-provider smoke tools.
- `results/`: reproducible current outputs, not troubleshooting snapshots.

## Reproducible commands

```powershell
uv run python evaluation/scripts/run_evaluation.py
uv run python evaluation/scripts/evaluate_retrieval.py
uv run python evaluation/scripts/validate_artifacts.py
```

`run_evaluation.py` writes the current metric status and explicit blockers. `evaluate_retrieval.py` is a small lexical-retrieval engineering diagnostic, not human gold. `validate_artifacts.py` checks JSON/CSV structure and prevents unverified reviewer fields from being presented as completed review.

## Real-provider smoke

The smoke harness uses Gemini through its OpenAI-compatible endpoint, verifies the configured model first, disables SDK retries, and applies bounded per-stage pacing/backoff. It requires one explicitly selected sample:

```powershell
uv run python evaluation/scripts/run_real_provider_smoke.py `
  --sample synthetic-en-transactions `
  --stop-after full
```

The harness must not be part of normal automated regression and must not be spam-rerun under a limited quota. A failed or partial troubleshooting artifact is not retained as final evaluation evidence. This repository snapshot contains no passing final smoke artifact, so the aggregate evaluation status is `NOT_RUN` for that gate.

## Human review

1. Export complete real-provider predictions only after a passing smoke.
2. Reviewer A completes every required row.
3. Reviewer B independently reviews a documented subset.
4. Resolve disagreements without overwriting either original judgment.
5. Mark the source templates `HUMAN_VERIFIED` only after completion.
6. Regenerate metrics; never replace missing values with fixture-derived or invented scores.

Completed private reviews should remain outside source control when they contain sensitive lecture material.

## Prompt-injection boundary

Lecture evidence is delimited as untrusted data. Provider instructions prohibit executing transcript-embedded instructions, responses may use only supplied evidence IDs, and the backend revalidates IDs and support. Tests cover unknown-ID rejection and unsupported-answer abstention. These controls are defense in depth, not a guarantee of perfect model security.

## Current limitations

- The synthetic set is small and does not represent classroom diversity.
- Event gold is an author draft, not completed human gold.
- Retrieval is lexical and current-lecture-only.
- Confidence is heuristic and uncalibrated.
- Accessibility and learning effectiveness require human evaluation.
