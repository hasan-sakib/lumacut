"""Usage: python -m lumacut_worker.samples OUT_DIR"""

import sys
from pathlib import Path

from lumacut_worker.logging import configure_logging
from lumacut_worker.samples.generate import generate


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    configure_logging("INFO", json=False)
    manifest = generate(Path(argv[1]))
    print(f"generated {len(manifest['files'])} files into {argv[1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
