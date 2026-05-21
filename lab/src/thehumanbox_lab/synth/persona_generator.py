from __future__ import annotations

import random

FIRST_SYLLABLES = ["Ka", "Mo", "Lin", "Ra", "Vel", "Tor", "Sy", "Bra", "Nim", "Oro", "Quil", "Eth", "Zar"]
SECOND_SYLLABLES = ["ren", "vix", "mara", "thos", "lia", "dun", "kar", "nis", "vor", "tia", "phex", "wen"]

TRAITS = [
    "cautious", "bold", "curious", "patient", "restless", "loyal", "solitary",
    "cooperative", "fierce", "gentle", "stoic", "anxious", "playful", "vigilant",
]

OCCUPATIONS = ["scout", "forager", "guardian", "wanderer", "hunter", "watcher", "elder", "tracker"]

BIRTH_EVENTS = [
    "born during a thunderstorm",
    "hatched at the river bend",
    "born under a red moon",
    "found wandering at the cliff base",
    "born into a lineage of scouts",
    "the first of a new clutch",
]

DEFINING_MOMENTS = [
    "survived a wolf attack as a juvenile",
    "led the herd through a drought",
    "lost a sibling to a predator",
    "discovered a hidden water source",
    "fled a wildfire and returned",
    "fought a rival and won",
]


def _name(rng: random.Random) -> str:
    return rng.choice(FIRST_SYLLABLES) + rng.choice(SECOND_SYLLABLES)


def generate_persona(seed: int = 0) -> dict[str, object]:
    rng = random.Random(seed)
    name = _name(rng)
    lineage = _name(rng) + "-line"
    trait_count = rng.randint(2, 4)
    traits = rng.sample(TRAITS, k=min(trait_count, len(TRAITS)))
    occupation = rng.choice(OCCUPATIONS)
    birth = rng.choice(BIRTH_EVENTS)
    moment = rng.choice(DEFINING_MOMENTS)
    age = rng.randint(1, 200)
    biography = (
        f"{name} of {lineage} is a {occupation} known to be "
        f"{', '.join(traits[:-1])} and {traits[-1]}. "
        f"They were {birth}, and at age {max(1, age // 3)} they {moment}."
    )
    return {
        "name": name,
        "lineage": lineage,
        "traits": traits,
        "occupation": occupation,
        "age_ticks": age,
        "biography": biography,
    }


def generate_personas(n: int, seed: int = 0) -> list[dict[str, object]]:
    rng = random.Random(seed)
    out: list[dict[str, object]] = []
    seen: set[str] = set()
    attempts = 0
    while len(out) < n and attempts < n * 20:
        sub_seed = rng.randrange(1, 1 << 30)
        persona = generate_persona(seed=sub_seed)
        key = str(persona["name"]) + "/" + str(persona["lineage"])
        if key not in seen:
            seen.add(key)
            out.append(persona)
        attempts += 1
    return out
