import os
import subprocess
import logging
import asyncio
from pathlib import Path
from fastapi import UploadFile
import aiofiles

from src.backend import config

logger = logging.getLogger(__name__)

class VideoService:
    UPLOAD_DIR = Path("data/uploads/videos")
    AUDIO_DIR = Path("data/uploads/audio")
    _write_lock = asyncio.Lock()
    
    @classmethod
    def ensure_dirs(cls):
        cls.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        cls.AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    @classmethod
    async def save_video(cls, file_content: bytes, filename: str) -> Path:
        cls.ensure_dirs()
        file_path = cls.UPLOAD_DIR / filename
        async with cls._write_lock: # Use class-level lock
            with open(file_path, "wb") as f:
                f.write(file_content)
        return file_path

    @classmethod
    async def save_video_stream(
        cls,
        upload_file: UploadFile,
        filename: str,
        max_size_bytes: int,
        chunk_size: int = 1024 * 1024,
    ) -> Path:
        """
        Save uploaded video incrementally to disk to avoid loading full file into memory.
        Raises ValueError if file exceeds max_size_bytes.
        """
        cls.ensure_dirs()
        file_path = cls.UPLOAD_DIR / filename
        total_bytes = 0

        async with cls._write_lock:
            async with aiofiles.open(file_path, "wb") as out_file:
                while True:
                    chunk = await upload_file.read(chunk_size)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > max_size_bytes:
                        await out_file.close()
                        try:
                            file_path.unlink(missing_ok=True)
                        except Exception:
                            pass
                        raise ValueError("Uploaded file exceeds allowed size.")
                    await out_file.write(chunk)

        await upload_file.seek(0)
        return file_path

    @classmethod
    def validate_video_duration(cls, video_path: Path) -> None:
        if not video_path.exists():
            return

        command = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        # Set LD_LIBRARY_PATH to fix potential library issues on this system
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = "/usr/lib/x86_64-linux-gnu"

        try:
            result = subprocess.run(command, capture_output=True, text=True, check=True, env=env)
            duration = float((result.stdout or "0").strip() or 0)
        except FileNotFoundError:
            logger.warning("ffprobe is not installed; skipping duration validation for %s", video_path)
            return
        except Exception as exc:
            raise ValueError(f"Unable to validate video duration: {exc}") from exc

        if duration > config.MAX_VIDEO_DURATION_SECONDS:
            try:
                video_path.unlink(missing_ok=True)
            except Exception:
                pass
            raise ValueError("Uploaded video exceeds allowed duration.")

    @classmethod
    def get_video_duration_seconds(cls, video_path: Path) -> float | None:
        if not video_path.exists():
            return None
        command = [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(video_path),
        ]
        try:
            result = subprocess.run(command, capture_output=True, text=True, check=True)
            value = float((result.stdout or "0").strip() or 0)
            return value if value > 0 else None
        except Exception:
            return None

    @classmethod
    def is_fragmented_mp4(cls, video_path: Path) -> bool:
        """Return True when an MP4 contains top-level movie fragments."""
        if video_path.suffix.lower() != ".mp4" or not video_path.is_file():
            return False

        file_size = video_path.stat().st_size
        offset = 0
        with video_path.open("rb") as source:
            while offset + 8 <= file_size:
                source.seek(offset)
                header = source.read(8)
                if len(header) != 8:
                    return False

                box_size = int.from_bytes(header[:4], "big")
                box_type = header[4:8]
                header_size = 8
                if box_size == 1:
                    extended_size = source.read(8)
                    if len(extended_size) != 8:
                        return False
                    box_size = int.from_bytes(extended_size, "big")
                    header_size = 16
                elif box_size == 0:
                    box_size = file_size - offset

                if box_size < header_size or offset + box_size > file_size:
                    return False
                if box_type == b"moof":
                    return True
                offset += box_size

        return False

    @classmethod
    def normalize_mp4_for_browser(cls, video_path: Path) -> bool:
        """Remux fragmented MP4 into a seekable browser-friendly MP4."""
        if not cls.is_fragmented_mp4(video_path):
            return False

        temp_path = video_path.with_name(f".{video_path.stem}.browser-ready.mp4")
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video_path),
            "-map",
            "0:v?",
            "-map",
            "0:a?",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(temp_path),
        ]
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = "/usr/lib/x86_64-linux-gnu"

        try:
            subprocess.run(command, capture_output=True, text=True, check=True, env=env)
            if not temp_path.is_file() or temp_path.stat().st_size == 0:
                raise ValueError("FFmpeg produced no browser-compatible video output.")
            if cls.get_video_duration_seconds(temp_path) is None:
                raise ValueError("Browser-compatible video output failed duration validation.")
            os.replace(temp_path, video_path)
            logger.info("Normalized fragmented MP4 for browser playback: %s", video_path.name)
            return True
        except FileNotFoundError as exc:
            raise ValueError("FFmpeg is required to normalize fragmented MP4 uploads.") from exc
        except subprocess.CalledProcessError as exc:
            logger.warning("Fragmented MP4 normalization failed for %s", video_path.name)
            raise ValueError(
                "Uploaded MP4 container could not be prepared for browser playback."
            ) from exc
        finally:
            temp_path.unlink(missing_ok=True)

    @classmethod
    async def download_video(cls, url: str, video_id: str) -> Path:
        """
        Tải video từ URL sử dụng yt-dlp.
        """
        cls.ensure_dirs()
        output_template = str(cls.UPLOAD_DIR / f"{video_id}.%(ext)s")
        
        # Cấu hình yt-dlp
        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'outtmpl': output_template,
            'quiet': True,
            'no_warnings': True,
        }
        
        import yt_dlp
        
        logger.info("Downloading external video for video_id=%s", video_id)
        
        # Chạy tải video trong ThreadPool vì yt-dlp là sync
        loop = asyncio.get_event_loop()
        def download():
            # Set LD_LIBRARY_PATH for the current process/thread
            os.environ["LD_LIBRARY_PATH"] = "/usr/lib/x86_64-linux-gnu"
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                return Path(ydl.prepare_filename(info))
        
        return await loop.run_in_executor(None, download)

    @classmethod
    def extract_audio(cls, video_path: Path) -> Path:
        """
        Extracts audio from video using FFmpeg.
        Returns the path to the extracted audio file.
        """
        cls.ensure_dirs()
        audio_path = cls.AUDIO_DIR / f"{video_path.stem}.mp3"
        
        # Command to extract audio
        # -i: input file
        # -vn: disable video
        # -acodec libmp3lame: use mp3 codec
        # -y: overwrite output
        command = [
            "ffmpeg", "-i", str(video_path),
            "-vn", "-acodec", "libmp3lame",
            "-y", str(audio_path)
        ]
        
        # Set LD_LIBRARY_PATH to fix potential library issues on this system
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = "/usr/lib/x86_64-linux-gnu"
        
        try:
            logger.info(f"🎬 Đang tách âm thanh từ: {video_path}")
            subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                check=True,
                env=env
            )
            logger.info(f"✅ Tách âm thanh thành công: {audio_path}")
            return audio_path
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ Lỗi khi tách âm thanh: {e.stderr}")
            raise Exception(f"FFmpeg error: {e.stderr}")

    @classmethod
    def extract_thumbnail(cls, video_path: Path) -> Path:
        """
        Extracts the first frame of the video using FFmpeg and saves it as a JPEG thumbnail.
        Returns the path to the extracted thumbnail file.
        """
        cls.ensure_dirs()
        thumbnails_dir = Path("data/uploads/thumbnails")
        thumbnails_dir.mkdir(parents=True, exist_ok=True)
        thumbnail_path = thumbnails_dir / f"{video_path.stem}.jpg"
        
        # Command to extract first frame
        # -ss 00:00:00: seek to the beginning
        # -i: input file
        # -vframes 1: extract 1 frame
        # -f image2: output format
        # -y: overwrite output
        command = [
            "ffmpeg", "-y",
            "-ss", "00:00:00",
            "-i", str(video_path),
            "-vframes", "1",
            "-f", "image2",
            str(thumbnail_path)
        ]
        
        # Set LD_LIBRARY_PATH to fix potential library issues on this system
        env = os.environ.copy()
        env["LD_LIBRARY_PATH"] = "/usr/lib/x86_64-linux-gnu"
        
        try:
            logger.info(f"🎬 Đang trích xuất ảnh thumb từ: {video_path}")
            subprocess.run(
                command, 
                capture_output=True, 
                text=True, 
                check=True,
                env=env
            )
            logger.info(f"✅ Trích xuất ảnh thumb thành công: {thumbnail_path}")
            return thumbnail_path
        except subprocess.CalledProcessError as e:
            logger.error(f"❌ Lỗi khi trích xuất ảnh thumb: {e.stderr}")
            raise Exception(f"FFmpeg error: {e.stderr}")
