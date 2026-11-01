"""ffprobe → the facts the pipeline and the editor need, with a defined CFR frame rate."""

from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path
from typing import Any

from lumacut_worker.pipeline.errors import ProcessingError
from lumacut_worker.pipeline.ffmpeg import ffprobe_json

# Proxies and masters are constant frame rate at one of these rates (SPEC: up to 60 fps).
STANDARD_RATES = (
    Fraction(24000, 1001),
    Fraction(24),
    Fraction(25),
    Fraction(30000, 1001),
    Fraction(30),
    Fraction(50),
    Fraction(60000, 1001),
    Fraction(60),
)
US = 1_000_000


@dataclass(frozen=True)
class VideoProbe:
    width: int  # display size (rotation applied)
    height: int
    fps: Fraction  # snapped constant rate used for proxy/master
    source_fps: Fraction
    variable_frame_rate: bool
    codec: str
    rotation: int


@dataclass(frozen=True)
class AudioProbe:
    sample_rate: int
    channels: int
    codec: str


@dataclass(frozen=True)
class MediaProbe:
    duration_us: int
    video: VideoProbe | None
    audio: AudioProbe | None


def parse_rate(value: str | None) -> Fraction | None:
    if not value or "/" not in value:
        return None
    num, den = value.split("/", 1)
    try:
        rate = Fraction(int(num), int(den))
    except (ValueError, ZeroDivisionError):
        return None
    return rate if rate > 0 else None


def snap_fps(rate: Fraction | None) -> Fraction:
    """Nearest standard rate; unknown rates default to 30 and anything above 60 becomes 60."""
    if rate is None:
        return Fraction(30)
    return min(STANDARD_RATES, key=lambda r: (abs(r - rate), -r))


def _standard(rate: Fraction | None) -> Fraction | None:
    """The standard rate `rate` denotes (within 0.5%), if any."""
    if rate is None:
        return None
    nearest = snap_fps(rate)
    return nearest if abs(rate - nearest) <= nearest * Fraction(5, 1000) else None


def choose_fps(base: Fraction | None, average: Fraction | None) -> Fraction:
    """CFR rate for proxy/master. A standard base rate (r_frame_rate) is the true timing grid,
    even when frames were dropped (phone VFR); otherwise the average decides."""
    return _standard(base) or snap_fps(average or base)


def _rotation(stream: dict[str, Any]) -> int:
    for side in stream.get("side_data_list", []):
        if "rotation" in side:
            return int(float(side["rotation"])) % 360
    rotate = stream.get("tags", {}).get("rotate")
    return int(rotate) % 360 if rotate is not None else 0


def _duration_us(data: dict[str, Any], streams: list[dict[str, Any]]) -> int:
    candidates = [data.get("format", {}).get("duration")] + [s.get("duration") for s in streams]
    for value in candidates:
        try:
            seconds = float(value) if value is not None else 0.0
        except ValueError:
            continue
        if seconds > 0:
            return round(seconds * US)
    return 0


def probe_media(path: Path) -> MediaProbe:
    data = ffprobe_json(path)
    streams: list[dict[str, Any]] = data.get("streams", [])
    video_streams = [
        s
        for s in streams
        if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")
    ]
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    if not video_streams and not audio_streams:
        raise ProcessingError("no_media_streams", "ffprobe found no audio/video streams")

    video = None
    if video_streams:
        v = video_streams[0]
        rotation = _rotation(v)
        width, height = int(v["width"]), int(v["height"])
        if rotation in (90, 270):
            width, height = height, width
        avg = parse_rate(v.get("avg_frame_rate"))
        real = parse_rate(v.get("r_frame_rate"))
        source = avg or real or Fraction(30)
        video = VideoProbe(
            width=width,
            height=height,
            fps=choose_fps(real, avg),
            source_fps=source,
            variable_frame_rate=avg is not None and real is not None and avg != real,
            codec=str(v.get("codec_name", "unknown")),
            rotation=rotation,
        )
    audio = None
    if audio_streams:
        a = audio_streams[0]
        audio = AudioProbe(
            sample_rate=int(a.get("sample_rate") or 48000),
            channels=int(a.get("channels") or 2),
            codec=str(a.get("codec_name", "unknown")),
        )
    duration = _duration_us(data, video_streams + audio_streams)
    if duration <= 0:
        raise ProcessingError("corrupt_file", "duration is unknown or zero")
    return MediaProbe(duration_us=duration, video=video, audio=audio)
