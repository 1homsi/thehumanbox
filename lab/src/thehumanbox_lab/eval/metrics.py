from __future__ import annotations

import math
import re
from collections import Counter

_WORD_RE = re.compile(r"[a-z0-9']+")


def _tokens(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def _ngrams(tokens: list[str], n: int) -> Counter:
    if n <= 0 or len(tokens) < n:
        return Counter()
    return Counter(tuple(tokens[i : i + n]) for i in range(len(tokens) - n + 1))


def _modified_precision(pred: list[str], ref: list[str], n: int) -> tuple[int, int]:
    pred_ng = _ngrams(pred, n)
    ref_ng = _ngrams(ref, n)
    if not pred_ng:
        return 0, 0
    overlap = 0
    for ng, count in pred_ng.items():
        overlap += min(count, ref_ng.get(ng, 0))
    total = sum(pred_ng.values())
    return overlap, total


def bleu(pred: str, ref: str, max_n: int = 4) -> float:
    pred_tokens = _tokens(pred)
    ref_tokens = _tokens(ref)
    if not pred_tokens or not ref_tokens:
        return 0.0
    weights = [1.0 / max_n] * max_n
    log_sum = 0.0
    for n in range(1, max_n + 1):
        overlap, total = _modified_precision(pred_tokens, ref_tokens, n)
        if total == 0:
            return 0.0
        p = (overlap + 1e-9) / (total + 1e-9)
        if p <= 0:
            return 0.0
        log_sum += weights[n - 1] * math.log(p)
    bp = 1.0
    if len(pred_tokens) < len(ref_tokens):
        bp = math.exp(1.0 - len(ref_tokens) / max(len(pred_tokens), 1))
    score = bp * math.exp(log_sum)
    return max(0.0, min(1.0, score))


def _lcs_length(a: list[str], b: list[str]) -> int:
    if not a or not b:
        return 0
    prev = [0] * (len(b) + 1)
    for ai in a:
        curr = [0] * (len(b) + 1)
        for j, bj in enumerate(b, start=1):
            if ai == bj:
                curr[j] = prev[j - 1] + 1
            else:
                curr[j] = max(curr[j - 1], prev[j])
        prev = curr
    return prev[-1]


def rouge_l(pred: str, ref: str, beta: float = 1.2) -> float:
    pred_tokens = _tokens(pred)
    ref_tokens = _tokens(ref)
    if not pred_tokens or not ref_tokens:
        return 0.0
    lcs = _lcs_length(pred_tokens, ref_tokens)
    if lcs == 0:
        return 0.0
    p = lcs / len(pred_tokens)
    r = lcs / len(ref_tokens)
    denom = r + (beta * beta) * p
    if denom == 0:
        return 0.0
    f = ((1 + beta * beta) * p * r) / denom
    return max(0.0, min(1.0, f))


def _char_ngrams(text: str, n: int) -> Counter:
    cleaned = text.lower().strip()
    if len(cleaned) < n:
        return Counter()
    return Counter(cleaned[i : i + n] for i in range(len(cleaned) - n + 1))


def chrf(pred: str, ref: str, n: int = 6, beta: float = 2.0) -> float:
    if not pred.strip() or not ref.strip():
        return 0.0
    p_total = 0.0
    r_total = 0.0
    counts = 0
    for k in range(1, n + 1):
        pred_ng = _char_ngrams(pred, k)
        ref_ng = _char_ngrams(ref, k)
        if not pred_ng or not ref_ng:
            continue
        overlap = sum(min(c, ref_ng.get(g, 0)) for g, c in pred_ng.items())
        p = overlap / sum(pred_ng.values())
        r = overlap / sum(ref_ng.values())
        p_total += p
        r_total += r
        counts += 1
    if counts == 0:
        return 0.0
    p_avg = p_total / counts
    r_avg = r_total / counts
    denom = beta * beta * p_avg + r_avg
    if denom == 0:
        return 0.0
    f = (1 + beta * beta) * p_avg * r_avg / denom
    return max(0.0, min(1.0, f))


def jaccard_words(pred: str, ref: str) -> float:
    p = set(_tokens(pred))
    r = set(_tokens(ref))
    if not p and not r:
        return 1.0
    if not p or not r:
        return 0.0
    return len(p & r) / len(p | r)
