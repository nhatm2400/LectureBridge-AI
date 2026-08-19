# Key metrics

## Verified engineering evidence

- Full-transcript processing has automated last-segment coverage.
- Evidence validation rejects unknown, empty, and out-of-range source IDs.
- Grounded Ask abstains before provider use when retrieval has no meaningful match.
- Current regression counts are recorded in `docs/repository-cleanup-report.md`.

## Model-quality evidence

Event quality, Q-A accuracy, context supported-claim rate, ask correctness/abstention, and citation correctness remain unavailable until a complete real-provider run and human review are complete. The corresponding values remain `null` in `evaluation/results/verified_metrics.json`; synthetic fixtures and partial failed-smoke metadata are not substitutes.
