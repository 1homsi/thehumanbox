from __future__ import annotations

import re

WORD_RE = re.compile(r"[A-Za-z0-9']+")

LOWER_IDEAL = 5
UPPER_IDEAL = 15
FALLOFF = 10.0


def _count(text: str) -> int:
    return len(WORD_RE.findall(text))


def score(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    count = _count(text)
    if LOWER_IDEAL <= count <= UPPER_IDEAL:
        return 1.0
    if count < LOWER_IDEAL:
        distance = LOWER_IDEAL - count
    else:
        distance = count - UPPER_IDEAL
    decayed = max(0.0, 1.0 - distance / FALLOFF)
    return decayed
