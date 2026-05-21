from __future__ import annotations

from .svg import pie_chart


def death_pie_svg(death_causes: dict[str, float], title: str = "Death Causes") -> str:
    data = {str(k): float(v) for k, v in death_causes.items() if float(v) > 0}
    return pie_chart(data, title=title)
