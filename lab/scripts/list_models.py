from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from thehumanbox_lab.model_registry import filter as filter_entries
from thehumanbox_lab.model_registry import pretty_table


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="list models from the lab registry")
    parser.add_argument("--family", default=None)
    parser.add_argument("--max-size", type=float, default=None, dest="max_size")
    parser.add_argument("--min-eval", type=float, default=None, dest="min_eval")
    parser.add_argument("--license", default=None)
    parser.add_argument("--registry", default=None)
    args = parser.parse_args(argv)

    entries = filter_entries(
        family=args.family,
        max_params_b=args.max_size,
        min_eval=args.min_eval,
        license=args.license,
        path=args.registry,
    )
    print(pretty_table(entries))
    print(f"\n{len(entries)} model(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
