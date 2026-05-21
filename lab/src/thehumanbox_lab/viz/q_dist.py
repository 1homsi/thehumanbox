from __future__ import annotations

from xml.sax.saxutils import escape

from .svg import _bg, _header


def q_dist_svg(
    q_values: list[float],
    title: str = "Q-Value Distribution",
    bins: int = 24,
    w: int = 800,
    h: int = 300,
) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    pad_l, pad_r, pad_t, pad_b = 50, 20, 30, 40
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    if not q_values:
        parts.append(
            f'<text x="{w/2}" y="{h/2}" fill="#d9c9a8" text-anchor="middle">no data</text></svg>'
        )
        return "".join(parts)
    vmin = min(q_values)
    vmax = max(q_values)
    if vmax == vmin:
        vmax = vmin + 1.0
    width = (vmax - vmin) / bins
    counts = [0] * bins
    for v in q_values:
        idx = min(bins - 1, int((v - vmin) / width))
        counts[idx] += 1
    cmax = max(counts) or 1
    bw = plot_w / bins
    for i, c in enumerate(counts):
        bh = (c / cmax) * plot_h
        x = pad_l + i * bw
        y = pad_t + plot_h - bh
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bw-1:.1f}" height="{bh:.1f}" fill="#a8d5ba"/>'
        )
    parts.append(
        f'<rect x="{pad_l}" y="{pad_t}" width="{plot_w}" height="{plot_h}" '
        f'fill="none" stroke="#3a352e"/>'
    )
    parts.append(f'<text x="{pad_l}" y="{pad_t+plot_h+18}" fill="#a89d87">{vmin:.2f}</text>')
    parts.append(
        f'<text x="{pad_l+plot_w}" y="{pad_t+plot_h+18}" fill="#a89d87" text-anchor="end">{vmax:.2f}</text>'
    )
    parts.append(f'<text x="6" y="{pad_t+10}" fill="#a89d87">{cmax}</text>')
    parts.append("</svg>")
    return "".join(parts)
