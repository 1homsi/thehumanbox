from __future__ import annotations

from .back_translate import back_translate
from .paraphrase import SYNONYMS, paraphrase
from .permute import permute
from .persona_generator import generate_persona, generate_personas
from .qa_pairs import generate_qa_pairs
from .scenario_augment import augment_set
from .template_thoughts import generate_thoughts

__all__ = [
    "SYNONYMS",
    "augment_set",
    "back_translate",
    "generate_persona",
    "generate_personas",
    "generate_qa_pairs",
    "generate_thoughts",
    "paraphrase",
    "permute",
]
