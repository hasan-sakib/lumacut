"""The committed engine fixtures (packages/engine/fixtures) are what their manifest says.

Independent of the engine: ffprobe and the Python barcode decoder check frame counts, exact frame
rates, keyframe spacing, the barcode each frame shows, and that the beeps sit on whole seconds.
"""

import hashlib
import itertools
import json
import math
import os
from fractions import Fraction
from pathlib import Path
from typing import Any

import pytest

from lumacut_worker.samples.media_check import (
    decode_all_barcodes,
    decode_mono_pcm,
    keyframe_indices,
    onset_s,
    stream,
)

pytestmark = pytest.mark.samples

FIXTURES = Path(os.environ.get("LUMACUT_FIXTURES_DIR", "/engine-fixtures"))
if not (FIXTURES / "manifest.json").is_file():
    # Outside the worker container (plain `make check`) the fixtures aren't mounted.
    pytest.skip("engine fixtures not mounted; run `make test-samples`", allow_module_level=True)
MANIFEST: dict[str, Any] = json.loads((FIXTURES / "manifest.json").read_text())
ENTRIES: list[dict[str, Any]] = MANIFEST["files"]


def ids(entry: dict[str, Any]) -> str:
    return str(entry["file"])


def path_of(entry: dict[str, Any]) -> Path:
    return FIXTURES / str(entry["file"])


@pytest.mark.parametrize("entry", ENTRIES, ids=ids)
def test_file_matches_manifest(entry: dict[str, Any]) -> None:
    path = path_of(entry)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]
    v = stream(path, "video")
    fps = Fraction(entry["fps"]["num"], entry["fps"]["den"])
    assert v["codec_name"] == "h264" and v["pix_fmt"] == "yuv420p"
    assert (v["width"], v["height"]) == (entry["width"], entry["height"])
    assert Fraction(v["r_frame_rate"]) == fps
    assert Fraction(v["avg_frame_rate"]) == fps
    assert int(v["nb_read_packets"]) == entry["frames"]
    a = stream(path, "audio")
    assert (a["codec_name"], int(a["sample_rate"])) == ("aac", 48000)


@pytest.mark.parametrize("entry", ENTRIES, ids=ids)
def test_keyframes_are_where_the_engine_will_look_for_them(entry: dict[str, Any]) -> None:
    fps = Fraction(entry["fps"]["num"], entry["fps"]["den"])
    frames = entry["frames"]
    if entry["via"] == "pipeline":
        gop = math.ceil(fps / 2)  # the proxy pipeline's 0.5 s closed GOP
        assert keyframe_indices(path_of(entry)) == list(range(0, frames, gop))
    else:
        assert keyframe_indices(path_of(entry)) == list(range(0, frames, entry["gop"]))


@pytest.mark.parametrize("entry", ENTRIES, ids=ids)
def test_every_frame_shows_the_barcode_the_manifest_promises(entry: dict[str, Any]) -> None:
    shown = decode_all_barcodes(path_of(entry), entry["width"], entry["height"])
    expected = (
        list(range(entry["frames"])) if entry["barcodes"] == "identity" else entry["barcodes"]
    )
    assert shown == expected


@pytest.mark.parametrize("entry", ENTRIES, ids=ids)
def test_beeps_start_on_whole_seconds(entry: dict[str, Any]) -> None:
    pcm = decode_mono_pcm(path_of(entry))
    half_frame_s = float(1 / Fraction(entry["fps"]["num"], entry["fps"]["den"])) / 2
    for second in entry["beepsAtS"][1:]:
        assert abs(onset_s(pcm, float(second)) - second) <= half_frame_s, (entry["file"], second)


def test_vfr_fixture_really_came_from_variable_frame_rate_input() -> None:
    entry = next(e for e in ENTRIES if e["file"] == "fx_vfr.mp4")
    assert entry["barcodes"] != "identity"
    shown = entry["barcodes"]
    assert any(shown[i] == shown[i - 1] for i in range(1, len(shown)))  # gap-filling duplicates
    assert all(b >= a for a, b in itertools.pairwise(shown))  # but time never goes back
