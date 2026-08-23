# LectureBridge Local Release Validation

Validation date: 2026-08-23 (Asia/Bangkok)  
Platform: Windows, PowerShell, no Docker  
Baseline: `main` / `29c967a` (`main...origin/main`)  
Scope: local release validation only; no Vercel deployment and no real-provider evaluation rerun.

This report covers the validated working tree after the minimal blocking fixes listed in section P. Those fixes are not yet committed or pushed, so another checkout of `origin/main` will not contain them until that release-hygiene step is completed.

| Area | Status | Evidence/Note |
|---|---|---|
| Environment and dependencies | PASS | Python 3.12.10, Node 24.11.0, npm 11.6.1, FFmpeg/ffprobe 7.1.1; `pip check` and `npm ls --depth=0` passed. |
| Backend regression | PASS | Full repository suite: 138 passed. Backend-only gate: 115 passed. |
| Frontend static gates | PASS | ESLint, TypeScript, and final Next.js production build passed; 13 pages generated. |
| Evaluation integrity | PASS | 23 evaluation tests passed; artifact validation PASS; state remains `HUMAN_VERIFIED`, 47/47. |
| Database and migrations | PASS | Existing SQLite DB and a fresh isolated SQLite DB both reached Alembic head `a8b9c0d1e2f3`; no new upgrade operations. |
| Backend runtime | PASS | Real FastAPI app stayed running on 127.0.0.1:8000; health returned 200. |
| Frontend runtime | PASS | Real Next.js dev server stayed running on 127.0.0.1:3000; backend proxy health returned 200. |
| Authentication | PASS | Login/cookie/refresh/logout and protected API behavior passed; unauthenticated UI guard was corrected and revalidated. |
| Media and transcription | PASS | Local upload, ownership, protected Range playback, VTT, short Faster-Whisper transcription, timestamps, and completed job passed. |
| Lecture Intelligence | PASS | Six canonical Events, validated sources/backend timestamps, and one Q-to-A relation persisted and loaded through the real API. |
| Live Context Recovery | PASS | One Gemini Flash-Lite request parsed and grounded successfully; no 429/provider error. |
| Live Grounded Ask | PASS | One supported answer returned three citations; unsupported question abstained with zero citations and no provider call. |
| Tracked-file secret scan | PASS | 233 tracked files scanned; zero secret/private-key/credential findings; `.env` is ignored and untracked. |
| Full visual/assistive-technology session | NOT_TESTED | Chrome headless checks passed, but a human keyboard, screen-reader, responsive-layout, and complete click-through session is still required. |

# A. Environment

| Item | Observed value |
|---|---|
| Python in project venv | 3.12.10 |
| Required Python | 3.12 (`.python-version`; project requires `>=3.12`) |
| `uv` | Unavailable on this machine |
| Node / npm | 24.11.0 / 11.6.1 |
| Frontend package manager | npm with `src/frontend/package-lock.json` (lockfile v3) |
| FFmpeg / ffprobe | 7.1.1 |
| Database | SQLite, `data/lecture_platform.db` |
| Storage | Local filesystem, `data/uploads`; S3 disabled |
| Queue | FastAPI background task path; Redis/RQ disabled |
| Transcription | Local Faster-Whisper, model size `base` |
| AI provider | Gemini OpenAI-compatible endpoint |
| AI model | `gemini-3.5-flash-lite` |
| Backend / frontend ports | 8000 / 3000 |

`.env` exists locally, was not printed, is excluded by `.gitignore`, and is not tracked. No `vercel.json` or other Vercel-specific configuration is present in this snapshot; the frontend is configured for Next.js standalone output and the repository also contains optional AWS infrastructure.

