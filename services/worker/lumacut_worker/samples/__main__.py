"""Usage: python -m lumacut_worker.samples [--fixtures | --perf-media] OUT_DIR

Without a flag: the full sample set (`make samples`). --fixtures: the small engine fixtures
(`make fixtures`). --perf-media: M1 renditions of the 1080p samples for `make perf`; OUT_DIR is the
samples directory (they are written to OUT_DIR/perf).
"""

import sys
from pathlib import Path

from lumacut_core.logging import configure_logging
from lumacut_worker.samples.generate import generate


def main(argv: list[str]) -> int:
    args = argv[1:]
    fixtures = "--fixtures" in args
    perf = "--perf-media" in args
    args = [a for a in args if a not in ("--fixtures", "--perf-media")]
    if len(args) != 1:
        print(__doc__, file=sys.stderr)
        return 2
    configure_logging("INFO", json=False)
    if perf:
        from lumacut_worker.samples.perf_media import generate_perf_media

        samples = Path(args[0])
        manifest = generate_perf_media(samples, samples / "perf")
    elif fixtures:
        from lumacut_worker.samples.fixtures import generate_fixtures

        manifest = generate_fixtures(Path(args[0]))
    else:
        manifest = generate(Path(args[0]))
    print(f"generated {len(manifest['files'])} files into {args[0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
