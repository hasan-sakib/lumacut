"""Locating and identifying the FFmpeg binaries the worker depends on."""

import shutil
import subprocess

REQUIRED_TOOLS = ("ffmpeg", "ffprobe")


class MediaToolsMissingError(RuntimeError):
    """Raised when ffmpeg/ffprobe cannot be run; the message says how to fix it."""


def tool_version(tool: str) -> str:
    """First line of `<tool> -version`, e.g. 'ffmpeg version 7.1.2-0+deb13u1 ...'."""
    path = shutil.which(tool)
    if path is None:
        raise MediaToolsMissingError(
            f"`{tool}` was not found on PATH. The worker needs FFmpeg: use the worker Docker "
            f"image (infra/docker-compose.yml) or install FFmpeg on this machine."
        )
    result = subprocess.run(
        [path, "-hide_banner", "-version"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise MediaToolsMissingError(
            f"`{tool} -version` failed (exit {result.returncode}): {result.stderr.strip()}"
        )
    return result.stdout.splitlines()[0].strip()


def media_tool_versions() -> dict[str, str]:
    return {tool: tool_version(tool) for tool in REQUIRED_TOOLS}
