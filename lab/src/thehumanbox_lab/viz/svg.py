from __future__ import annotations

import math
from xml.sax.saxutils import escape

PALETTE = [
    "#e8c79a",
    "#a8d5ba",
    "#f4a261",
    "#9ec5fe",
    "#e76f51",
    "#bda3d4",
    "#c9b27a",
    "#7fb8a4",
]


def _header(w: int, h: int) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" font-family="ui-monospace, monospace" font-size="11">'
    )


def _bg(w: int, h: int) -> str:
    return f'<rect x="0" y="0" width="{w}" height="{h}" fill="#1f1d1a"/>'


def line_chart(series: dict[str, list[float]], title: str = "", w: int = 800, h: int = 300) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    pad_l, pad_r, pad_t, pad_b = 50, 20, 30, 30
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    all_vals = [v for s in series.values() for v in s] or [0.0]
    vmin = min(all_vals)
    vmax = max(all_vals)
    if vmax == vmin:
        vmax = vmin + 1.0
    max_len = max((len(s) for s in series.values()), default=1)
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    parts.append(
        f'<rect x="{pad_l}" y="{pad_t}" width="{plot_w}" height="{plot_h}" '
        f'fill="none" stroke="#3a352e"/>'
    )
    for i, (name, vals) in enumerate(series.items()):
        color = PALETTE[i % len(PALETTE)]
        if not vals:
            continue
        pts: list[str] = []
        for idx, v in enumerate(vals):
            x = pad_l + (idx / max(1, max_len - 1)) * plot_w
            y = pad_t + plot_h - ((v - vmin) / (vmax - vmin)) * plot_h
            pts.append(f"{x:.1f},{y:.1f}")
        parts.append(
            f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="1.5"/>'
        )
        parts.append(
            f'<text x="{w-pad_r-5}" y="{pad_t+14+i*14}" fill="{color}" text-anchor="end">{escape(name)}</text>'
        )
    parts.append(f'<text x="6" y="{pad_t+10}" fill="#a89d87">{vmax:.2f}</text>')
    parts.append(f'<text x="6" y="{pad_t+plot_h}" fill="#a89d87">{vmin:.2f}</text>')
    parts.append("</svg>")
    return "".join(parts)


def bar_chart(data: dict[str, float], title: str = "", w: int = 800, h: int = 300) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    pad_l, pad_r, pad_t, pad_b = 50, 20, 30, 60
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    items = list(data.items())
    vmax = max((v for _, v in items), default=1.0) or 1.0
    bar_w = plot_w / max(1, len(items))
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    for i, (label, val) in enumerate(items):
        bh = (val / vmax) * plot_h
        x = pad_l + i * bar_w + bar_w * 0.1
        y = pad_t + plot_h - bh
        color = PALETTE[i % len(PALETTE)]
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w*0.8:.1f}" height="{bh:.1f}" fill="{color}"/>'
        )
        parts.append(
            f'<text x="{x+bar_w*0.4:.1f}" y="{pad_t+plot_h+14}" fill="#d9c9a8" '
            f'text-anchor="middle" transform="rotate(25 {x+bar_w*0.4:.1f} {pad_t+plot_h+14})">{escape(str(label))}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


def pie_chart(slices: dict[str, float], title: str = "", w: int = 400, h: int = 320) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    cx, cy, r = w / 2, h / 2 + 10, min(w, h) * 0.32
    items = [(k, v) for k, v in slices.items() if v > 0]
    total = sum(v for _, v in items) or 1.0
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    a0 = -math.pi / 2
    for i, (label, val) in enumerate(items):
        frac = val / total
        a1 = a0 + frac * 2 * math.pi
        x0 = cx + r * math.cos(a0)
        y0 = cy + r * math.sin(a0)
        x1 = cx + r * math.cos(a1)
        y1 = cy + r * math.sin(a1)
        large = 1 if frac > 0.5 else 0
        color = PALETTE[i % len(PALETTE)]
        path = (
            f'M {cx:.1f} {cy:.1f} L {x0:.1f} {y0:.1f} '
            f'A {r:.1f} {r:.1f} 0 {large} 1 {x1:.1f} {y1:.1f} Z'
        )
        parts.append(f'<path d="{path}" fill="{color}" stroke="#1f1d1a" stroke-width="1"/>')
        ly = 40 + i * 14
        parts.append(f'<rect x="10" y="{ly-8}" width="10" height="10" fill="{color}"/>')
        parts.append(
            f'<text x="24" y="{ly}" fill="#d9c9a8">{escape(label)} ({frac*100:.1f}%)</text>'
        )
        a0 = a1
    parts.append("</svg>")
    return "".join(parts)
