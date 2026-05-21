from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.viz import (
    death_pie_svg,
    heatmap_svg,
    lineage_pop_svg,
    q_dist_svg,
    render_html,
    scenario_dist_svg,
    timeline_svg,
)


def _fetch_json(url: str) -> dict:
    try:
        with urllib.request.urlopen(url, timeout=4) as r:
            return json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError):
        return {}


def _demo_data() -> dict:
    return {
        "pop_history": [
            {"tick": i * 50, "populations": {"alpha": 20 + i * 3, "beta": 10 + i, "gamma": 5}}
            for i in range(12)
        ],
        "death_causes": {"starvation": 42, "predation": 18, "old_age": 25, "thirst": 9},
        "scenario_counts": {f"act_{i}": 30 - i * 2 for i in range(10)},
        "q_values": [0.1 * i - 1.0 for i in range(40)] + [0.5, 0.6, 0.7, 0.4],
        "terrain": [[((r + c) % 8) / 8.0 for c in range(20)] for r in range(12)],
        "timeline": [
            {"tick": 0, "label": "boot", "color": "#a8d5ba"},
            {"tick": 250, "label": "first_word", "color": "#e8c79a"},
            {"tick": 500, "label": "lineage_split", "color": "#f4a261"},
            {"tick": 900, "label": "vocab_drift", "color": "#9ec5fe"},
        ],
    }


def build(snapshot_url: str, out_path: Path) -> Path:
    snap = _fetch_json(snapshot_url) if snapshot_url else {}
    data = {**_demo_data(), **{k: v for k, v in snap.items() if v}}
    sections = [
        {"heading": "Lineage Populations", "chunks": [lineage_pop_svg(data["pop_history"])]},
        {"heading": "Death Causes", "chunks": [death_pie_svg(data["death_causes"])]},
        {"heading": "Scenario Distribution", "chunks": [scenario_dist_svg(data["scenario_counts"])]},
        {"heading": "Q-Value Distribution", "chunks": [q_dist_svg(data["q_values"])]},
        {"heading": "Terrain Heatmap", "chunks": [heatmap_svg(data["terrain"])]},
        {"heading": "Event Timeline", "chunks": [timeline_svg(data["timeline"])]},
    ]
    subtitle = f"generated {datetime.now(timezone.utc).isoformat(timespec='seconds')}"
    html = render_html("The Human Box — Lab Report", sections, subtitle=subtitle)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")
    return out_path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--snapshot-url", default="")
    ap.add_argument("--out", default=str(ROOT / "reports" / "latest.html"))
    args = ap.parse_args()
    path = build(args.snapshot_url, Path(args.out))
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
