from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = REPO_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from thehumanbox_lab.model_registry import (
    ModelEntry,
    diff,
    filter as filter_entries,
    find,
    load_all_cards,
    load_registry,
    pretty_table,
)


def test_load_registry_returns_entries():
    entries = load_registry()
    assert len(entries) >= 12
    assert all(isinstance(e, ModelEntry) for e in entries)
    for entry in entries:
        assert entry.name
        assert entry.family
        assert entry.params_b is not None


def test_load_registry_has_expected_families():
    entries = load_registry()
    families = {e.family for e in entries}
    expected = {"gemma2", "qwen2.5", "phi3.5", "llama3.2", "smollm2", "tinyllama", "mistral"}
    assert expected.issubset(families)


def test_find_known_model():
    entry = find("google/gemma-2-2b-it")
    assert entry is not None
    assert entry.family == "gemma2"
    assert entry.params_b == 2.0


def test_find_missing_returns_none():
    assert find("does/not-exist") is None


def test_filter_by_family():
    qwen = filter_entries(family="qwen2.5")
    assert len(qwen) >= 3
    assert all(e.family == "qwen2.5" for e in qwen)


def test_filter_by_max_size():
    small = filter_entries(max_params_b=1.0)
    assert all(e.params_b <= 1.0 for e in small)
    assert any(e.family == "smollm2" for e in small)


def test_filter_by_license():
    apache = filter_entries(license="apache-2.0")
    assert all(e.license == "apache-2.0" for e in apache)
    assert len(apache) >= 3


def test_filter_combined():
    result = filter_entries(family="qwen2.5", max_params_b=2.0)
    assert all(e.family == "qwen2.5" and e.params_b <= 2.0 for e in result)
    names = {e.name for e in result}
    assert "Qwen/Qwen2.5-0.5B-Instruct" in names
    assert "Qwen/Qwen2.5-7B-Instruct" not in names


def test_pretty_table_contains_headers_and_data():
    entries = filter_entries(family="mistral")
    table = pretty_table(entries)
    assert "name" in table
    assert "params_b" in table
    assert "mistralai/Mistral-7B-Instruct-v0.3" in table


def test_diff_between_two_models():
    result = diff("Qwen/Qwen2.5-0.5B-Instruct", "Qwen/Qwen2.5-7B-Instruct")
    assert result["a"] == "Qwen/Qwen2.5-0.5B-Instruct"
    assert result["b"] == "Qwen/Qwen2.5-7B-Instruct"
    differences = result["differences"]
    assert "params_b" in differences
    assert differences["params_b"]["a"] == 0.5
    assert differences["params_b"]["b"] == 7.0
    assert "family" not in differences


def test_diff_missing_raises():
    with pytest.raises(KeyError):
        diff("ghost-a", "ghost-b")


def test_load_all_cards():
    cards = load_all_cards()
    assert len(cards) >= 6
    for card in cards:
        assert "model_id" in card
        assert "license" in card
        assert "intended_use" in card
        assert "smoke_test_prompt" in card
        assert "smoke_test_expected_fragment" in card


def test_registry_json_is_valid():
    raw = json.loads((REPO_ROOT / "models" / "registry.json").read_text(encoding="utf-8"))
    assert "models" in raw
    assert isinstance(raw["models"], list)