For a repeatable full-feature local run, configure `DATABASE_URL`, a stable `SECRET_KEY`, local CORS origins, `NEXT_PUBLIC_API_URL`, `BACKEND_API_URL`, `GEMINI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL`. Development defaults exist for SQLite, local origins, and several non-secret settings, but the Gemini key is required for live intelligence calls. Optional settings include PostgreSQL variables, Redis/RQ, S3/AWS credentials, admin emails, public-role registration, logging, upload limits, and AI tuning/rate-limit controls.

# B. Commands Used

Because `uv` is unavailable but the existing venv is Python 3.12, validation used the direct interpreter without Docker:

```powershell
.\.venv\Scripts\python.exe --version
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m pytest -q --basetemp .pytest_cache\release-validation\all-tests-final
.\.venv\Scripts\python.exe -m compileall -q src\backend evaluation tests
.\.venv\Scripts\python.exe evaluation\scripts\validate_artifacts.py
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic heads
.\.venv\Scripts\python.exe -m alembic check
.\.venv\Scripts\python.exe -m uvicorn src.backend.main:app --host 127.0.0.1 --port 8000

Set-Location src\frontend
npm.cmd ci
npm.cmd ls --depth=0
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev -- --hostname 127.0.0.1 --port 3000
```

A fresh isolated validation DB was upgraded with a process-only `DATABASE_URL`; the user's database was never reset or deleted. Chrome headless was used only against localhost for DOM/hydration checks.

# C. Backend Tests

- Full repository test discovery: **138 passed in 30.10s**.
- Backend-focused suite after the provider fix: **115 passed in 37.39s**.
- Targeted Context/Ask provider-error modules: **29 passed in 16.20s**.
- `pip check`: no broken requirements.
- Python compile/import validation: PASS.
- Automated tests continued to use fake/injected providers.

An initial test invocation encountered a Windows temporary-directory permission issue and an unmigrated local DB. Re-running with a repository-local `--basetemp` and applying the existing migrations resolved setup only; no test expectation was weakened.

# D. Frontend Tests

- `npm ci`: dependency tree restored from the canonical lockfile.
- `npm ls --depth=0`: PASS.
- `npm run lint`: PASS after all fixes.
- `npm run typecheck`: PASS after all fixes.
- `npm run build`: PASS after all fixes.
- Next.js 16.2.3 generated all 13 active pages plus the two local media route handlers.

# E. Evaluation Integrity

- Evaluation tests: **23 passed**.
- `evaluation/scripts/validate_artifacts.py`: PASS, `error_count=0`.
- Review state: `HUMAN_VERIFIED`.
- Validated rows: Event 20/20, QA 3/3, Context 9/9, Ask 15/15, total 47/47.
- No file under `evaluation/` changed during this validation.
- `verified_metrics.json` SHA-256: `53bbf4c379cf9a5293ee123f9c62a458a2ae38b95023158828b2ea531e4761d5`.
- `final-evaluation-report.md` SHA-256: `c7367f043c03175cfac33eef7592c7aed53cca639dfc557fea613f6c8aa17100`.

# F. Database/Migrations

- Active local database: SQLite at `data/lecture_platform.db`.
- Existing DB current revision: `a8b9c0d1e2f3 (head)`.
- Alembic head: `a8b9c0d1e2f3 (head)`.
- `alembic check`: no new upgrade operations detected.
- A fresh isolated 323,584-byte SQLite DB upgraded from empty to the same head and passed `alembic check`.
- No existing database was dropped, reset, or destructively migrated.

# G. Backend Runtime

- Real application command: `.\.venv\Scripts\python.exe -m uvicorn src.backend.main:app --host 127.0.0.1 --port 8000`.
- Startup completed and the process remained listening.
- `/api/health`: HTTP 200.
- Deep health reported a healthy database.
- OpenAPI contained health, auth, video, transcript, event, relation, review, Context, Ask, summary, highlight, flashcard, artifact, and stream APIs.
- Protected APIs returned 401 without a session.
- All runtime servers were stopped after validation.

# H. Frontend Runtime

