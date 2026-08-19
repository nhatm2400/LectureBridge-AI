from __future__ import annotations

import re

_SUSPICIOUS_MARKERS = ("Ã", "Â", "�", "ï¿½")


def is_suspicious_mojibake(text: str) -> bool:
    return any(marker in text for marker in _SUSPICIOUS_MARKERS)


def normalize_text_utf8(value: str | None) -> str:
    """
    Normalize text for API output.
    - Keep normal UTF-8 text unchanged
    - Attempt single-step latin1->utf8 recovery only when suspicious markers exist
    - Never do multi-pass decode to avoid double-decode corruption
    """
    raw = (value or "").replace("\x00", "").strip()
    if not raw:
        return ""

    if not is_suspicious_mojibake(raw):
        return raw

    try:
        repaired = raw.encode("latin1").decode("utf-8")
    except Exception:
        return raw

    repaired = repaired.replace("\x00", "").strip()
    # Keep repaired only if it looks less suspicious than source.
    raw_bad = sum(raw.count(m) for m in _SUSPICIOUS_MARKERS)
    repaired_bad = sum(repaired.count(m) for m in _SUSPICIOUS_MARKERS)
    if repaired and repaired_bad <= raw_bad:
        return re.sub(r"\s{2,}", " ", repaired)
    return raw

