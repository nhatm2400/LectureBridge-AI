import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


class RuntimeMetrics:
    def __init__(self) -> None:
        self.started_at = time.time()
        self.request_count = 0
        self.error_count = 0
        self.total_duration_ms = 0.0
        self.path_counts: dict[str, int] = defaultdict(int)

    def record_request(self, path: str, status_code: int, duration_ms: float) -> None:
        self.request_count += 1
        self.total_duration_ms += duration_ms
        self.path_counts[path] += 1
        if status_code >= 500:
            self.error_count += 1

    def snapshot(self) -> dict[str, Any]:
        average_duration_ms = self.total_duration_ms / self.request_count if self.request_count else 0
        return {
            "uptime_seconds": round(time.time() - self.started_at, 2),
            "request_count": self.request_count,
            "error_count": self.error_count,
            "average_duration_ms": round(average_duration_ms, 2),
            "top_paths": sorted(
                [{"path": path, "count": count} for path, count in self.path_counts.items()],
                key=lambda item: item["count"],
                reverse=True,
            )[:10],
        }


runtime_metrics = RuntimeMetrics()


def configure_logging(level: str, json_logs: bool = False) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        JsonLogFormatter()
        if json_logs
        else logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, level, logging.INFO))
