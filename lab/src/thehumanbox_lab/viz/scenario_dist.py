from __future__ import annotations

from .svg import bar_chart


def scenario_dist_svg(
    counts: dict[str, float],
    title: str = "Scenario Frequencies",
    top_n: int = 20,
) -> str:
    items = sorted(counts.items(), key=lambda kv: float(kv[1]), reverse=True)[:top_n]
    data = {str(k): float(v) for k, v in items}
    return bar_chart(data, title=title)
