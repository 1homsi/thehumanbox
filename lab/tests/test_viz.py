from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

import pytest

from thehumanbox_lab.viz import (
    bar_chart,
    death_pie_svg,
    heatmap_svg,
    line_chart,
    lineage_pop_svg,
    pie_chart,
    q_dist_svg,
    render_html,
    scenario_dist_svg,
    timeline_svg,
)


def _parse(svg: str) -> ET.Element:
    return ET.fromstring(svg)


def test_line_chart_valid_xml():
    svg = line_chart({"a": [1.0, 2.0, 3.0], "b": [3.0, 2.0, 1.0]}, title="t")
    root = _parse(svg)
    assert root.tag.endswith("svg")


def test_bar_chart_valid_xml():
    root = _parse(bar_chart({"x": 1.0, "y": 2.0, "z": 3.0}))
    assert root.tag.endswith("svg")


def test_pie_chart_valid_xml():
    root = _parse(pie_chart({"a": 1.0, "b": 2.0}))
    assert root.tag.endswith("svg")


def test_pie_chart_empty_does_not_crash():
    root = _parse(pie_chart({}))
    assert root.tag.endswith("svg")


def test_lineage_pop_svg_valid():
    rows = [
        {"tick": 0, "populations": {"a": 10, "b": 5}},
        {"tick": 10, "populations": {"a": 12, "b": 6}},
        {"tick": 20, "populations": {"a": 11, "b": 9}},
    ]
    root = _parse(lineage_pop_svg(rows))
    assert root.tag.endswith("svg")


def test_lineage_pop_empty():
    root = _parse(lineage_pop_svg([]))
    assert root.tag.endswith("svg")


def test_death_pie_svg_valid():
    root = _parse(death_pie_svg({"starvation": 5, "predation": 2}))
    assert root.tag.endswith("svg")


def test_scenario_dist_svg_valid():
    root = _parse(scenario_dist_svg({f"s{i}": float(i) for i in range(5)}))
    assert root.tag.endswith("svg")


def test_q_dist_svg_valid():
    root = _parse(q_dist_svg([0.1, 0.2, 0.5, -0.3, 0.4, 0.9, -1.0, 0.7]))
    assert root.tag.endswith("svg")


def test_q_dist_empty():
    root = _parse(q_dist_svg([]))
    assert root.tag.endswith("svg")


def test_heatmap_valid():
    grid = [[float((r + c) % 5) for c in range(8)] for r in range(6)]
    root = _parse(heatmap_svg(grid))
    assert root.tag.endswith("svg")


def test_heatmap_empty():
    root = _parse(heatmap_svg([]))
    assert root.tag.endswith("svg")


def test_timeline_valid():
    events = [
        {"tick": 0, "label": "boot", "color": "#a8d5ba"},
        {"tick": 100, "label": "first", "color": "#e8c79a"},
    ]
    root = _parse(timeline_svg(events))
    assert root.tag.endswith("svg")


def test_timeline_handles_special_chars():
    events = [{"tick": 5, "label": "a&b<c>", "color": "#fff"}]
    root = _parse(timeline_svg(events))
    assert root.tag.endswith("svg")


class _HP(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack: list[str] = []
        self.ok = True

    def handle_starttag(self, tag, attrs):
        if tag not in {"meta", "br", "img", "link", "hr"}:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()


def test_render_html_well_formed():
    sections = [
        {"heading": "h1", "chunks": [line_chart({"a": [1, 2, 3]})]},
        {"heading": "h2", "chunks": [pie_chart({"a": 1, "b": 2})]},
    ]
    html = render_html("title", sections, subtitle="sub")
    assert html.startswith("<!DOCTYPE html>")
    assert "title" in html
    p = _HP()
    p.feed(html)
    assert p.ok


def test_notebooks_are_valid_json():
    nb_dir = Path(__file__).resolve().parents[1] / "notebooks"
    nbs = list(nb_dir.glob("*.ipynb"))
    assert nbs
    for path in nbs:
        data = json.loads(path.read_text())
        assert data["nbformat"] == 4
        assert "cells" in data


@pytest.mark.parametrize(
    "svg_func,arg",
    [
        (lambda: line_chart({}), None),
        (lambda: bar_chart({}), None),
    ],
)
def test_edge_empty_inputs(svg_func, arg):
    root = _parse(svg_func())
    assert root.tag.endswith("svg")