- Real requested dev command: `npm.cmd run dev -- --hostname 127.0.0.1 --port 3000`.
- Local URL: `http://127.0.0.1:3000` (use `http://localhost:3000` with the default localhost backend URL so browser cookies share the same hostname).
- The real backend was reached through `/api/health`, auth, lecture data, and protected media routes; no mock API or deployed URL was used.
- All 13 active production page routes returned 200 with LectureBridge branding and no EduSign/A20 marker.
- Chrome headless loaded landing and registration pages with non-empty hydrated DOM, no hydration error, and no uncaught console error.
- Direct unauthenticated navigation to a lecture now redirects to login before lecture data effects mount.
- Static literal navigation targets map to active routes or existing page anchors. The two former `href="#"` legal labels are no longer dead links.

# I. Auth

- Registration and login: HTTP 200.
- Login body exposed no access token.
- Session cookie: HttpOnly, `SameSite=lax`, `Path=/`.
- A newly constructed client using the cookie successfully called `/api/auth/me`, validating refresh/session persistence.
- Logout returned 200; `/api/auth/me` then returned 401.
- Protected APIs reject anonymous requests.
- Backend auth accepts Bearer or cookie only; query-string JWT is not read, and regression coverage rejects query-token access.
- Frontend persistence contains UI/user state but no JWT or API token.
- The centralized shell now validates `/api/auth/me` before mounting protected children.

# J. Media

- Local mode uses the filesystem; S3 fallback was not configured.
- One controlled 11-second, 144,849-byte MP4 was uploaded through the real API.
- Ownership/listing and media registration passed.
- Enrolled authenticated playback through Next returned HTTP 206, a valid `Content-Range`, and the requested 1,024 bytes.
- Subtitle route returned HTTP 200, `text/vtt`, and a valid `WEBVTT` header.
- Anonymous media access returned 401.
- A catch-all rewrite that previously bypassed the protected Next media handler was minimally corrected and revalidated.

# K. Transcription

- Local Faster-Whisper `base` was used; it was not replaced with another ASR provider.
- The controlled source was the official short Whisper JFK fixture converted to MP4 for this validation only.
- The model cache had to be downloaded once; the first offline-cache attempt failed cleanly before transcription.
- Final processing job: `completed`, progress 100, one attempt.
- Transcript: English, one non-empty segment, non-negative ordered timestamps.
- Windows reported the standard Hugging Face cache symlink-degradation warning; this affects disk efficiency, not output correctness.

# L. Lecture Intelligence

An isolated canonical synthetic English lecture was processed through the real service, validation, persistence, and API layers with a deterministic fake provider so no evaluation prediction was regenerated:

- Event count: 6; failed chunks: 0.
- Canonical event types only.
- Source segment IDs validated.
- Event timestamps were mapped by the backend.
- Q-to-A relation count: 1.
- Transcript, Events, relation, review-access, highlights, summary, and flashcard endpoints returned 200.

# M. Context Recovery

- Exactly one live Context endpoint request used configured `gemini-3.5-flash-lite`.
- Provider HTTP response: 200.
- Product response: HTTP 200, `supported=true`, 9 items.
- Returned timestamps mapped to canonical source times from 120 through 540 seconds.
- Every accepted item had canonical source segment/event support.
- No rate limit, parse failure, source validation failure, or provider warning occurred.

# N. Grounded Ask

- Exactly one supported live Ask request used Gemini Flash-Lite.
- Response: HTTP 200, `supported=true`, non-empty answer, three citations, eight retrieved evidence units.
- Citation timestamps: 360, 420, and 480 seconds; source Event and segment references were present.
- Exactly one unsupported endpoint request returned HTTP 200, `supported=false`, zero citations, and zero retrieved evidence; it abstained before calling the provider.
- Total live provider calls in this local integration check: 2. Rate-limit count: 0.

# O. End-to-End Flow

