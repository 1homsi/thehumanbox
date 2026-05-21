from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from thehumanbox_lab.scoring import score
from thehumanbox_lab.scoring import coherence, interest, length
from thehumanbox_lab.scoring.aggregator import composite, normalize_weights
from thehumanbox_lab.scoring.calibrator import apply, fit
from thehumanbox_lab.scoring.judge_rubric import parse, render
from thehumanbox_lab.scoring.persona import score as persona_score
from thehumanbox_lab.scoring.registry import get, names


def test_coherence_clean_text():
    value = coherence.score("the wanderer rests under a quiet sky")
    assert 0.7 < value <= 1.0


def test_coherence_penalizes_repetition():
    repeated = "kin kin kin kin kin kin kin kin kin kin"
    clean = "the small one looks for kin across the hills"
    assert coherence.score(repeated) < coherence.score(clean)


def test_coherence_penalizes_caps_and_brackets():
    assert coherence.score("ABCDEFG HIJKLMN OPQRST UVWXYZ") < 0.5
    assert coherence.score("a sad ( thought without a close") < 1.0


def test_coherence_empty():
    assert coherence.score("") == 0.0


def test_interest_rewards_emotional_diverse():
    rich = "lonely wandering kin yearning beneath restless skies"
    plain = "the the the the the the"
    assert interest.score(rich) > interest.score(plain)


def test_interest_bounds():
    value = interest.score("curious tender weary haunted")
    assert 0.0 <= value <= 1.0


def test_length_ideal_range():
    assert length.score("one two three four five") == 1.0
    assert length.score("one two three four five six seven eight nine ten") == 1.0


def test_length_falloff():
    short = length.score("one two")
    long_text = length.score(" ".join(["word"] * 25))
    assert short < 1.0
    assert long_text < short or long_text < 1.0
    assert length.score("") == 0.0


def test_dispatcher_returns_all_dims():
    out = score("a weary wanderer aches for distant kin tonight")
    assert set(out.keys()) == {"coherence", "interest", "length"}
    assert all(0.0 <= v <= 1.0 for v in out.values())


def test_dispatcher_custom_dims():
    out = score("tired", dims=["length"])
    assert list(out.keys()) == ["length"]


def test_aggregator_weighted_mean():
    scores = {"a": 1.0, "b": 0.0}
    assert composite(scores, {"a": 1.0, "b": 1.0}) == 0.5
    assert composite(scores, {"a": 3.0, "b": 1.0}) == 0.75


def test_aggregator_empty_weights_uniform():
    assert composite({"a": 1.0, "b": 0.0}, {}) == 0.5


def test_aggregator_normalize_weights():
    norm = normalize_weights({"a": 2.0, "b": 2.0})
    assert abs(norm["a"] - 0.5) < 1e-9


def test_calibrator_fit_and_apply():
    pairs = [(0.0, 0.0), (0.5, 0.5), (1.0, 1.0)]
    cal = fit(pairs)
    assert abs(cal["slope"] - 1.0) < 1e-9
    assert abs(cal["intercept"]) < 1e-9
    assert abs(apply(0.4, cal) - 0.4) < 1e-9


def test_calibrator_shift():
    pairs = [(0.1, 0.3), (0.5, 0.7), (0.9, 1.0)]
    cal = fit(pairs)
    out = apply(0.5, cal)
    assert 0.0 <= out <= 1.0


def test_judge_rubric_roundtrip():
    prompt = render("wandering thought", "small organism, low energy")
    assert "relevance" in prompt and "wandering thought" in prompt
    response = "relevance: 8\ncoherence: 7\ncharm: 9\ncritique: tender phrasing"
    parsed = parse(response)
    assert parsed.relevance == 0.8
    assert parsed.coherence == 0.7
    assert parsed.charm == 0.9
    assert "tender" in parsed.critique


def test_persona_matches_state():
    organism = {"emotional_state": {"energy": 0.1, "fear": 0.0, "grief": 0.8}}
    aligned = persona_score(organism, "weary tired missing kin sorrow")
    misaligned = persona_score(organism, "vibrant racing alert dancing")
    assert aligned > misaligned


def test_registry_has_defaults():
    assert set(names()) >= {"coherence", "interest", "length"}
    fn = get("length")
    assert fn("one two three four five") == 1.0
