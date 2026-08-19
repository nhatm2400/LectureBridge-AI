# LectureBridge Evaluation

**SYNTHETIC — NOT MODEL QUALITY EVIDENCE**

- `data/transcripts/`: project-authored Vietnamese, English, and code-switch fixtures.
- `data/gold/`: draft event annotations requiring human review.
- `review_pack/`: canonical CSV review packs plus source JSON templates; all human columns remain blank until real review.
- `guidelines/`: annotation instructions.
- `scripts/`: reproducible metrics, retrieval checks, and bounded provider smoke.
- `results/`: reproducible current outputs; transient troubleshooting snapshots are excluded.

```powershell
uv run python evaluation/scripts/run_evaluation.py
uv run python evaluation/scripts/evaluate_retrieval.py
uv run python evaluation/scripts/run_real_provider_smoke.py
uv run python evaluation/scripts/validate_artifacts.py
```

Gemini is accessed through its OpenAI-compatible endpoint. Model discovery must pass before smoke execution, and one sample must be selected explicitly. This snapshot contains no passing final smoke artifact. Null quality metrics are intentional until a complete real-provider run and required human reviews exist.
