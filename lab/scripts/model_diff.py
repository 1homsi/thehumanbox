from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = SCRIPT_DIR.parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from thehumanbox_lab.model_registry import diff


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="diff two models in the lab registry")
    parser.add_argument("name_a")
    parser.add_argument("name_b")
    parser.add_argument("--registry", default=None)
    args = parser.parse_args(argv)

    result = diff(args.name_a, args.name_b, path=args.registry)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
