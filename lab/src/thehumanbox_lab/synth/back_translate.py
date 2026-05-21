from __future__ import annotations

from .paraphrase import paraphrase


def back_translate(text: str, rng_seed: int = 0) -> str:
    if not text:
        return text
    seed_a = (rng_seed * 2654435761 + 1) & 0xFFFFFFFF
    seed_b = (rng_seed * 40503 + 7) & 0xFFFFFFFF
    if seed_a == seed_b:
        seed_b = (seed_b + 17) & 0xFFFFFFFF
    once = paraphrase(text, rng_seed=seed_a)
    twice = paraphrase(once, rng_seed=seed_b)
    return twice
