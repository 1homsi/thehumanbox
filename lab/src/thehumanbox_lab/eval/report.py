from __future__ import annotations

import html
import json
from typing import Any

_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>{title}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; background: #0b0d10; color: #e6e8eb; }}
h1, h2 {{ color: #f7f9fb; }}
.card {{ background: #14181d; border: 1px solid #232a31; border-radius: 8px; padding: 16px; margin: 12px 0; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
th, td {{ text-align: left; padding: 6px 10px; border-bottom: 1px solid #232a31; vertical-align: top; }}
th {{ color: #9aa3ad; font-weight: 600; }}
code, pre {{ background: #0f1318; padding: 2px 6px; border-radius: 4px; color: #b5d4ff; }}
pre {{ padding: 12px; overflow-x: auto; white-space: pre-wrap; }}
.kpi {{ display: inline-block; margin-right: 24px; }}
.kpi .v {{ font-size: 22px; font-weight: 700; color: #7ed3a2; }}
.kpi .l {{ font-size: 11px; text-transform: uppercase; color: #9aa3ad; }}
</style>
</head>
<body>
<h1>{title}</h1>
{summary_block}
{sections}
</body>
</html>
"""


def _kpi(label: str, value: Any) -> str:
    if isinstance(value, float):
        rendered = f"{value:.4f}" if abs(value) < 1000 else f"{value:.1f}"
    else:
        rendered = str(value)
    return f'<div class="kpi"><div class="v">{html.escape(rendered)}</div><div class="l">{html.escape(label)}</div></div>'


def _summary_block(summary: dict[str, Any]) -> str:
    if not summary:
        return ""
    kpis = "".join(_kpi(k, v) for k, v in summary.items())
    return f'<div class="card">{kpis}</div>'


def _table(rows: list[dict[str, Any]], limit: int = 50) -> str:
    if not rows:
        return "<p>No rows.</p>"
    shown = rows[:limit]
    columns = list({k for r in shown for k in r.keys()})
    head = "".join(f"<th>{html.escape(c)}</th>" for c in columns)
    body_parts = []
    for r in shown:
        cells = []
        for c in columns:
            v = r.get(c, "")
            if isinstance(v, float):
                cells.append(f"<td>{v:.4f}</td>")
            else:
                cells.append(f"<td>{html.escape(str(v))}</td>")
        body_parts.append("<tr>" + "".join(cells) + "</tr>")
    note = ""
    if len(rows) > limit:
        note = f"<p><em>Showing first {limit} of {len(rows)} rows.</em></p>"
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body_parts)}</tbody></table>{note}"


def render_html(report: dict[str, Any], title: str = "Eval Report") -> str:
    summary = report.get("summary", {}) if isinstance(report.get("summary"), dict) else {}
    sections: list[str] = []
    for key, value in report.items():
        if key == "summary":
            continue
        if isinstance(value, list) and value and isinstance(value[0], dict):
            sections.append(f'<div class="card"><h2>{html.escape(key)}</h2>{_table(value)}</div>')
        elif isinstance(value, dict):
            sections.append(
                f'<div class="card"><h2>{html.escape(key)}</h2><pre>{html.escape(json.dumps(value, indent=2))}</pre></div>'
            )
        else:
            sections.append(
                f'<div class="card"><h2>{html.escape(key)}</h2><pre>{html.escape(str(value))}</pre></div>'
            )
    return _PAGE.format(
        title=html.escape(title),
        summary_block=_summary_block(summary),
        sections="\n".join(sections),
    )


def write_report(report: dict[str, Any], path: str, title: str = "Eval Report") -> str:
    from pathlib import Path

    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_html(report, title=title), encoding="utf-8")
    return str(out)
