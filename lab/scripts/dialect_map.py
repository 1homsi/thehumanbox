from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.request import urlopen

from thehumanbox_lab.language.dialect import cluster_dialects


def _load(source: str) -> dict:
    if source.startswith(("http://", "https://")):
        with urlopen(source) as resp:
            raw = resp.read()
    else:
        raw = Path(source).read_bytes()
    try:
        import msgpack
        return msgpack.unpackb(raw, raw=False)
    except (TypeError, ValueError, UnicodeError):
        return json.loads(raw.decode("utf-8"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Cluster organisms into dialect groups")
    parser.add_argument("source", help="URL or local file path to a snapshot")
    parser.add_argument("--clusters", type=int, default=4)
    parser.add_argument(
        "--concepts",
        nargs="*",
        default=["food", "water", "danger", "tribe"],
    )
    parser.add_argument("--format", choices=["json", "tsv"], default="json")
    args = parser.parse_args(argv)
    snap = _load(args.source)
    orgs = snap.get("organisms") or snap.get("orgs") or []
    assignments = cluster_dialects(orgs, concepts=args.concepts, n_clusters=args.clusters)
    if args.format == "tsv":
        sys.stdout.write("organism_id\tcluster_id\n")
        for org_id, cid in sorted(assignments.items(), key=lambda kv: (kv[1], kv[0])):
            sys.stdout.write(f"{org_id}\t{cid}\n")
    else:
        sys.stdout.write(json.dumps(assignments, indent=2, sort_keys=True))
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
