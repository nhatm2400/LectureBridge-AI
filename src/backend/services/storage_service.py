"""
S3-backed storage — transparent fallback to local filesystem when AWS_S3_BUCKET is not set.

Usage pattern (write-through):
  1. Pipeline writes to local path as usual.
  2. Call upload_to_s3() after writing to back the file up to S3.
  3. On new EC2 instance, call ensure_local() to pull from S3 if local copy is missing.
"""
import json
import logging
from pathlib import Path
from typing import Any

from src.backend import config

logger = logging.getLogger(__name__)


def get_upload_capabilities() -> dict[str, str | bool]:
    """Describe the browser upload path without exposing storage credentials."""
    direct_object_upload_available = bool(config.AWS_S3_BUCKET)
    local_upload_available = (
        not direct_object_upload_available
        and config.ENVIRONMENT not in {"production", "prod"}
    )
    if direct_object_upload_available:
        upload_mode = "direct_object_storage"
    elif local_upload_available:
        upload_mode = "local_filesystem"
    else:
        upload_mode = "unavailable"
    return {
        "upload_mode": upload_mode,
        "direct_object_upload_available": direct_object_upload_available,
        "local_upload_available": local_upload_available,
    }


def _s3():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        region_name=config.AWS_REGION,
        endpoint_url=f"https://s3.{config.AWS_REGION}.amazonaws.com",
        config=Config(signature_version="s3v4"),
    )


def upload_to_s3(local_path: Path, s3_key: str) -> bool:
    """Upload local file to S3 bucket. No-op if AWS_S3_BUCKET is not configured."""
    if not config.AWS_S3_BUCKET:
        return False
    try:
        _s3().upload_file(str(local_path), config.AWS_S3_BUCKET, s3_key)
        logger.debug("S3 upload: %s → s3://%s/%s", local_path.name, config.AWS_S3_BUCKET, s3_key)
        return True
    except Exception as exc:
        logger.warning("S3 upload failed for %s: %s", s3_key, exc)
        return False


def download_from_s3(s3_key: str, local_path: Path) -> bool:
    """Download file from S3 to local path. No-op if AWS_S3_BUCKET is not configured."""
    if not config.AWS_S3_BUCKET:
        return False
    try:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        _s3().download_file(config.AWS_S3_BUCKET, s3_key, str(local_path))
        logger.debug("S3 download: s3://%s/%s → %s", config.AWS_S3_BUCKET, s3_key, local_path.name)
        return True
    except Exception as exc:
        logger.debug("S3 download miss for %s: %s", s3_key, exc)
        return False


def ensure_local(s3_key: str, local_path: Path) -> bool:
    """Return True if the file exists locally (downloading from S3 if needed)."""
    if local_path.exists():
        return True
    return download_from_s3(s3_key, local_path)


def write_json_to_s3(data: dict[str, Any], s3_key: str) -> bool:
    """Serialize dict as JSON and upload directly to S3. No-op if not configured."""
    if not config.AWS_S3_BUCKET:
        return False
    try:
        import io
        body = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        _s3().put_object(Bucket=config.AWS_S3_BUCKET, Key=s3_key, Body=body, ContentType="application/json")
        return True
    except Exception as exc:
        logger.warning("S3 put_object failed for %s: %s", s3_key, exc)
        return False


def generate_presigned_url(s3_key: str, expires_in: int = 3600) -> str | None:
    """Return a pre-signed GET URL for s3_key, or None if S3 is not configured."""
    if not config.AWS_S3_BUCKET:
        return None
    try:
        return _s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": config.AWS_S3_BUCKET, "Key": s3_key},
            ExpiresIn=expires_in,
        )
    except Exception as exc:
        logger.warning("Presigned URL failed for %s: %s", s3_key, exc)
        return None


def s3_object_exists(s3_key: str) -> bool:
    if not config.AWS_S3_BUCKET:
        return False
    try:
        _s3().head_object(Bucket=config.AWS_S3_BUCKET, Key=s3_key)
        return True
    except Exception:
        return False


def delete_s3_object(s3_key: str) -> bool:
    """Delete one object. Missing objects are treated as an idempotent success."""
    if not config.AWS_S3_BUCKET:
        return False
    try:
        _s3().delete_object(Bucket=config.AWS_S3_BUCKET, Key=s3_key)
        return True
    except Exception as exc:
        logger.warning("S3 delete failed for %s: %s", s3_key, exc)
        return False


def delete_s3_prefix(s3_prefix: str) -> bool:
    """Delete all objects under a narrow application prefix."""
    normalized = s3_prefix.strip().lstrip("/")
    if (
        not config.AWS_S3_BUCKET
        or not normalized.startswith("uploads/")
        or normalized == "uploads/"
    ):
        return False

    try:
        client = _s3()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=config.AWS_S3_BUCKET, Prefix=normalized):
            keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            for offset in range(0, len(keys), 1000):
                client.delete_objects(
                    Bucket=config.AWS_S3_BUCKET,
                    Delete={"Objects": keys[offset : offset + 1000], "Quiet": True},
                )
        return True
    except Exception as exc:
        logger.warning("S3 prefix delete failed for %s: %s", normalized, exc)
        return False


def generate_presigned_upload_url(s3_key: str, content_type: str, expires_in: int = 3600) -> str | None:
    """Return a pre-signed PUT URL for direct browser-to-S3 upload."""
    if not config.AWS_S3_BUCKET:
        return None
    try:
        return _s3().generate_presigned_url(
            "put_object",
            Params={"Bucket": config.AWS_S3_BUCKET, "Key": s3_key, "ContentType": content_type},
            ExpiresIn=expires_in,
        )
    except Exception as exc:
        logger.warning("Presigned upload URL failed for %s: %s", s3_key, exc)
        return None
