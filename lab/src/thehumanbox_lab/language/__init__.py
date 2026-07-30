from __future__ import annotations

from .dialect import cluster_dialects
from .edit_distance import levenshtein
from .loan import detect_loan_words
from .report import build_report
from .spread import track_word_spread
from .vocab_diff import vocab_diff
from .word_freq import popular_drift, word_frequency

__all__ = [
    "build_report",
    "cluster_dialects",
    "detect_loan_words",
    "levenshtein",
    "popular_drift",
    "track_word_spread",
    "vocab_diff",
    "word_frequency",
]
