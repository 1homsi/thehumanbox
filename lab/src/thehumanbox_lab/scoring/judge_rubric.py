from __future__ import annotations

import re
from dataclasses import dataclass

RUBRIC_TEMPLATE = """You are scoring an organism's inner thought for a simulated world.

Thought:
{thought}

Organism context:
{context}

Rate each dimension from 0 to 10 (integers only):
- relevance: how well the thought fits the organism's situation
- coherence: how grammatical and well-formed the thought reads
- charm: how evocative or in-character the thought feels

Respond exactly in this format:
relevance: <int>
coherence: <int>
charm: <int>
critique: <one or two sentences>
"""

LINE_RE = re.compile(r"^\s*(relevance|coherence|charm)\s*:\s*(-?\d+(?:\.\d+)?)", re.IGNORECASE | re.MULTILINE)
CRITIQUE_RE = re.compile(r"critique\s*:\s*(.+)", re.IGNORECASE | re.DOTALL)


@dataclass(slots=True)
class JudgeScores:
    relevance: float
    coherence: float
    charm: float
    critique: str

    def as_dict(self) -> dict[str, float | str]:
        return {
            "relevance": self.relevance,
            "coherence": self.coherence,
            "charm": self.charm,
            "critique": self.critique,
        }


def render(thought: str, context: str) -> str:
    return RUBRIC_TEMPLATE.format(thought=thought.strip(), context=context.strip())


def parse(response: str) -> JudgeScores:
    found = {match.group(1).lower(): float(match.group(2)) for match in LINE_RE.finditer(response)}
    critique_match = CRITIQUE_RE.search(response)
    critique = critique_match.group(1).strip() if critique_match else ""
    return JudgeScores(
        relevance=found.get("relevance", 0.0) / 10.0,
        coherence=found.get("coherence", 0.0) / 10.0,
        charm=found.get("charm", 0.0) / 10.0,
        critique=critique,
    )
