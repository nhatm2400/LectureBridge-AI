import os
import secrets
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
AI_BASE_URL = os.getenv(
    "AI_BASE_URL",
    "https://generativelanguage.googleapis.com/v1beta/openai/",
).strip()
AI_MODEL = os.getenv("AI_MODEL", "gemini-2.5-flash").strip()

# AWS
AWS_REGION = os.getenv("AWS_REGION", "ap-southeast-1")
AWS_S3_BUCKET = os.getenv("AWS_S3_BUCKET", "").strip()

# Whisper — use "tiny" or "base" on free-tier EC2 (1GB RAM), "small" on t3.small+
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
JSON_LOGS = os.getenv("JSON_LOGS", "false").lower() == "true"
UPLOADS_DIR = "data/uploads"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
REDIS_URL = os.getenv("REDIS_URL", "").strip()
# --- Auth ---
ENVIRONMENT = os.getenv("ENVIRONMENT", os.getenv("ENV", "development")).lower()
SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY:
    if ENVIRONMENT in {"production", "prod"}:
        raise RuntimeError("SECRET_KEY is required in production.")
    # Dev fallback is generated per process (not hardcoded)
    SECRET_KEY = secrets.token_urlsafe(64)
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "500"))
MAX_VIDEO_DURATION_SECONDS = int(os.getenv("MAX_VIDEO_DURATION_SECONDS", "14400"))
ALLOWED_VIDEO_EXTENSIONS = {
    ext.strip().lower()
    for ext in os.getenv("ALLOWED_VIDEO_EXTENSIONS", ".mp4,.mov,.avi,.mkv").split(",")
    if ext.strip()
}
ALLOWED_VIDEO_MIME_TYPES = {
    mime.strip().lower()
    for mime in os.getenv(
        "ALLOWED_VIDEO_MIME_TYPES",
        "video/mp4,video/quicktime,video/x-msvideo,video/x-matroska",
    ).split(",")
    if mime.strip()
}
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "access_token")
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "lax")
LOGIN_RATE_LIMIT = os.getenv("LOGIN_RATE_LIMIT", "10/minute")
UPLOAD_RATE_LIMIT = os.getenv("UPLOAD_RATE_LIMIT", "20/hour")
SEMANTIC_CHUNK_MAX_TOKENS = int(os.getenv("SEMANTIC_CHUNK_MAX_TOKENS", "1200"))
SEMANTIC_CHUNK_OVERLAP_SEGMENTS = int(os.getenv("SEMANTIC_CHUNK_OVERLAP_SEGMENTS", "2"))
SEMANTIC_EXTRACTION_MAX_ATTEMPTS = int(os.getenv("SEMANTIC_EXTRACTION_MAX_ATTEMPTS", "2"))
SEMANTIC_EXPLICIT_CONFIDENCE_THRESHOLD = float(
    os.getenv("SEMANTIC_EXPLICIT_CONFIDENCE_THRESHOLD", "0.55")
)
SEMANTIC_INFERRED_CONFIDENCE_THRESHOLD = float(
    os.getenv("SEMANTIC_INFERRED_CONFIDENCE_THRESHOLD", "0.70")
)
SEMANTIC_TITLE_SIMILARITY_THRESHOLD = float(
    os.getenv("SEMANTIC_TITLE_SIMILARITY_THRESHOLD", "0.60")
)
QA_LINK_MIN_CONFIDENCE = float(os.getenv("QA_LINK_MIN_CONFIDENCE", "0.70"))
QA_LINK_MAX_WINDOW_SECONDS = float(os.getenv("QA_LINK_MAX_WINDOW_SECONDS", "180"))
QA_LINK_MAX_ATTEMPTS = int(os.getenv("QA_LINK_MAX_ATTEMPTS", "2"))
QA_LINK_CONTEXT_RADIUS_SEGMENTS = int(
    os.getenv("QA_LINK_CONTEXT_RADIUS_SEGMENTS", "1")
)
CONTEXT_RECOVERY_BOUNDARY_SECONDS = float(
    os.getenv("CONTEXT_RECOVERY_BOUNDARY_SECONDS", "45")
)
LECTURE_GROUNDING_MAX_ATTEMPTS = int(
    os.getenv("LECTURE_GROUNDING_MAX_ATTEMPTS", "2")
)
ASK_LECTURE_MAX_QUESTION_LENGTH = int(
    os.getenv("ASK_LECTURE_MAX_QUESTION_LENGTH", "500")
)
ASK_LECTURE_EVIDENCE_COUNT = int(
    os.getenv("ASK_LECTURE_EVIDENCE_COUNT", "8")
)
ASK_LECTURE_RATE_LIMIT = os.getenv("ASK_LECTURE_RATE_LIMIT", "20/minute")
CONTEXT_RECOVERY_RATE_LIMIT = os.getenv(
    "CONTEXT_RECOVERY_RATE_LIMIT", "20/minute"
)
MAX_REAL_PROVIDER_SAMPLES = int(os.getenv("MAX_REAL_PROVIDER_SAMPLES", "3"))
MAX_ASK_QUERIES_PER_SAMPLE = int(
    os.getenv("MAX_ASK_QUERIES_PER_SAMPLE", "2")
)
MAX_CONTEXT_CALLS_PER_SAMPLE = int(
    os.getenv("MAX_CONTEXT_CALLS_PER_SAMPLE", "1")
)
SMOKE_PROVIDER_DELAY_SECONDS = float(
    os.getenv("SMOKE_PROVIDER_DELAY_SECONDS", "5")
)
SMOKE_RATE_LIMIT_MAX_ATTEMPTS = int(
    os.getenv("SMOKE_RATE_LIMIT_MAX_ATTEMPTS", "3")
)
SMOKE_RATE_LIMIT_BACKOFF_SECONDS = os.getenv(
    "SMOKE_RATE_LIMIT_BACKOFF_SECONDS", "5,15"
)
SMOKE_RATE_LIMIT_JITTER_SECONDS = float(
    os.getenv("SMOKE_RATE_LIMIT_JITTER_SECONDS", "1")
)
SMOKE_RATE_LIMIT_MAX_WAIT_SECONDS = float(
    os.getenv("SMOKE_RATE_LIMIT_MAX_WAIT_SECONDS", "30")
)
ALLOW_PUBLIC_ROLE_REGISTRATION = os.getenv("ALLOW_PUBLIC_ROLE_REGISTRATION", "false").lower() == "true"
ADMIN_EMAILS: set[str] = {
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "").split(",")
    if e.strip()
}


def _parse_cors_origins(raw: str) -> list[str]:
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


_default_dev_origins = "http://localhost:3000,http://127.0.0.1:3000"
CORS_ALLOW_ORIGINS = _parse_cors_origins(os.getenv("CORS_ALLOW_ORIGINS", _default_dev_origins))
if ENVIRONMENT in {"production", "prod"} and not CORS_ALLOW_ORIGINS:
    raise RuntimeError("CORS_ALLOW_ORIGINS must be set in production.")
