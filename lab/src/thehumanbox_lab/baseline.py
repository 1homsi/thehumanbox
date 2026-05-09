from __future__ import annotations

import re


EVENT_RE = re.compile(
    r"type=(?P<event_type>\w+).*?energy=(?P<energy>[0-9.]+).*?hydration=(?P<hydration>[0-9.]+).*?"
    r"health=(?P<health>[0-9.]+).*?fear=(?P<fear>[0-9.]+).*?text=(?P<text>.*)$"
)


def predict_thought(prompt: str) -> str:
    event_lines = [line for line in prompt.splitlines() if line.startswith("- tick=")]
    if not event_lines:
        return "I need to understand what is happening"

    match = EVENT_RE.search(event_lines[-1])
    if not match:
        return "something important is changing"

    event_type = match.group("event_type")
    energy = float(match.group("energy"))
    hydration = float(match.group("hydration"))
    health = float(match.group("health"))
    fear = float(match.group("fear"))
    text = match.group("text").lower()

    if hydration < 0.35:
        return "I need water"
    if energy < 0.30:
        return "I need to rest"
    if health < 0.45:
        return "I am hurt and need safety"
    if fear > 0.65 or event_type == "danger":
        return "this feels dangerous"
    if event_type == "migration":
        return "there may be better land ahead"
    if event_type == "social":
        return "I should stay close to the others"
    if event_type == "memory":
        return "I remember this place"
    if "water" in text:
        return "I should be careful near the water"
    if "home" in text:
        return "I should return home"
    return "I should keep moving"
