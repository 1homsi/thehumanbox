from __future__ import annotations

import random

TEMPLATES: list[str] = [
    "{emotion} after {action}",
    "I feel {emotion} because I {past_action}",
    "{observation}, so I will {plan}",
    "{emotion} and {emotion2}, time to {plan}",
    "I {past_action} and now I am {emotion}",
    "Must {plan}, I am {emotion}",
    "{observation} near me, I should {plan}",
    "Thinking about {noun}, feeling {emotion}",
    "{plan} before I become more {emotion}",
    "Was {emotion} but now I {past_action}",
]

LEXICONS: dict[str, list[str]] = {
    "emotion": ["tired", "hungry", "afraid", "calm", "alert", "weary", "hopeful", "anxious", "content"],
    "emotion2": ["thirsty", "restless", "wary", "curious", "focused", "drained"],
    "action": ["foraging", "running from the predator", "drinking at the river", "resting in shade"],
    "past_action": ["ate berries", "fled the wolf", "rested briefly", "drank water", "fought a rival"],
    "observation": ["A shadow moved", "Water glints ahead", "The herd is gone", "Prey is near", "Storm clouds gather"],
    "plan": ["find food", "rest a while", "seek shelter", "drink water", "rejoin the group", "scout the ridge"],
    "noun": ["the river", "my lineage", "the herd", "the cliff", "the night", "yesterday's hunt"],
}


def _fill(template: str, rng: random.Random, scenario: str) -> str:
    out = template
    for key, values in LEXICONS.items():
        token = "{" + key + "}"
        while token in out:
            choice = rng.choice(values)
            out = out.replace(token, choice, 1)
    if scenario and rng.random() < 0.3:
        out = f"[{scenario}] {out}"
    return out


def generate_thoughts(scenario: str, n: int, seed: int = 0) -> list[str]:
    rng = random.Random(seed)
    results: list[str] = []
    seen: set[str] = set()
    attempts = 0
    while len(results) < n and attempts < n * 10:
        template = rng.choice(TEMPLATES)
        text = _fill(template, rng, scenario)
        if text not in seen:
            seen.add(text)
            results.append(text)
        attempts += 1
    return results
