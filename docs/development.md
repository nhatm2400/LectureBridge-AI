# Development

## Prerequisites

- Python 3.12
- `uv`
- Node.js 20+ and npm
- FFmpeg
- PostgreSQL and Redis only when exercising their optional integration paths

## Environment

Copy `.env.example` to the ignored `.env` file and replace placeholders locally:

```powershell
Copy-Item .env.example .env
```

The provider configuration is backend-only:

```dotenv
GEMINI_API_KEY=replace-with-your-local-key
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_MODEL=gemini-2.5-flash
```

Never commit `.env`, runtime data, database files, logs, provider caches, Terraform state, or generated frontend output. Do not place credentials in a `NEXT_PUBLIC_` variable.

## Backend

```powershell
uv sync --frozen --extra dev
uv run alembic upgrade head
uv run uvicorn src.backend.main:app --reload
```

The optional worker is started with:

```powershell
uv run python -m src.backend.scripts.run_worker
```

## Frontend

```powershell
Set-Location src/frontend
npm ci
npm run dev
```

`NEXT_PUBLIC_API_URL` is the browser-visible backend URL. `BACKEND_API_URL` is the internal URL used by Next.js server routes and rewrites.

## Containers

After creating `.env`, start the integration stack with:

```powershell
docker compose up --build
```

The backend image installs the locked Python environment from `pyproject.toml` and `uv.lock`. The frontend image uses Next.js standalone output. Local compose uses PostgreSQL, Redis, backend, worker, and frontend services.

## Verification

From the repository root:

```powershell
uv run python -m compileall -q src/backend evaluation tests
uv run python -m pytest -q
uv run alembic upgrade head
uv run alembic check
uv run python evaluation/scripts/run_evaluation.py
uv run python evaluation/scripts/evaluate_retrieval.py
uv run python evaluation/scripts/validate_artifacts.py
uv run python scripts/public_release_audit.py
uv run python -m pip check
```

Then:

```powershell
Set-Location src/frontend
npm run lint
npm run typecheck
npm run build
```

Real-provider validation is intentionally separate from regression tests. Follow [evaluation](evaluation.md) and run one explicitly selected sample at a time when quota is available.

## Deployment configuration

`.github/workflows/ci.yml` verifies backend, frontend, and both container builds. `.github/workflows/deploy.yml` builds the backend image and deploys it to the configured AWS target. `infra/terraform/` contains optional AWS resources and an example variable file; real Terraform variables and state must remain outside source control.
