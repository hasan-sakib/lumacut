"""What `make samples` generates, and the properties each file must have.

The same specs drive generation (generate.py) and verification (tests/samples), so the manifest
written next to the files is the contract later milestones rely on.
"""

import math
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Literal

US_PER_SECOND = 1_000_000


@dataclass(frozen=True)
class VideoSpec:
    name: str
    width: int
    height: int
    fps: Fraction
    duration_s: int
    codec: Literal["h264", "hevc"] = "h264"
    gop_frames: int | None = None  # None = one second of frames
    beeps: bool = True  # 1 kHz beep, 50 ms, starting at every whole second
    vfr_drop_every: int | None = None  # drop frame n when n % k == k // 2 -> variable frame rate
    purpose: str = ""

    @property
    def gop(self) -> int:
        return self.gop_frames if self.gop_frames is not None else round(self.fps)

    @property
    def source_frames(self) -> int:
        """Frames whose start time is before the end: ceil(fps * duration)."""
        return math.ceil(self.fps * self.duration_s)

    @property
    def frames(self) -> int:
        if self.vfr_drop_every is None:
            return self.source_frames
        k = self.vfr_drop_every
        return sum(1 for n in range(self.source_frames) if n % k != k // 2)


@dataclass(frozen=True)
class AudioSpec:
    name: str
    codec: Literal["pcm_s16le", "mp3"]
    duration_s: int
    expression: str  # aevalsrc expression of t (seconds)
    channels: int = 2
    sample_rate: int = 48_000
    beeps_at_s: tuple[float, ...] = ()
    silences_s: tuple[tuple[float, float], ...] = field(default=())
    purpose: str = ""


@dataclass(frozen=True)
class ImageSpec:
    name: str
    width: int
    height: int
    codec: Literal["png", "mjpeg", "webp"]
    alpha: bool = False
    purpose: str = ""


BEEP_EXPR = "if(lt(mod(t,1),0.05),0.5*sin(2*PI*1000*t),0)"

VIDEOS: tuple[VideoSpec, ...] = (
    VideoSpec("fn_1080p30.mp4", 1920, 1080, Fraction(30), 10, purpose="frame-exact seek, A/V sync"),
    VideoSpec("fn_1080p60.mp4", 1920, 1080, Fraction(60), 10, purpose="1080p60 limit"),
    VideoSpec(
        "fn_1080p2997.mp4", 1920, 1080, Fraction(30000, 1001), 10, purpose="NTSC rational fps"
    ),
    VideoSpec("fn_720p24.mp4", 1280, 720, Fraction(24), 10, purpose="24 fps, proxy size"),
    VideoSpec("fn_1080x1920_30.mp4", 1080, 1920, Fraction(30), 10, purpose="9:16 portrait"),
    VideoSpec(
        "long_gop_1080p30.mp4",
        1920,
        1080,
        Fraction(30),
        20,
        gop_frames=250,
        purpose="seek stress: keyframes only every 250 frames",
    ),
    VideoSpec(
        "vfr_phone_like.mp4",
        1920,
        1080,
        Fraction(30),
        10,
        vfr_drop_every=7,
        purpose="variable frame rate input for CFR proxy conversion (M1)",
    ),
    VideoSpec(
        "hevc_1080p30.mp4",
        1920,
        1080,
        Fraction(30),
        5,
        codec="hevc",
        purpose="HEVC source (decode fallback paths)",
    ),
)

AUDIOS: tuple[AudioSpec, ...] = (
    AudioSpec(
        "audio_tone_beeps.wav",
        "pcm_s16le",
        10,
        BEEP_EXPR,
        beeps_at_s=tuple(float(s) for s in range(10)),
        purpose="audio sync reference",
    ),
    AudioSpec(
        "audio_120bpm_clicks.wav",
        "pcm_s16le",
        30,
        "if(lt(mod(t,0.5),0.01),0.8*sin(2*PI*2000*t),0)",
        beeps_at_s=tuple(i * 0.5 for i in range(60)),
        purpose="beat detection (M10)",
    ),
    AudioSpec(
        "audio_silence_gaps.wav",
        "pcm_s16le",
        20,
        "if(lt(mod(t,4),3),0.4*sin(2*PI*440*t),0)",
        silences_s=tuple((s + 3.0, s + 4.0) for s in range(0, 20, 4)),
        purpose="silence detection (M10/M11)",
    ),
    AudioSpec("audio_tone.mp3", "mp3", 10, "0.4*sin(2*PI*440*t)", purpose="MP3 import"),
)

IMAGES: tuple[ImageSpec, ...] = (
    ImageSpec("img_4000x3000.png", 4000, 3000, "png", purpose="large PNG"),
    ImageSpec("img_6000x4000.jpg", 6000, 4000, "mjpeg", purpose="M6 acceptance: 6000 px photo"),
    ImageSpec("img_8192x4608.png", 8192, 4608, "png", purpose="8192 px long-side limit"),
    ImageSpec("img_alpha_2048.png", 2048, 2048, "png", alpha=True, purpose="transparency"),
    ImageSpec("img_1920x1080.webp", 1920, 1080, "webp", purpose="WebP import"),
)


def frame_start_us(frame: int, fps: Fraction) -> int:
    """Same rounding rule as packages/schema frameToUs: round-half-up of n * 1e6 / fps."""
    exact = Fraction(frame * US_PER_SECOND) / fps
    return int(exact + Fraction(1, 2))
