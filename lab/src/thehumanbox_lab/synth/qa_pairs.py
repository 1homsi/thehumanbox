from __future__ import annotations

import random
from typing import Any

QUESTION_TEMPLATES: list[tuple[str, str]] = [
    ("organism", "What does {name} do?"),
    ("organism", "What is {name} thinking?"),
    ("organism", "How is {name} feeling?"),
    ("organism", "Where is {name} right now?"),
    ("lineage", "How is lineage {lineage} doing?"),
    ("lineage", "What is the status of lineage {lineage}?"),
    ("world", "What is happening in the world?"),
    ("world", "Describe the current tick."),
]


def _describe_organism(org: dict[str, Any]) -> str:
    name = str(org.get("name", org.get("id", "unknown")))
    thought = str(org.get("thought", "")).strip()
    action = str(org.get("action", "")).strip()
    energy = float(org.get("energy", 0.0))
    health = float(org.get("health", 0.0))
    pieces = [f"{name} is currently"]
    if action:
        pieces.append(action)
    else:
        pieces.append("idling")
    pieces.append(f"(energy={energy:.2f}, health={health:.2f})")
    if thought:
        pieces.append(f"and thinking: '{thought}'")
    return " ".join(pieces) + "."


def _describe_lineage(lineage_id: str, members: list[dict[str, Any]]) -> str:
    if not members:
        return f"Lineage {lineage_id} has no living members."
    count = len(members)
    avg_health = sum(float(m.get("health", 0.0)) for m in members) / count
    avg_energy = sum(float(m.get("energy", 0.0)) for m in members) / count
    return (
        f"Lineage {lineage_id} has {count} member(s); "
        f"avg health {avg_health:.2f}, avg energy {avg_energy:.2f}."
    )


def _describe_world(snapshot: dict[str, Any]) -> str:
    tick = snapshot.get("tick", 0)
    organisms = snapshot.get("organisms", []) or []
    return f"At tick {tick}, {len(organisms)} organism(s) are alive in the world."


def generate_qa_pairs(snapshot: dict[str, Any], n: int = 20, seed: int = 0) -> list[dict[str, str]]:
    rng = random.Random(seed)
    organisms = list(snapshot.get("organisms", []) or [])
    lineages: dict[str, list[dict[str, Any]]] = {}
    for org in organisms:
        lid = str(org.get("lineage_id", "unknown"))
        lineages.setdefault(lid, []).append(org)
    pairs: list[dict[str, str]] = []
    attempts = 0
    while len(pairs) < n and attempts < n * 10:
        scope, template = rng.choice(QUESTION_TEMPLATES)
        attempts += 1
        if scope == "organism" and organisms:
            org = rng.choice(organisms)
            name = str(org.get("name", org.get("id", "unknown")))
            question = template.format(name=name)
            answer = _describe_organism(org)
        elif scope == "lineage" and lineages:
            lid = rng.choice(list(lineages.keys()))
            question = template.format(lineage=lid)
            answer = _describe_lineage(lid, lineages[lid])
        elif scope == "world":
            question = template
            answer = _describe_world(snapshot)
        else:
            continue
        pairs.append({"question": question, "answer": answer})
    return pairs
