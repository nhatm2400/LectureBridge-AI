import subprocess
from pathlib import Path

from src.backend.services.video_service import VideoService


def _box(box_type: bytes, payload: bytes = b"") -> bytes:
    return (8 + len(payload)).to_bytes(4, "big") + box_type + payload


def test_fragmented_mp4_detection_uses_top_level_moof(tmp_path: Path):
    fragmented = tmp_path / "fragmented.mp4"
    fragmented.write_bytes(
        _box(b"ftyp", b"isom")
        + _box(b"moov", b"metadata")
        + _box(b"moof", b"fragment")
        + _box(b"mdat", b"media")
    )
    standard = tmp_path / "standard.mp4"
    standard.write_bytes(
        _box(b"ftyp", b"isom")
        + _box(b"moov", b"metadata")
        + _box(b"mdat", b"media")
    )

    assert VideoService.is_fragmented_mp4(fragmented) is True
    assert VideoService.is_fragmented_mp4(standard) is False


def test_fragmented_mp4_is_remuxed_with_stream_copy_and_atomic_replace(
    tmp_path: Path, monkeypatch
):
    video_path = tmp_path / "lecture.mp4"
    original = (
        _box(b"ftyp", b"isom")
        + _box(b"moov", b"metadata")
        + _box(b"moof", b"fragment")
        + _box(b"mdat", b"media")
    )
    normalized = (
        _box(b"ftyp", b"isom")
        + _box(b"moov", b"complete-metadata")
        + _box(b"mdat", b"media")
    )
    video_path.write_bytes(original)
    commands: list[list[str]] = []

    def fake_run(command, **_kwargs):
        commands.append(command)
        Path(command[-1]).write_bytes(normalized)
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(
        VideoService,
        "get_video_duration_seconds",
        classmethod(lambda _cls, _path: 10.0),
    )

    assert VideoService.normalize_mp4_for_browser(video_path) is True
    assert video_path.read_bytes() == normalized
    assert not (tmp_path / ".lecture.browser-ready.mp4").exists()
    assert "-c" in commands[0]
    assert commands[0][commands[0].index("-c") + 1] == "copy"
    assert "+faststart" in commands[0]


def test_standard_mp4_is_left_unchanged(tmp_path: Path, monkeypatch):
    video_path = tmp_path / "lecture.mp4"
    original = _box(b"ftyp", b"isom") + _box(b"moov", b"metadata") + _box(b"mdat", b"media")
    video_path.write_bytes(original)

    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("FFmpeg should not run for a standard MP4")

    monkeypatch.setattr(subprocess, "run", fail_if_called)

    assert VideoService.normalize_mp4_for_browser(video_path) is False
    assert video_path.read_bytes() == original