| Step | Status | Evidence/Note |
|---|---|---|
| Login | PASS | Real backend via Next, cookie issued; no token in body. |
| Open lecture route | PASS | Real dynamic route 200; authenticated lecture APIs accessible. |
| Transcript available | PASS | 200 with timestamped canonical segments. |
| Semantic Timeline available | PASS | Events 200; six Events with source IDs and backend timestamps. |
| Q-to-A relation available | PASS | Relation API 200; one validated relation. |
| Recover context | PASS | One live Gemini request; grounded response accepted. |
| Ask supported question | PASS | One live request; supported answer with three citations. |
| Inspect citation data | PASS | Canonical source references and backend timestamps present. |
| Access protected source media | PASS | Authenticated Range playback 206; anonymous access 401. |
| Click citation and visually observe exact seek | NOT_TESTED | Requires manual browser interaction. |
| Ask unsupported question | PASS | Safe abstention, zero citations, no provider call. |
| Refresh/session persistence | PASS | New client with existing cookie retained `/me=200`. |
| Logout | PASS | Session cleared; subsequent `/me=401`. |
| Upload through browser file picker | NOT_TESTED | Real upload API and pipeline passed; native UI selection remains manual. |

# P. Logs/Warnings

Blocking issues found and minimally fixed:

1. OpenAI-compatible `APIConnectionError` escaped the Context/Ask retry boundary and could create HTTP 500. Both flows now apply the existing bounded retry/abstention policy to `OpenAIError`; two regression tests cover connection failure.
2. Protected frontend children mounted before cookie validation, producing unauthorized data-fetch errors. `ClientShell` now gates protected routes and redirects anonymous users before child effects mount.
3. The generic Next API rewrite intercepted `/api/video/...`, bypassing protected media/VTT handlers and causing playback 404. The local media namespace is now excluded from the catch-all rewrite.
4. Registration exposed two dead `href="#"` labels. They are now non-navigation text; no legal content was fabricated.

Post-fix backend logs had no 5xx, traceback, DB/filesystem error, provider error, or 429. Expected 401 responses appeared for explicit anonymous/logout checks. Frontend post-fix logs had no data-fetch or hydration error. One harmless Next development warning remains for CSS `scroll-behavior: smooth`; it does not affect the tested flows. `next start` also warns with `output: standalone`; the required local dev server was therefore validated with `npm run dev`, while the production build itself passed.

# Q. Remaining Blockers

No blocking local runtime defect remains in the validated working tree.

Release-hygiene action: the fixes and this report are uncommitted. The pushed `origin/main` baseline at `29c967a` does not contain them, so they must be reviewed, committed, and pushed before another machine or Vercel build relies on the remote repository. No push or deployment was performed here.

`uv` is not installed on this machine; the existing Python 3.12 venv is healthy and was sufficient. A clean machine following the README must either install `uv` or intentionally use the documented native-venv fallback. The first Faster-Whisper run also needs access to download the selected model unless it is already cached.

# R. Manual Human Smoke Test Required

The following remain deliberately `NOT_TESTED` and must not be inferred from headless/API evidence:

- Complete login-to-lecture click-through in a visible browser.
- Browser file-picker upload and progress presentation.
- Timeline selection and citation-click player seeking by a person.
- Video controls, captions, responsive layouts, and visual polish across target browsers.
- Keyboard-only navigation, focus order/visibility, reduced-motion behavior, and screen-reader announcements.
- Vercel/deployed CORS, secure-cookie, domain, secret-store, database, and object-storage behavior.

# S. Final Decision

All mandatory automated local-release criteria pass in the current working tree: tests, artifacts, migrations, real backend/frontend startup, frontend-to-backend communication, auth, a real short media/transcription flow, a canonical lecture/timeline flow, minimal live Context/Ask grounding, and tracked-secret checks. Manual visual and assistive-technology validation remains explicitly pending, and the local fixes must be committed before the pushed repository inherits this result.

LOCAL_RELEASE_READY: YES
