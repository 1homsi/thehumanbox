from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

WORD_RE = re.compile(r"[A-Za-z']+")

LOW_ENERGY = {"tired", "weary", "drained", "exhausted", "spent", "sluggish"}
HIGH_ENERGY = {"vibrant", "racing", "alert", "restless", "dancing", "running"}
FEAR_WORDS = {"afraid", "fear", "terrified", "anxious", "panicked", "trembling"}
GRIEF_WORDS = {"grief", "missing", "lost", "mourning", "aching", "kin", "sorrow"}


def _tokens(text: str) -> set[str]:
    return {token.lower() for token in WORD_RE.findall(text)}


def _band(value: float, hits: int, expect_high: bool) -> float:
    expected = value if expect_high else 1.0 - value
    signal = min(1.0, hits / 2.0)
    return 1.0 - abs(expected - signal)


def score(organism: Mapping[str, Any], thought: str) -> float:
    if not thought or not thought.strip():
        return 0.0
    state = organism.get("emotional_state") or organism.get("state") or {}
    energy = float(state.get("energy", 0.5))
    fear = float(state.get("fear", 0.0))
    grief = float(state.get("grief", 0.0))
    tokens = _tokens(thought)
    low_hits = len(tokens & LOW_ENERGY)
    high_hits = len(tokens & HIGH_ENERGY)
    fear_hits = len(tokens & FEAR_WORDS)
    grief_hits = len(tokens & GRIEF_WORDS)
    energy_band = _band(energy, high_hits, True)
    drain_band = _band(energy, low_hits, False)
    fear_band = _band(fear, fear_hits, True)
    grief_band = _band(grief, grief_hits, True)
    composite = (energy_band + drain_band + fear_band + grief_band) / 4.0
    return max(0.0, min(1.0, composite))
