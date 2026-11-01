import os
import stat
from pathlib import Path

import pytest

from lumacut_worker.jobs.diagnostics import media_tools_version
from lumacut_worker.media_tools import MediaToolsMissingError, tool_version


def fake_tool(directory: Path, name: str, stdout: str, exit_code: int = 0) -> None:
    script = directory / name
    script.write_text(f"#!/bin/sh\nprintf '%s\\n' '{stdout}'\nexit {exit_code}\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)


@pytest.fixture
def bin_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("PATH", str(tmp_path) + os.pathsep + "/usr/bin" + os.pathsep + "/bin")
    return tmp_path


def test_reports_first_version_line(bin_dir: Path) -> None:
    fake_tool(bin_dir, "ffmpeg", "ffmpeg version 7.1.2 Copyright (c) 2000-2025")
    assert tool_version("ffmpeg") == "ffmpeg version 7.1.2 Copyright (c) 2000-2025"


def test_missing_tool_has_actionable_message(bin_dir: Path) -> None:
    with pytest.raises(MediaToolsMissingError, match="worker Docker image"):
        tool_version("ffprobe-definitely-missing")


def test_failing_tool_is_reported(bin_dir: Path) -> None:
    fake_tool(bin_dir, "ffprobe", "", exit_code=3)
    with pytest.raises(MediaToolsMissingError, match="exit 3"):
        tool_version("ffprobe")


def test_diagnostics_job_returns_both_tools(bin_dir: Path) -> None:
    fake_tool(bin_dir, "ffmpeg", "ffmpeg version 7.1.2")
    fake_tool(bin_dir, "ffprobe", "ffprobe version 7.1.2")
    assert media_tools_version() == {
        "ffmpeg": "ffmpeg version 7.1.2",
        "ffprobe": "ffprobe version 7.1.2",
    }
