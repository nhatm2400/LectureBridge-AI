# LectureBridge AI

> Captions make speech visible. LectureBridge turns the entire lecture into structured, interactive and accessible learning.

LectureBridge AI is an evidence-grounded lecture companion for learners who benefit from more structure than a caption stream alone provides, including Deaf and Hard-of-Hearing learners who choose text-first learning tools.

## Problem

Captions expose spoken words, but a long transcript can still hide the structure of a class: questions, later answers, examples, topic changes, important takeaways, and actionable moments. When attention shifts or context is missed, finding the relevant part again can take substantial effort. Learners have different needs and preferences, so LectureBridge offers reviewable, source-linked assistance rather than claiming one universal accessibility experience.

## What LectureBridge does

### Access

- Timestamped transcript and protected lecture playback
- Vietnamese, English, and code-switch transcript support
- Seekable captions and evidence links

### Context

- Semantic lecture events such as `TOPIC_CHANGE`, `QUESTION`, `ANSWER`, `EXAMPLE`, and `IMPORTANT`
- Question-to-answer relations and a navigable Semantic Timeline
- Context Recovery for “What happened while I was away?”
- Backend-validated evidence IDs and backend-derived timestamps

### Learning

- Grounded Ask Lecture answers restricted to the current lecture
- Source-aware summaries and highlights
- Evidence-linked flashcards and quizzes
- Explicit abstention when lecture evidence is insufficient

## Architecture

```text
video / timestamped transcript
  → canonical transcript segments
  → Lecture Intelligence
  → event + Q↔A + evidence graph
  → Semantic Timeline / Context Recovery / Grounded Ask
  → source-aware summaries / highlights / flashcards / quizzes
```

The Next.js client presents the learning experience. FastAPI is the authorization, evidence, and timestamp authority; SQLModel and Alembic persist application state. Provider responses are schema-validated, may reference only supplied source IDs, and cannot author trusted timestamps. See [architecture](docs/architecture.md), [privacy and security](docs/privacy-security.md), and [responsible AI](docs/responsible-ai.md).

## Evaluation

**Small synthetic human-verified evaluation** — three project-authored lectures covering Vietnamese, English, and Vietnamese-English code-switch content, evaluated with `gemini-3.5-flash-lite` and manually verified by one human reviewer.

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

Across 20 reviewed Event predictions, precision was 100% (20/20). On the explicitly full-recall VI/EN gold subset, recall was 91.7% (11/12), with one missed topic transition. The secondary reviewed precision/recall harmonic F1 is 95.7%; prediction precision and gold recall use different, explicitly reviewed populations.

Full methodology, expanded metrics, error analysis, and limitations are in [evaluation](docs/evaluation.md) and the [final evaluation report](evaluation/results/final-evaluation-report.md).

## Responsible AI

- **Source grounding:** accepted claims map to canonical lecture evidence.
- **Abstention:** unsupported current-lecture questions return an explicit fallback instead of a guess.
- **Human review:** authorized reviewers can confirm, correct, reject, and relink semantic output.
- **Privacy:** protected media and bounded provider payloads remain behind lesson authorization.
- **Transparency:** the UI exposes citations, timestamps, provenance, review state, and known limitations.
- **No sensitive inference:** LectureBridge does not infer disability, identity, emotion, or biometric attributes.
- **Provenance:** demo lectures and evaluation fixtures are project-authored synthetic material; third-party libraries retain their upstream licenses.

## Limitations

- The finalized evaluation contains only three project-authored synthetic lectures.
- The evaluation set is small and does not support a statistical-significance claim.
- One human reviewer verified the review pack, so no inter-rater reliability is reported.
- Results are specific to the evaluated model, provider-compatible endpoint, prompts, and synthetic fixtures.
- The evaluation does not establish universal effectiveness for Deaf and Hard-of-Hearing learners.
- Keyboard and screen-reader validation still requires a documented human session.
- Retrieval, confidence calibration, and production deployment controls have known limits documented in [evaluation](docs/evaluation.md), [accessibility](docs/accessibility.md), and [privacy and security](docs/privacy-security.md).

## Running locally

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

Automated regression uses fake or injected providers. Real-provider smoke is a separate, explicitly selected, quota-bounded workflow; see [evaluation](docs/evaluation.md).

## Deployment

- Production URL: **to be added after deployment validation**
- Backend deployment and optional AWS infrastructure are documented in [development](docs/development.md) and `infra/terraform/`.

No production URL is claimed in this repository snapshot.

## Repository layout

```text
.github/workflows/   Continuous integration and deployment workflows
demo/                Synthetic demo manifest and presenter script
docs/                Canonical product and engineering documentation
evaluation/          Synthetic fixtures, review packs, scripts, and verified results
infra/               Optional deployment infrastructure
scripts/             Demo, validation, and public-release utilities
src/backend/         FastAPI application, migrations, services, and tests
src/frontend/        Next.js application
submission/          Competition submission material
tests/               Cross-cutting backend and evaluation tests
```

## License and provenance

Project-authored assets, earlier prototype provenance, and third-party dependencies are documented in [provenance](docs/provenance.md) and [credits and attribution](submission/credits-and-attribution.md). No repository license has been selected; absent a license, normal copyright restrictions apply.
