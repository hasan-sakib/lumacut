"""`.cube` validation: same rules as the browser parser (packages/engine/src/color/cube.ts)."""

from pathlib import Path

import pytest

from lumacut_worker.pipeline import lut
from lumacut_worker.pipeline.errors import ProcessingError
from lumacut_worker.pipeline.process import process_file


def identity(n: int) -> str:
    rows = ['TITLE "identity"', f"LUT_3D_SIZE {n}"]
    for b in range(n):
        for g in range(n):
            for r in range(n):
                rows.append(f"{r / (n - 1)} {g / (n - 1)} {b / (n - 1)}")
    return "\n".join(rows)


def test_accepts_a_3d_table_and_reports_its_shape() -> None:
    result = lut.validate_cube(
        f"# made by hand\n{identity(3)}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n"
    )
    assert (result.title, result.dimension, result.size) == ("identity", 3, 3)


def test_accepts_a_1d_table_crlf_and_a_byte_order_mark() -> None:
    text = "﻿LUT_1D_SIZE 3\r\n0 0 1\r\n0.5 0.25 0.5\r\n1 1 0\r\n"
    result = lut.validate_cube(text)
    assert (result.dimension, result.size) == (1, 3)


@pytest.mark.parametrize(
    ("text", "fragment"),
    [
        ("", "no LUT_1D_SIZE or LUT_3D_SIZE"),
        ("LUT_3D_SIZE 2\n0 0 0\n", "expected 8 table rows"),
        ("LUT_3D_SIZE 1\n", "from 2 to 65"),
        ("LUT_3D_SIZE 66\n", "from 2 to 65"),
        ("LUT_3D_SIZE 2.5\n", "whole number"),
        ("LUT_3D_SIZE 2\nLUT_1D_SIZE 4\n", "one table"),
        ("LUT_3D_SIZE 2\nFOO 1\n", "unknown keyword 'FOO'"),
        ("LUT_1D_SIZE 2\n0 0\n1 1 1\n", "line 2: a table row needs 3 numbers"),
        ("LUT_1D_SIZE 2\n0 0 x\n1 1 1\n", "line 2: 'x' isn't a number"),
        ("LUT_1D_SIZE 2\n0 0 nan\n1 1 1\n", "finite"),
        ("LUT_1D_SIZE 2\nDOMAIN_MIN 1 1 1\nDOMAIN_MAX 0 0 0\n0 0 0\n1 1 1\n", "DOMAIN_MAX"),
        ("LUT_1D_SIZE 2\nDOMAIN_MIN 1 1\n", "DOMAIN_MIN needs 3 numbers"),
    ],
)
def test_rejects_problems_with_a_line_number_or_reason(text: str, fragment: str) -> None:
    with pytest.raises(ProcessingError) as error:
        lut.validate_cube(text)
    assert error.value.code == "invalid_lut"
    assert fragment in error.value.detail


def test_only_cube_files_are_luts() -> None:
    assert lut.is_lut(Path("a.cube")) and lut.is_lut(Path("B.CUBE"))
    assert not lut.is_lut(Path("a.png"))


def test_the_pipeline_keeps_the_file_as_the_rendition(tmp_path: Path) -> None:
    src = tmp_path / "original.cube"
    src.write_text(identity(2), encoding="utf-8")
    progress: list[tuple[str, float]] = []
    result = process_file(src, tmp_path / "work", lambda stage, p: progress.append((stage, p)))
    assert result.kind == "lut"
    assert result.media == {"lut": {"title": "identity", "dimension": 3, "size": 2}}
    assert result.files == {"lut": src}
    assert progress[-1] == ("lut", 1.0)


def test_a_binary_or_oversized_file_is_rejected(tmp_path: Path) -> None:
    binary = tmp_path / "bad.cube"
    binary.write_bytes(b"\xff\xfe\x00\x01")
    with pytest.raises(ProcessingError) as error:
        lut.process_lut(binary)
    assert error.value.code == "invalid_lut"
