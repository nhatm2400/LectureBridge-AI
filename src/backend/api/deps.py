import ipaddress
import socket
import uuid
from urllib.parse import urlparse

from fastapi import HTTPException
from sqlmodel import Session, select

from src.backend.models import User, Lesson, Course, Enrollment

def check_video_access(lesson_id: str, user: User, session: Session):
    try:
        lesson_uuid = uuid.UUID(str(lesson_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid video id.")

    lesson = session.get(Lesson, lesson_uuid)
    if not lesson:
        raise HTTPException(status_code=404, detail="Khong tim thay bai hoc.")
    
    role_name = (user.role.name if user.role else "student").lower()
    if role_name == "admin":
        return lesson

    if not lesson.module:
        raise HTTPException(status_code=403, detail="Access denied.")

    course = session.get(Course, lesson.module.course_id)
    if course and course.instructor_id == user.id:
        return lesson

    enrollment = session.exec(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == lesson.module.course_id,
            Enrollment.enrollment_status == "active",
        )
    ).first()
    if enrollment:
        return lesson

    raise HTTPException(status_code=403, detail="Access denied.")


def _is_public_ip(ip_str: str) -> bool:
    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return False
    return not (
        ip_obj.is_private
        or ip_obj.is_loopback
        or ip_obj.is_link_local
        or ip_obj.is_reserved
        or ip_obj.is_multicast
        or ip_obj.is_unspecified
    )


def validate_external_video_url(raw_url: str) -> str:
    if not raw_url:
        raise HTTPException(status_code=400, detail="Video URL is required.")

    parsed = urlparse(raw_url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed.")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL.")

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL host.")

    lowered = hostname.lower()
    if lowered in {"localhost", "127.0.0.1", "::1"} or lowered.endswith(".local"):
        raise HTTPException(status_code=400, detail="Local addresses are not allowed.")

    try:
        resolved = socket.getaddrinfo(hostname, parsed.port or 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="Unable to resolve URL host.")

    for record in resolved:
        ip = record[4][0]
        if not _is_public_ip(ip):
            raise HTTPException(status_code=400, detail="Target host is not publicly routable.")

    return raw_url.strip()
