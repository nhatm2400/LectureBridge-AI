from __future__ import annotations

import json
import os
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "evaluation" / "results" / "public_release_audit.json"
EXCLUDED_PARTS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    ".next",
    "data",
    "__pycache__",
    ".pytest_cache",
}
TEXT_SUFFIXES = {
    ".py", ".md", ".txt", ".json", ".toml", ".yaml", ".yml", ".ini",
    ".env", ".example", ".ts", ".tsx", ".js", ".mjs", ".css", ".html",
    ".ps1", ".sh", ".dockerignore", ".gitignore",
}
SECRET_PATTERNS = {
    "openai_key": re.compile(r"\bsk-[A-Za-z0-9_-]{16,}"),
    "google_api_key": re.compile(r"\bAIza[A-Za-z0-9_-]{30,}"),
    "aws_access_key": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    "github_token": re.compile(
        r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"
    ),
    "slack_token": re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{20,}"),
    "jwt_like_token": re.compile(
        r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"
    ),
    "private_key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "signed_url": re.compile(r"[?&]X-Amz-(?:Signature|Credential)="),
}
ASSIGNMENT_PATTERN = re.compile(
    r"^\s*(GEMINI_API_KEY|OPENAI_API_KEY|AWS_SECRET_ACCESS_KEY|SECRET_KEY|"
    r"GITHUB_ACCESS_TOKEN|SLACK_TOKEN)\s*=\s*(.+?)\s*$",
    re.MULTILINE | re.IGNORECASE,
)
PLACEHOLDER_MARKERS = (
    "your_", "your-", "replace", "change", "example", "...", "<", "${", "test-",
)
EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
ALLOWED_EMAIL_DOMAINS = {"example.com", "example.test", "test.dev"}
PHONE_PATTERN = re.compile(r"(?<!\d)(?:\+?84|0)(?:[ .-]?\d){9,10}(?!\d)")


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _is_text_candidate(path: Path) -> bool:
    return path.name in {
        ".gitignore",
        ".dockerignore",
        "Dockerfile",
        "Dockerfile.backend",
    } or path.suffix.lower() in TEXT_SUFFIXES


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def scan() -> dict:
    findings: list[dict] = []
    scanned = 0
    candidates: list[Path] = []
    for directory, child_directories, files in os.walk(ROOT):
        child_directories[:] = [name for name in child_directories if name not in EXCLUDED_PARTS]
        candidates.extend(Path(directory) / name for name in files)
    for path in candidates:
        relative = _relative(path)
        # Local credentials are intentionally present for provider validation but
        # excluded from public release by the required .gitignore rule. Never read
        # or report their contents.
        if path.name == ".env":
            continue
        if path.suffix.lower() in {".db", ".sqlite", ".sqlite3", ".log"}:
            findings.append({"category": "prohibited_runtime_file", "path": relative, "line": None})
            continue
        if not _is_text_candidate(path) or path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        scanned += 1
        for category, pattern in SECRET_PATTERNS.items():
            for match in pattern.finditer(text):
                findings.append({"category": category, "path": relative, "line": _line_number(text, match.start())})
        if path.name != ".env.example":
            for match in ASSIGNMENT_PATTERN.finditer(text):
                value = match.group(2).strip().strip('"\'')
                lowered = value.lower()
                if (
                    "os.getenv" in value
                    or "secrets.token_urlsafe" in value
                    or "$(" in value
                    or "${" in value
                    or value.startswith("$")
                ):
                    continue
                if value and not any(marker in lowered for marker in PLACEHOLDER_MARKERS):
                    findings.append({"category": "credential_assignment", "path": relative, "line": _line_number(text, match.start())})
        for match in EMAIL_PATTERN.finditer(text):
            domain = match.group(0).rsplit("@", 1)[1].lower()
            if domain not in ALLOWED_EMAIL_DOMAINS:
                findings.append({"category": "non_example_email", "path": relative, "line": _line_number(text, match.start())})
        for match in PHONE_PATTERN.finditer(text):
            line_start = text.rfind("\n", 0, match.start()) + 1
            line_end = text.find("\n", match.end())
            line_text = text[line_start : line_end if line_end >= 0 else len(text)]
            if "write_bytes(b" in line_text or ("<path" in line_text and " d=" in line_text):
                continue
            findings.append({"category": "possible_phone_number", "path": relative, "line": _line_number(text, match.start())})
        if re.search(r"\b[A-Za-z]:\\Users\\[^\\\s]+", text):
            findings.append({"category": "absolute_user_path", "path": relative, "line": None})

    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8", errors="replace")
    required_ignore_rules = [
        ".env",
        "data/",
        "*.db",
        "*.log",
        "provider-cache/",
        "node_modules/",
        ".next/",
    ]
    missing_ignore_rules = [rule for rule in required_ignore_rules if rule not in gitignore]
    return {
        "status": "PASS" if not findings and not missing_ignore_rules else "FAIL",
        "scanned_text_file_count": scanned,
        "secret_or_private_finding_count": len(findings),
        "findings": findings,
        "missing_ignore_rules": missing_ignore_rules,
        "checks": {
            "env_file_present_locally": (ROOT / ".env").exists(),
            "env_file_ignored": ".env" in gitignore,
            "runtime_data_ignored": "data/" in gitignore,
            "git_metadata_present": (ROOT / ".git").exists(),
        },
        "note": "Finding records contain category/path/line only; matched values are never emitted.",
    }


def main() -> int:
    result = scan()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"PUBLIC_RELEASE_SECRET_SCAN={result['status']}")
    print(f"finding_count={result['secret_or_private_finding_count']}")
    print(f"missing_ignore_rule_count={len(result['missing_ignore_rules'])}")
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
