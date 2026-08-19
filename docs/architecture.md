# Architecture

## System boundary

```text
Browser
  -> Next.js application
  -> FastAPI routers and authorization dependencies
  -> domain services and evidence validators
  -> SQLModel models and Alembic migrations
  -> private local storage or optional S3
  -> local FFmpeg/faster-whisper and configured AI provider
  -> optional Redis/RQ worker
```

FastAPI is the security and evidence authority. The browser never supplies canonical filesystem paths, event evidence, reviewer permissions, or trusted timestamps. Private media is served only after lesson-access checks.

## Backend boundaries

- `api/`: authentication, administration, courses, student learning, media ingest, lecture intelligence, review, grounding, and artifacts.
- `models/`: users, courses, lessons, progress, assessments, processing jobs, semantic events, event relations, review audits, settings, and deletion audits.
- `services/semantic_events/`: full-transcript chunking, structured extraction, validation, merge, and persistence.
- `services/question_answer_links/`: candidate construction, provider selection, relation validation, and review.
- `services/lecture_grounding/`: Context Recovery, Grounded Ask, evidence retrieval, provider schemas, and learning evidence.
- Other services own media processing, jobs, storage, rate limits, settings, observability, and optional queue integration.

Alembic history is retained in full, including migrations that create and later remove retired tables. Rewriting those files would break fresh-database reproducibility.

## Canonical evidence contract

The canonical transcript contains ordered segments with stable indices, text, and start/end times. Provider requests contain bounded text plus stable source IDs. Provider responses are treated as untrusted input.

```text
canonical segments
  -> bounded segment-aware evidence
  -> structured provider response
  -> schema and source-ID validation
  -> backend-derived timestamps
  -> guarded persistence or abstention
```

`LectureEvent` supports `QUESTION`, `ANSWER`, `EXAMPLE`, `TOPIC_CHANGE`, `IMPORTANT`, `ACTION`, `DEADLINE`, and `EXAM_CUE`. Reprocessing replaces only AI-created, unreviewed rows. Reviewed content and protected relations survive automated reruns.

Question-answer candidates must remain in the same lesson, point forward in time, fit the configured window, and respect topic boundaries. Context Recovery additionally supports validated `QUESTION_ANSWER` evidence and transcript fallback. Grounded Ask retrieves only from the current lecture and abstains before provider use when overlap is not meaningful.

Unknown IDs, unsupported types, invalid direction, missing evidence, foreign-lesson evidence, and provider-authored timestamps are rejected. Retries are bounded and usable reviewed data is preserved on provider failure.

## Human review and audit

Learners can inspect event type, confidence, inference status, provenance, and relation status. Course owners, instructors, and administrators can confirm, correct, reject, manually link, and reprocess lecture intelligence.

Review endpoints do not permit edits to canonical timestamps or source segment IDs. `LectureReviewAudit` records the actor, action, time, entity, provenance, and sanitized before/after state without transcript text, prompts, provider responses, credentials, or private answers.

## Learning artifacts

Summary, highlights, flashcards, and quizzes reuse the canonical evidence model. Invalid source IDs are dropped before persistence. A stable source fingerprint allows identical artifacts to be reused while preserving flashcard progress and quiz attempts.

## HTTP surface

All product APIs use the `/api` prefix. Major groups are:

| Area | Routes |
|---|---|
| Operations | `/api/health`, `/api/health/deep`, `/api/metrics` |
| Authentication | `/api/auth/*` |
| Courses and lessons | `/api/courses/*` |
| Student learning | `/api/student/*` |
| Administration | `/api/admin/*` |
| Media and transcript | `/api/videos/*` |
| Events and relations | `/api/videos/{id}/events*`, `/event-relations*` |
| Grounding | `/api/videos/{id}/context-recovery`, `/ask` |
| Learning artifacts | `/api/videos/{id}/summary`, `/highlights`, `/flashcards`, `/artifacts/status` |

The exact runtime contract is available from FastAPI at `/docs` and `/openapi.json`.

## Frontend surface

The Next.js application contains the landing page, login/registration, the administrative workspace, student course/library/review/settings/upload/quiz flows, lecture processing, and the protected lecture player. The lecture player hosts transcript/caption controls, Semantic Timeline, Context Recovery, Grounded Ask, and source-aware study tools.

Client wrappers in `src/frontend/lib/api.ts` correspond to active UI consumers. Server-side video proxy routes use `BACKEND_API_URL`; browser requests use `NEXT_PUBLIC_API_URL`.

## Provider and deployment

Provider protocols remain transport-independent. The current transport uses the OpenAI Python SDK against Gemini's OpenAI-compatible endpoint. `GEMINI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` are backend-only settings.

SQLite is suitable for isolated local tests. PostgreSQL is the production database. Redis/RQ is optional for queued processing, and S3 is optional for private object storage. Docker Compose supports local integration; Terraform describes the optional AWS deployment path.
