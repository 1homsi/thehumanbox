from __future__ import annotations

import argparse
import json
import sys

from thehumanbox_lab.training.cost_estimator import (
    GPU_PRICES_USD_PER_HOUR,
    estimate_cost,
)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Estimate fine-tune cost.")
    parser.add_argument("--gpu", default=None, help=f"one of {sorted(GPU_PRICES_USD_PER_HOUR)}")
    parser.add_argument("--dataset-tokens", type=int, required=True)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--tokens-per-second", type=float, default=1500.0)
    parser.add_argument("--overhead", type=float, default=1.15)
    parser.add_argument("--all", action="store_true", help="estimate for every GPU")
    args = parser.parse_args(argv[1:])

    if args.all:
        rows = []
        for gpu in sorted(GPU_PRICES_USD_PER_HOUR):
            est = estimate_cost(
                gpu,
                args.dataset_tokens,
                args.epochs,
                args.tokens_per_second,
                args.overhead,
            )
            rows.append(est.to_dict())
        rows.sort(key=lambda r: r["estimated_cost_usd"])
        print(json.dumps(rows, indent=2, sort_keys=True))
        return 0

    if args.gpu is None:
        parser.error("--gpu is required unless --all is set")
    est = estimate_cost(
        args.gpu,
        args.dataset_tokens,
        args.epochs,
        args.tokens_per_second,
        args.overhead,
    )
    print(json.dumps(est.to_dict(), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
