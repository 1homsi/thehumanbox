from __future__ import annotations

from .edit_distance import levenshtein
from .vocab_diff import vocab_diff
from .word_freq import word_frequency, popular_drift
from .dialect import cluster_dialects
from .spread import track_word_spread
from .loan import detect_loan_words
from .report import build_report

__all__ = [
    "levenshtein",
    "vocab_diff",
    "word_frequency",
    "popular_drift",
    "cluster_dialects",
    "track_word_spread",
    "detect_loan_words",
    "build_report",
]
