from __future__ import annotations

from xml.sax.saxutils import escape

_STYLE = """
:root { color-scheme: dark; }
body { background: #1f1d1a; color: #f5e6c8; font-family: ui-monospace, monospace;
       margin: 0; padding: 24px; }
header { border-bottom: 1px solid #3a352e; padding-bottom: 12px; margin-bottom: 20px; }
h1 { color: #e8c79a; font-weight: 500; margin: 0 0 4px 0; }
h2 { color: #a8d5ba; font-weight: 500; border-bottom: 1px solid #3a352e;
     padding-bottom: 6px; margin-top: 28px; }
.meta { color: #a89d87; font-size: 12px; }
section { margin-bottom: 28px; }
.chunk { margin: 12px 0; }
.kv { color: #d9c9a8; font-size: 13px; }
.kv b { color: #e8c79a; }
"""


def render_html(title: str, sections: list[dict], subtitle: str = "") -> str:
    parts: list[str] = [
        "<!DOCTYPE html><html lang=\"en\"><head>",
        "<meta charset=\"utf-8\">",
        f"<title>{escape(title)}</title>",
        f"<style>{_STYLE}</style>",
        "</head><body>",
        "<header>",
        f"<h1>{escape(title)}</h1>",
    ]
    if subtitle:
        parts.append(f'<div class="meta">{escape(subtitle)}</div>')
    parts.append("</header>")
    for sec in sections:
        heading = str(sec.get("heading", ""))
        parts.append("<section>")
        if heading:
            parts.append(f"<h2>{escape(heading)}</h2>")
        for chunk in sec.get("chunks", []):
            parts.append(f'<div class="chunk">{chunk}</div>')
        parts.append("</section>")
    parts.append("</body></html>")
    return "".join(parts)
