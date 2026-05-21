# Scoring rubric

The lab supports two complementary scoring approaches: heuristic
scorers that run locally without an LLM, and an LLM-as-judge rubric
for higher-quality but more expensive evaluation.

## Heuristic dimensions (in `thehumanbox_lab.scoring`)

### coherence (0..1)

Penalises:
- Repeated 3-grams (boilerplate / loops)
- Excess capitalisation (>30% of letters)
- Unbalanced quotes / parentheses
- Trailing fragments

A score of 1.0 means clean prose. Below 0.5 usually indicates a
generation failure mode.

### interest (0..1)

Rewards:
- Vocabulary diversity (unique tokens / total tokens)
- Uncommon words (length > 6 characters)
- Emotional descriptors from a small lexicon

A boring "I am hungry" scores low. "haunted by the famine, I forage
silently" scores high.

### length (0..1)

Sweet-spot scoring. 5–15 word completions get 1.0. Outside that range
the score falls off symmetrically. Bias against both terse and
rambling generations.

### persona (0..1)

Compares an organism record's emotional_state (energy, fear,
loneliness, grief) against sentiment heuristics on the completion.
A grieving organism producing a cheerful thought scores low. An
energetic organism producing a despairing thought also scores low.

## Composite

`aggregator.composite(scores, weights)` produces a weighted mean.
Default weights:

```python
{"coherence": 0.35, "interest": 0.30, "length": 0.10, "persona": 0.25}
```

Tune weights per dataset — production fine-tunes weight `persona`
higher, idea-generation runs weight `interest` higher.

## LLM judge rubric

`scoring.judge_rubric` provides a template asking the judge model for
three numeric scores plus a free-form critique:

```
You are evaluating an organism's inner thought.

Persona: {persona}
Scenario: {scenario}
Thought: {completion}

Score 1-10 on each axis:
- relevance: does the thought fit the scenario?
- coherence: is the language clean and grammatical?
- charm: does the thought have voice / texture?

Then write one sentence of critique.
```

The parser extracts the three numbers from the response (regex on
`(relevance|coherence|charm):\s*(\d+)`). If parsing fails the row is
dropped, not scored as 0 (avoids contaminating averages).

## Calibration

If you have human-labeled scores (e.g. from a small annotator pool),
`scoring.calibrator.fit(pairs)` produces a simple linear calibration
mapping heuristic → human-calibrated. Apply it before reporting
composites externally — heuristic-only scores are systematically
high.
