from __future__ import annotations

from xml.sax.saxutils import escape

from .svg import _bg, _header


def _color(t: float) -> str:
    t = max(0.0, min(1.0, t))
    r = int(31 + (232 - 31) * t)
    g = int(29 + (199 - 29) * t)
    b = int(26 + (154 - 26) * t)
    return f"rgb({r},{g},{b})"


def heatmap_svg(
    grid: list[list[float]],
    title: str = "Heatmap",
    w: int = 600,
    h: int = 400,
) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    pad_l, pad_r, pad_t, pad_b = 30, 30, 30, 30
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    if not grid or not grid[0]:
        parts.append(
            f'<text x="{w/2}" y="{h/2}" fill="#d9c9a8" text-anchor="middle">no data</text></svg>'
        )
        return "".join(parts)
    rows = len(grid)
    cols = len(grid[0])
    vmin = min(min(row) for row in grid)
    vmax = max(max(row) for row in grid)
    if vmax == vmin:
        vmax = vmin + 1.0
    cw = plot_w / cols
    ch = plot_h / rows
    for r_idx, row in enumerate(grid):
        for c_idx, v in enumerate(row):
            t = (v - vmin) / (vmax - vmin)
            x = pad_l + c_idx * cw
            y = pad_t + r_idx * ch
            parts.append(
                f'<rect x="{x:.1f}" y="{y:.1f}" width="{cw+0.5:.1f}" height="{ch+0.5:.1f}" fill="{_color(t)}"/>'
            )
    parts.append(
        f'<rect x="{pad_l}" y="{pad_t}" width="{plot_w}" height="{plot_h}" '
        f'fill="none" stroke="#3a352e"/>'
    )
    parts.append("</svg>")
    return "".join(parts)
