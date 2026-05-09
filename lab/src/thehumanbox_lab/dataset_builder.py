from __future__ import annotations

from collections import defaultdict

from .schemas import ThoughtExample, TraceEvent
from .task_specs import THOUGHT_V1, TaskSpec


def build_thought_examples(
    events: list[TraceEvent], window: int = 4, task_spec: TaskSpec = THOUGHT_V1
) -> list[ThoughtExample]:
    grouped: dict[str, list[TraceEvent]] = defaultdict(list)
    for event in sorted(events, key=lambda item: (item.organism_id, item.tick)):
        grouped[event.organism_id].append(event)

    examples: list[ThoughtExample] = []
    for organism_events in grouped.values():
        for index in range(1, len(organism_events)):
            history = organism_events[max(0, index - window):index]
            current = organism_events[index]
            if not history or not current.text.strip():
                continue
            prompt = render_prompt(history, current, task_spec=task_spec)
            response = current.text.strip()
            tags = sorted({item.event_type for item in history + [current]})
            examples.append(
                ThoughtExample(
                    organism_id=current.organism_id,
                    lineage_id=current.lineage_id,
                    prompt=prompt,
                    response=response,
                    source_ticks=[item.tick for item in history] + [current.tick],
                    tags=tags,
                )
            )
    return examples


def render_prompt(
    history: list[TraceEvent], current: TraceEvent, task_spec: TaskSpec = THOUGHT_V1
) -> str:
    lines = [
        f"Task: {task_spec.name}",
        f"Organism: {current.organism_name}",
        f"Lineage: {current.lineage_id or 'unknown'}",
        "Recent events:",
    ]
    for item in history:
        lines.append(
            f"- tick={item.tick} type={item.event_type} "
            f"energy={item.state.get('energy', 0.0):.2f} "
            f"hydration={item.state.get('hydration', 0.0):.2f} "
            f"health={item.state.get('health', 0.0):.2f} "
            f"fear={item.state.get('fear', 0.0):.2f} "
            f"text={item.text}"
        )
    lines.append(f"Instruction: {task_spec.instruction}")
    return "\n".join(lines)
