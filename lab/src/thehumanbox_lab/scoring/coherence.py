from __future__ import annotations

import re

WORD_RE = re.compile(r"[A-Za-z']+")
PAIRS = [("(", ")"), ("[", "]"), ("{", "}")]


def _tokens(text: str) -> list[str]:
    return WORD_RE.findall(text)


def _trigrams(tokens: list[str]) -> list[tuple[str, str, str]]:
    return [(tokens[i], tokens[i + 1], tokens[i + 2]) for i in range(len(tokens) - 2)]


def _repeat_penalty(tokens: list[str]) -> float:
    grams = _trigrams([t.lower() for t in tokens])
    if not grams:
        return 0.0
    unique = len(set(grams))
    total = len(grams)
    repeated = total - unique
    return min(1.0, repeated / max(1, total))


def _caps_penalty(text: str) -> float:
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return 0.0
    caps = sum(1 for c in letters if c.isupper())
    ratio = caps / len(letters)
    if ratio <= 0.3:
        return 0.0
    return min(1.0, ((ratio - 0.3) / 0.7) * 1.6)


def _bracket_penalty(text: str) -> float:
    score = 0.0
    for opener, closer in PAIRS:
        if text.count(opener) != text.count(closer):
            score += 0.34
    if text.count('"') % 2 != 0:
        score += 0.34
    if text.count("'") % 2 != 0 and not re.search(r"[A-Za-z]'[A-Za-z]", text):
        score += 0.34
    return min(1.0, score)


def score(text: str) -> float:
    if not text or not text.strip():
        return 0.0
    tokens = _tokens(text)
    penalties = [
        _repeat_penalty(tokens),
        _caps_penalty(text),
        _bracket_penalty(text),
    ]
    raw = 1.0 - min(1.0, sum(penalties))
    return max(0.0, min(1.0, raw))
