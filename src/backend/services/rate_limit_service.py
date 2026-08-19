import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request


_WINDOW_SECONDS = {
    "second": 1,
    "minute": 60,
    "hour": 3600,
    "day": 86400,
}

_requests: dict[str, deque[float]] = defaultdict(deque)


def _parse_limit(limit: str) -> tuple[int, int]:
    try:
        count_raw, window_raw = (limit or "").split("/", 1)
        count = int(count_raw.strip())
        window = _WINDOW_SECONDS[window_raw.strip().lower()]
    except Exception:
        count, window = 60, 60
    return count, window


def _client_key(request: Request, scope: str) -> str:
    # Do not trust client-supplied forwarding headers. A production deployment
    # may normalize them at a trusted reverse proxy before the app layer.
    ip = request.client.host if request.client else ""
    return f"{scope}:{ip or 'unknown'}"


def rate_limit(scope: str, limit: str) -> Callable[[Request], None]:
    max_requests, window_seconds = _parse_limit(limit)

    def dependency(request: Request) -> None:
        key = _client_key(request, scope)
        now = time.monotonic()
        bucket = _requests[key]

        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()

        if len(bucket) >= max_requests:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please try again later.",
            )

        bucket.append(now)

    return dependency
