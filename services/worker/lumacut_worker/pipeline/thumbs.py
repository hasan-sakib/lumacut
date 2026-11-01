"""Poster frame and thumbnail sprite sheets (+ JSON index) for timeline/library scrubbing."""

import math
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image

from lumacut_worker.pipeline.ffmpeg import FractionFn, run_ffmpeg

TILE_HEIGHT = 90
COLUMNS = 10
ROWS = 10
MAX_TILES = 200
POSTER_WIDTH = 480
US = 1_000_000


@dataclass(frozen=True)
class SpriteLayout:
    interval_us: int
    tile_width: int
    tile_height: int


def sprite_layout(duration_us: int, width: int, height: int) -> SpriteLayout:
    """One tile per second, or a longer whole-millisecond interval so there are <= MAX_TILES."""
    interval = max(US, math.ceil(duration_us / MAX_TILES / 1000) * 1000)
    tile_width = max(2, round(TILE_HEIGHT * width / height / 2) * 2)
    return SpriteLayout(interval_us=interval, tile_width=tile_width, tile_height=TILE_HEIGHT)


def tile_count(duration_us: int, interval_us: int) -> int:
    return max(1, math.ceil(duration_us / interval_us))


def poster_time_us(duration_us: int) -> int:
    return min(US, duration_us // 10)


def make_poster(proxy: Path, out: Path, duration_us: int) -> None:
    run_ffmpeg(
        [
            "-ss",
            f"{poster_time_us(duration_us) / US:.6f}",
            "-i",
            str(proxy),
            "-frames:v",
            "1",
            "-vf",
            f"scale={POSTER_WIDTH}:-2",
            "-q:v",
            "3",
            str(out),
        ]
    )


def make_sprites(
    proxy: Path,
    out_dir: Path,
    duration_us: int,
    width: int,
    height: int,
    on_progress: FractionFn,
) -> dict[str, Any]:
    """Writes out_dir/sheet-NNN.jpg and returns the index (sheet names relative to out_dir)."""
    layout = sprite_layout(duration_us, width, height)
    count = tile_count(duration_us, layout.interval_us)
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        frames = Path(tmp)
        # Tile i is the first frame at or after i * interval. Each target is absolute
        # (selected_n * interval), so rounding never accumulates; 0.5 ms absorbs float error.
        select = f"gte(t+0.0005\\,selected_n*{layout.interval_us / US:.6f})"
        run_ffmpeg(
            [
                "-i",
                str(proxy),
                "-vf",
                f"select='{select}',scale={layout.tile_width}:{layout.tile_height}",
                "-fps_mode",
                "vfr",
                "-frames:v",
                str(count),
                "-q:v",
                "4",
                str(frames / "t-%05d.jpg"),
            ],
            duration_us,
            on_progress,
        )
        tiles = sorted(frames.glob("t-*.jpg"))
        sheets: list[str] = []
        per_sheet = COLUMNS * ROWS
        for sheet_index in range(math.ceil(len(tiles) / per_sheet)):
            batch = tiles[sheet_index * per_sheet : (sheet_index + 1) * per_sheet]
            rows = math.ceil(len(batch) / COLUMNS)
            sheet = Image.new(
                "RGB", (COLUMNS * layout.tile_width, rows * layout.tile_height), "black"
            )
            for i, tile_path in enumerate(batch):
                with Image.open(tile_path) as tile:
                    sheet.paste(
                        tile.convert("RGB"),
                        ((i % COLUMNS) * layout.tile_width, (i // COLUMNS) * layout.tile_height),
                    )
            name = f"sheet-{sheet_index:03d}.jpg"
            sheet.save(out_dir / name, quality=80)
            sheets.append(name)
    return {
        "version": 1,
        "intervalUs": layout.interval_us,
        "tileWidth": layout.tile_width,
        "tileHeight": layout.tile_height,
        "columns": COLUMNS,
        "rows": ROWS,
        "count": len(tiles),
        "sheets": sheets,
    }
