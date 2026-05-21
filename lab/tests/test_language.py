from __future__ import annotations

from thehumanbox_lab.language.dialect import cluster_dialects
from thehumanbox_lab.language.edit_distance import levenshtein, normalized_levenshtein
from thehumanbox_lab.language.vocab_diff import vocab_diff


def test_levenshtein_identical():
    assert levenshtein("abc", "abc") == 0


def test_levenshtein_insertion_and_substitution():
    assert levenshtein("kitten", "sitting") == 3
    assert levenshtein("", "abcd") == 4
    assert levenshtein("abcd", "") == 4
    assert levenshtein("flaw", "lawn") == 2


def test_normalized_levenshtein_range():
    assert normalized_levenshtein("", "") == 0.0
    assert 0.0 < normalized_levenshtein("abc", "xyz") <= 1.0


def test_vocab_diff_symmetric_difference():
    a = {"food": "mago", "water": "tipa", "danger": "kruk"}
    b = {"food": "mago", "water": "lipa", "tribe": "noma"}
    diff = vocab_diff(a, b)
    assert diff["only_a"] == {"danger": "kruk"}
    assert diff["only_b"] == {"tribe": "noma"}
    assert diff["divergent"] == {"water": ("tipa", "lipa")}


def test_vocab_diff_empty_words_ignored():
    a = {"food": "mago", "water": ""}
    b = {"food": "mago", "water": "lipa"}
    diff = vocab_diff(a, b)
    assert diff["only_b"] == {"water": "lipa"}
    assert diff["only_a"] == {}
    assert diff["divergent"] == {}


def test_cluster_dialects_groups_similar_orgs():
    orgs = [
        {"id": "a1", "vocabulary": {"food": "mago", "water": "tipa", "danger": "kruk", "tribe": "noma"}},
        {"id": "a2", "vocabulary": {"food": "mago", "water": "tipa", "danger": "kruk", "tribe": "noma"}},
        {"id": "b1", "vocabulary": {"food": "zelu", "water": "varo", "danger": "blix", "tribe": "qopi"}},
        {"id": "b2", "vocabulary": {"food": "zelu", "water": "varo", "danger": "blix", "tribe": "qopi"}},
    ]
    assignments = cluster_dialects(orgs, n_clusters=2)
    assert assignments["a1"] == assignments["a2"]
    assert assignments["b1"] == assignments["b2"]
    assert assignments["a1"] != assignments["b1"]


def test_cluster_dialects_handles_empty():
    assert cluster_dialects([], n_clusters=2) == {}
