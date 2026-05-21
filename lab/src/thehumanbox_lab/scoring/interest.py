from __future__ import annotations

import re

WORD_RE = re.compile(r"[A-Za-z']+")

EMOTION_LEXICON = {
    "lonely", "afraid", "hungry", "tired", "weary", "anxious",
    "yearning", "grieving", "missing", "longing", "restless",
    "curious", "wandering", "calm", "peaceful", "joyful",
    "fearful", "hopeful", "tender", "bitter", "haunted",
    "wistful", "aching", "drained", "sorrow", "kin",
}


def _tokens(text: str) -> list[str]:
    return [token.lower() for token in WORD_RE.findall(text)]


def _diversity(tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    return len(set(tokens)) / len(tokens)


def _uncommon_ratio(tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    long_tokens = sum(1 for token in tokens if len(token) > 6)
    return long_tokens / len(tokens)


def _emotion_hits(tokens: list[str]) -> float:
    if not tokens:
        return 0.0
    hits = sum(1 for token in tokens if token in EMOTION_LEXICON)
    return min(1.0, hits / max(1, len(tokens) / 3))


def score(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    tokens = _tokens(text)
    diversity = _diversity(tokens)
    uncommon = _uncommon_ratio(tokens)
    emotion = _emotion_hits(tokens)
    raw = 0.4 * diversity + 0.3 * uncommon + 0.3 * emotion
    return max(0.0, min(1.0, raw))
