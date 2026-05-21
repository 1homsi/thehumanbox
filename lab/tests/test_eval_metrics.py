from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from thehumanbox_lab.eval.drift import compute_drift
from thehumanbox_lab.eval.latency import bench
from thehumanbox_lab.eval.metrics import bleu, chrf, jaccard_words, rouge_l
from thehumanbox_lab.eval.report import render_html
from thehumanbox_lab.eval.semantic import tfidf_cosine


def test_bleu_identical_high():
    score = bleu("the river is dangerous tonight", "the river is dangerous tonight")
    assert score > 0.9


def test_bleu_disjoint_zero():
    assert bleu("alpha bravo charlie delta", "x y z q") == 0.0


def test_bleu_empty_zero():
    assert bleu("", "anything here") == 0.0
    assert bleu("anything", "") == 0.0


def test_rouge_l_identical_high():
    score = rouge_l("safer ground east of the river", "safer ground east of the river")
    assert score > 0.95


def test_rouge_l_partial_match():
    score = rouge_l("safer ground east river", "safer ground east of the river")
    assert 0.5 < score < 1.0


def test_rouge_l_disjoint_zero():
    assert rouge_l("foo bar baz", "alpha beta gamma") == 0.0


def test_jaccard_identical():
    assert jaccard_words("hello world", "hello world") == 1.0


def test_jaccard_disjoint():
    assert jaccard_words("a b c", "d e f") == 0.0


def test_jaccard_partial():
    score = jaccard_words("the fox runs", "the fox sleeps")
    assert 0.0 < score < 1.0


def test_jaccard_empty_both():
    assert jaccard_words("", "") == 1.0


def test_chrf_identical():
    assert chrf("hello there", "hello there") > 0.9


def test_chrf_disjoint_low():
    assert chrf("abcdef", "uvwxyz") < 0.3


def test_tfidf_identical_one():
    score = tfidf_cosine("organism moves to the river", "organism moves to the river")
    assert score > 0.99


def test_tfidf_disjoint_low():
    score = tfidf_cosine("aaaaa", "zzzzz")
    assert score < 0.2


def test_tfidf_related_higher_than_unrelated():
    related = tfidf_cosine("dangerous deep water nearby", "deep water is dangerous")
    unrelated = tfidf_cosine("dangerous deep water nearby", "sunny meadow flowers bloom")
    assert related > unrelated


def test_tfidf_empty():
    assert tfidf_cosine("", "anything") == 0.0


def test_compute_drift_basic():
    baseline = [{"id": "a", "score": 0.5}, {"id": "b", "score": 0.7}, {"id": "c", "score": 0.9}]
    current = [{"id": "a", "score": 0.6}, {"id": "b", "score": 0.4}, {"id": "c", "score": 0.9}]
    drift = compute_drift(baseline, current)
    assert drift["summary"]["n_shared"] == 3.0
    assert drift["summary"]["regressions"] == 1.0
    assert drift["summary"]["improvements"] == 1.0
    assert drift["top_movers"][0]["id"] == "b"


def test_bench_runs_and_summary():
    def fake(prompt: str) -> str:
        return prompt.upper()

    result = bench(fake, ["a", "bb", "ccc"], warmup=1, label="fake")
    summary = result["summary"]
    assert summary["count"] == 3.0
    assert summary["errors"] == 0.0
    assert summary["p95_ms"] >= summary["p50_ms"]
    assert result["outputs"] == ["A", "BB", "CCC"]


def test_render_html_contains_summary():
    payload = {"summary": {"accuracy": 0.81, "count": 10.0}, "rows": [{"id": "x", "score": 0.5}]}
    html = render_html(payload, title="Demo")
    assert "<html" in html
    assert "Demo" in html
    assert "accuracy" in html
    assert "rows" in html
