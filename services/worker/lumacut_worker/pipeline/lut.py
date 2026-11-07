"""`.cube` look-up tables: validation only. The file itself is the rendition (the browser parses it
with the same rules, packages/engine/src/color/cube.ts, and uploads it as a GPU texture)."""

from dataclasses import dataclass
from pathlib import Path

from lumacut_worker.pipeline.errors import ProcessingError

MAX_BYTES = 64 * 1024 * 1024  # a 65^3 table is ~ 12 MB of text
MAX_3D = 65
MAX_1D = 16384


@dataclass(frozen=True)
class LutResult:
    title: str
    dimension: int  # 1 or 3
    size: int


def is_lut(path: Path) -> bool:
    return path.suffix.lower() == ".cube"


def _numbers(parts: list[str], count: int, line: int, what: str) -> list[float]:
    if len(parts) != count:
        raise ProcessingError("invalid_lut", f"line {line}: {what} needs {count} numbers")
    values: list[float] = []
    for part in parts:
        try:
            value = float(part)
        except ValueError:
            raise ProcessingError("invalid_lut", f"line {line}: '{part}' isn't a number") from None
        if value != value or value in (float("inf"), float("-inf")):
            raise ProcessingError("invalid_lut", f"line {line}: '{part}' isn't a finite number")
        values.append(value)
    return values


def validate_cube(text: str) -> LutResult:
    """Strict check with the same rules as the browser parser: errors say which line is wrong."""
    title = ""
    dimension: int | None = None
    size = 0
    domain_min = (0.0, 0.0, 0.0)
    domain_max = (1.0, 1.0, 1.0)
    rows = 0
    for index, raw in enumerate(text.lstrip("﻿").splitlines()):
        number = index + 1
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        keyword = parts[0]
        if keyword[0].isalpha() or keyword[0] == "_":
            if keyword == "TITLE":
                title = line[5:].strip().strip('"')
            elif keyword == "DOMAIN_MIN":
                domain_min = tuple(_numbers(parts[1:], 3, number, "DOMAIN_MIN"))  # type: ignore[assignment]
            elif keyword == "DOMAIN_MAX":
                domain_max = tuple(_numbers(parts[1:], 3, number, "DOMAIN_MAX"))  # type: ignore[assignment]
            elif keyword in ("LUT_1D_SIZE", "LUT_3D_SIZE"):
                if dimension is not None:
                    raise ProcessingError(
                        "invalid_lut", f"line {number}: a file can hold one table, not two"
                    )
                (n,) = _numbers(parts[1:], 1, number, keyword)
                limit = MAX_3D if keyword == "LUT_3D_SIZE" else MAX_1D
                if n != int(n) or not 2 <= n <= limit:
                    raise ProcessingError(
                        "invalid_lut",
                        f"line {number}: {keyword} must be a whole number from 2 to {limit}",
                    )
                dimension = 3 if keyword == "LUT_3D_SIZE" else 1
                size = int(n)
            else:
                raise ProcessingError("invalid_lut", f"line {number}: unknown keyword '{keyword}'")
            continue
        _numbers(parts, 3, number, "a table row")
        rows += 1
    if dimension is None:
        raise ProcessingError("invalid_lut", "no LUT_1D_SIZE or LUT_3D_SIZE line")
    expected = size**3 if dimension == 3 else size
    if rows != expected:
        raise ProcessingError(
            "invalid_lut", f"expected {expected} table rows for size {size}, found {rows}"
        )
    if any(hi <= lo for lo, hi in zip(domain_min, domain_max, strict=True)):
        raise ProcessingError("invalid_lut", "DOMAIN_MAX must be larger than DOMAIN_MIN")
    return LutResult(title=title, dimension=dimension, size=size)


def process_lut(src: Path) -> LutResult:
    if src.stat().st_size > MAX_BYTES:
        raise ProcessingError("invalid_lut", "the file is larger than 64 MiB")
    try:
        text = src.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise ProcessingError("invalid_lut", "the file isn't text") from None
    return validate_cube(text)
