from __future__ import annotations

import random
from typing import Callable, Iterable

from .back_translate import back_translate
from .paraphrase import paraphrase
from .permute import permute

OP_REGISTRY: dict[str, Callable[[str, int], str]] = {
    "paraphrase": lambda text, seed: paraphrase(text, rng_seed=seed),
    "permute": lambda text, seed: permute(text, rng_seed=seed),
    "back_translate": lambda text, seed: back_translate(text, rng_seed=seed),
}


def augment_set(
    prompts: Iterable[str],
    target_n: int,
    ops: list[str] | None = None,
    seed: int = 0,
) -> list[str]:
    base = [p for p in prompts if p and p.strip()]
    if not base:
        return []
    operations = ops or ["paraphrase", "permute"]
    valid = [op for op in operations if op in OP_REGISTRY]
    if not valid:
        valid = ["paraphrase"]
    rng = random.Random(seed)
    results: list[str] = list(dict.fromkeys(base))
    if len(results) >= target_n:
        return results[:target_n]
    attempts = 0
    max_attempts = target_n * 20
    while len(results) < target_n and attempts < max_attempts:
        source = rng.choice(base)
        op_name = rng.choice(valid)
        op_seed = rng.randrange(1, 1 << 30)
        try:
            candidate = OP_REGISTRY[op_name](source, op_seed)
        except Exception:
            attempts += 1
            continue
        if candidate and candidate not in results and candidate.strip():
            results.append(candidate)
        attempts += 1
    if len(results) < target_n:
        chain_ops = valid
        idx = 0
        while len(results) < target_n and idx < len(base) * 8:
            source = base[idx % len(base)]
            seed_a = rng.randrange(1, 1 << 30)
            seed_b = rng.randrange(1, 1 << 30)
            op_a = OP_REGISTRY[chain_ops[0]]
            op_b = OP_REGISTRY[chain_ops[-1]]
            chained = op_b(op_a(source, seed_a), seed_b)
            if chained and chained not in results:
                results.append(chained)
            idx += 1
    return results[:target_n]
