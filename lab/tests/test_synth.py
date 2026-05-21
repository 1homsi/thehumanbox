from __future__ import annotations

from thehumanbox_lab.synth import (
    augment_set,
    back_translate,
    generate_persona,
    generate_personas,
    generate_qa_pairs,
    generate_thoughts,
    paraphrase,
    permute,
)


def test_paraphrase_replaces_known_synonyms():
    out = paraphrase("I am tired and hungry", rng_seed=1)
    assert out != "I am tired and hungry"
    assert "tired" not in out.lower() or "hungry" not in out.lower()


def test_paraphrase_deterministic_with_seed():
    a = paraphrase("I am tired and hungry and afraid", rng_seed=42)
    b = paraphrase("I am tired and hungry and afraid", rng_seed=42)
    assert a == b


def test_paraphrase_handles_empty():
    assert paraphrase("", rng_seed=0) == ""


def test_paraphrase_preserves_unknown_words():
    out = paraphrase("xyzzy foo bar", rng_seed=5)
    assert "xyzzy" in out


def test_permute_reorders_multiclause():
    text = "I am tired, I am hungry, I am thirsty"
    out = permute(text, rng_seed=3)
    assert out != text
    assert "tired" in out and "hungry" in out and "thirsty" in out


def test_permute_short_returns_unchanged():
    assert permute("Just one clause", rng_seed=0) == "Just one clause"


def test_permute_preserves_terminal_punctuation():
    out = permute("I eat, I drink, I rest.", rng_seed=7)
    assert out.endswith(".")


def test_back_translate_runs():
    out = back_translate("I am tired and hungry", rng_seed=11)
    assert isinstance(out, str)
    assert len(out) > 0


def test_template_thoughts_count_and_uniqueness():
    thoughts = generate_thoughts("forage", n=10, seed=1)
    assert len(thoughts) == 10
    assert len(set(thoughts)) == 10


def test_template_thoughts_seed_deterministic():
    a = generate_thoughts("forage", n=5, seed=99)
    b = generate_thoughts("forage", n=5, seed=99)
    assert a == b


def test_augment_set_expands_to_target():
    base = ["I am tired", "I see water nearby", "I want to run fast"]
    out = augment_set(base, target_n=10, ops=["paraphrase", "permute"], seed=0)
    assert len(out) == 10
    for item in base:
        assert item in out


def test_augment_set_empty_input():
    assert augment_set([], target_n=5) == []


def test_augment_set_below_target_with_few_inputs():
    base = ["I am tired and hungry and afraid"]
    out = augment_set(base, target_n=4, ops=["paraphrase"], seed=2)
    assert len(out) >= 1
    assert base[0] in out


def test_generate_qa_pairs_basic():
    snapshot = {
        "tick": 42,
        "organisms": [
            {"id": "o1", "name": "Karen", "lineage_id": "L1", "thought": "I am hungry", "action": "foraging", "energy": 0.5, "health": 0.9},
            {"id": "o2", "name": "Bravo", "lineage_id": "L1", "thought": "watching", "action": "resting", "energy": 0.7, "health": 0.8},
        ],
    }
    pairs = generate_qa_pairs(snapshot, n=8, seed=0)
    assert len(pairs) == 8
    for pair in pairs:
        assert "question" in pair and "answer" in pair
        assert pair["answer"]


def test_generate_persona_shape():
    p = generate_persona(seed=1)
    assert "name" in p and "lineage" in p and "biography" in p
    assert isinstance(p["traits"], list) and p["traits"]


def test_generate_personas_count():
    personas = generate_personas(6, seed=3)
    assert len(personas) == 6
