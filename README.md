# LectureBridge AI

LectureBridge AI turns recorded lectures into timestamped, evidence-grounded learning material. It is designed for learners who need more structure than a caption stream alone provides, with particular attention to deaf and hard-of-hearing students.

## What it does

- Protects uploaded lecture media behind authenticated, role-aware APIs.
- Stores a canonical timestamped transcript with Vietnamese and English views.
- Extracts semantic lecture events across the full transcript.
- Links questions to later answers within bounded evidence windows.
- Lets authorized reviewers confirm, correct, reject, and relink AI output.
- Recovers recent context and answers current-lecture questions with seekable citations.
- Generates source-aware summaries, highlights, flashcards, and quizzes.
- Separates synthetic engineering checks from real-provider and human-reviewed quality evidence.

## Architecture

```text
Next.js client
  -> authenticated FastAPI API
  -> domain and evidence-validation services
  -> SQLModel/Alembic persistence
  -> private local storage or optional S3
  -> local speech recognition and configured AI provider
  -> optional Redis/RQ worker
```

The backend is the authorization, evidence, and timestamp authority. Provider output may identify only supplied source IDs; the backend validates those IDs and derives citations from canonical transcript segments. Unsupported answers abstain.

See [architecture](docs/architecture.md), [privacy and security](docs/privacy-security.md), and [responsible AI](docs/responsible-ai.md).

## Local development

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 20+, npm, and FFmpeg.

```powershell
Copy-Item .env.example .env
uv sync --frozen --extra dev
uv run alembic upgrade head
uv run uvicorn src.backend.main:app --reload
```

In another terminal:

```powershell
Set-Location src/frontend
npm ci
npm run dev
```

Keep the Gemini key only in the ignored local `.env` file or a deployment secret store. Never expose it through a `NEXT_PUBLIC_` variable. Detailed configuration and container instructions are in [development](docs/development.md).

## Quality gates

```powershell
uv run python -m compileall -q src/backend evaluation tests
uv run python -m pytest -q
uv run alembic upgrade head
uv run alembic check
uv run python evaluation/scripts/run_evaluation.py
uv run python evaluation/scripts/evaluate_retrieval.py
uv run python evaluation/scripts/validate_artifacts.py
uv run python scripts/public_release_audit.py

Set-Location src/frontend
npm run lint
npm run typecheck
npm run build
```

Automated tests use fake or injected providers. The real-provider smoke is a separate, explicitly selected and quota-bounded command; see [evaluation](docs/evaluation.md).

## Repository layout

```text
.github/workflows/   Continuous integration and AWS deployment workflow
demo/                Synthetic demo manifest and instructions
docs/                Canonical product and engineering documentation
evaluation/          Synthetic fixtures, review packs, scripts, and results
infra/               Optional AWS Terraform and bootstrap configuration
scripts/             Demo, smoke, and public-release utilities
src/backend/         FastAPI application, migrations, services, and tests
src/frontend/        Next.js application
submission/          Current competition submission material
tests/               Cross-cutting backend and evaluation tests
```

## Current evidence boundary

The repository demonstrates engineering behavior: validation, retry bounds, authorization, persistence, abstention, and reproducible synthetic evaluation. Model-quality metrics remain unavailable until a complete real-provider prediction export and required human review exist. Manual keyboard and screen-reader validation also remains a human task.

## License and provenance

Project-authored assets and third-party dependencies are documented in [provenance](docs/provenance.md). No repository license has been selected; absent a license, normal copyright restrictions apply.
