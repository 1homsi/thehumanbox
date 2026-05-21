from __future__ import annotations

from xml.sax.saxutils import escape

from .svg import _bg, _header


def timeline_svg(
    events: list[dict],
    title: str = "Event Timeline",
    w: int = 900,
    h: int = 220,
) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    pad_l, pad_r, pad_t, pad_b = 40, 40, 30, 40
    plot_w = w - pad_l - pad_r
    axis_y = h - pad_b
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    if not events:
        parts.append(
            f'<text x="{w/2}" y="{h/2}" fill="#d9c9a8" text-anchor="middle">no events</text></svg>'
        )
        return "".join(parts)
    ticks = [int(e.get("tick", 0)) for e in events]
    tmin = min(ticks)
    tmax = max(ticks)
    if tmax == tmin:
        tmax = tmin + 1
    parts.append(
        f'<line x1="{pad_l}" y1="{axis_y}" x2="{w-pad_r}" y2="{axis_y}" '
        f'stroke="#a89d87" stroke-width="1"/>'
    )
    for i, ev in enumerate(events):
        t = int(ev.get("tick", 0))
        label = str(ev.get("label", ""))
        color = str(ev.get("color", "#e8c79a"))
        x = pad_l + ((t - tmin) / (tmax - tmin)) * plot_w
        y_lab = pad_t + 10 + (i % 5) * 22
        parts.append(
            f'<line x1="{x:.1f}" y1="{y_lab+4}" x2="{x:.1f}" y2="{axis_y}" '
            f'stroke="{color}" stroke-width="1" stroke-dasharray="2,2"/>'
        )
        parts.append(f'<circle cx="{x:.1f}" cy="{axis_y}" r="4" fill="{color}"/>')
        parts.append(
            f'<text x="{x+5:.1f}" y="{y_lab}" fill="#d9c9a8">{escape(label)} @{t}</text>'
        )
    parts.append(f'<text x="{pad_l}" y="{axis_y+18}" fill="#a89d87">tick {tmin}</text>')
    parts.append(
        f'<text x="{w-pad_r}" y="{axis_y+18}" fill="#a89d87" text-anchor="end">tick {tmax}</text>'
    )
    parts.append("</svg>")
    return "".join(parts)
