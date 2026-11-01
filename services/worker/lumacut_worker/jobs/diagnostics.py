"""Diagnostic jobs: prove the queue -> worker -> FFmpeg path works end to end."""

from lumacut_worker.media_tools import media_tool_versions


def media_tools_version() -> dict[str, str]:
    """Return the ffmpeg/ffprobe version lines as seen by the worker process."""
    return media_tool_versions()
