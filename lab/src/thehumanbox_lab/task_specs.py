from __future__ import annotations

from dataclasses import dataclass
import re


@dataclass(frozen=True, slots=True)
class TaskSpec:
    name: str
    system_prompt: str
    instruction: str
    max_words: int


THOUGHT_V1 = TaskSpec(
    name="thought-v1",
    system_prompt=(
        "You write the next internal thought of a simulated organism. "
        "Stay grounded in survival, memory, fear, social ties, and terrain. "
        "Do not narrate. Do not explain. Return one short first-person thought."
    ),
    instruction=(
        "Write one short first-person thought under 12 words. "
        "No quotes. No dialogue. No extra explanation."
    ),
    max_words=12,
)


def get_task_spec(name: str) -> TaskSpec:
    if name == THOUGHT_V1.name:
        return THOUGHT_V1
    raise KeyError(f"unknown task spec: {name}")


SPACE_RE = re.compile(r"\s+")


def compact_response(text: str, max_words: int) -> str:
    cleaned = SPACE_RE.sub(" ", text.replace("\n", " ").strip()).strip("\"' ")
    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words])
    return cleaned
