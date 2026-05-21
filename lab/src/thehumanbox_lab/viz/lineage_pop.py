from __future__ import annotations

from xml.sax.saxutils import escape

from .svg import PALETTE, _bg, _header


def lineage_pop_svg(
    pop_history: list[dict],
    title: str = "Lineage Populations",
    w: int = 800,
    h: int = 340,
) -> str:
    parts: list[str] = [_header(w, h), _bg(w, h)]
    pad_l, pad_r, pad_t, pad_b = 50, 130, 30, 30
    plot_w = w - pad_l - pad_r
    plot_h = h - pad_t - pad_b
    lineages: list[str] = []
    seen: set[str] = set()
    for row in pop_history:
        for k in row.get("populations", {}).keys():
            if k not in seen:
                seen.add(k)
                lineages.append(k)
    if not pop_history or not lineages:
        parts.append(
            f'<text x="{w/2}" y="{h/2}" fill="#d9c9a8" text-anchor="middle">no data</text></svg>'
        )
        return "".join(parts)
    n = len(pop_history)
    stacks: list[list[float]] = []
    for row in pop_history:
        pops = row.get("populations", {})
        stacks.append([float(pops.get(lin, 0)) for lin in lineages])
    max_total = max(sum(col) for col in stacks) or 1.0
    parts.append(
        f'<text x="{w/2}" y="18" fill="#f5e6c8" text-anchor="middle">{escape(title)}</text>'
    )
    parts.append(
        f'<rect x="{pad_l}" y="{pad_t}" width="{plot_w}" height="{plot_h}" '
        f'fill="none" stroke="#3a352e"/>'
    )
    cum_top = [0.0] * n
    for li, lin in enumerate(lineages):
        color = PALETTE[li % len(PALETTE)]
        top_pts: list[tuple[float, float]] = []
        bot_pts: list[tuple[float, float]] = []
        for i in range(n):
            x = pad_l + (i / max(1, n - 1)) * plot_w
            below = cum_top[i]
            above = below + stacks[i][li]
            y_below = pad_t + plot_h - (below / max_total) * plot_h
            y_above = pad_t + plot_h - (above / max_total) * plot_h
            bot_pts.append((x, y_below))
            top_pts.append((x, y_above))
            cum_top[i] = above
        poly = top_pts + list(reversed(bot_pts))
        pts_str = " ".join(f"{x:.1f},{y:.1f}" for x, y in poly)
        parts.append(f'<polygon points="{pts_str}" fill="{color}" fill-opacity="0.85"/>')
        ly = pad_t + 12 + li * 14
        parts.append(
            f'<rect x="{w-pad_r+5}" y="{ly-8}" width="10" height="10" fill="{color}"/>'
        )
        parts.append(f'<text x="{w-pad_r+20}" y="{ly}" fill="#d9c9a8">{escape(lin)}</text>')
    parts.append(f'<text x="6" y="{pad_t+10}" fill="#a89d87">{max_total:.0f}</text>')
    parts.append(f'<text x="6" y="{pad_t+plot_h}" fill="#a89d87">0</text>')
    parts.append("</svg>")
    return "".join(parts)
