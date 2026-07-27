from __future__ import annotations

import random
import re

SYNONYMS: dict[str, list[str]] = {
    "tired": ["weary", "exhausted", "drained"],
    "hungry": ["starved", "famished", "ravenous"],
    "thirsty": ["parched", "dehydrated"],
    "afraid": ["scared", "frightened", "fearful"],
    "happy": ["glad", "content", "pleased"],
    "sad": ["sorrowful", "downcast", "gloomy"],
    "angry": ["furious", "irate", "incensed"],
    "calm": ["serene", "tranquil", "composed"],
    "fast": ["swift", "quick", "rapid"],
    "slow": ["sluggish", "leisurely"],
    "big": ["large", "huge", "massive"],
    "small": ["tiny", "little", "diminutive"],
    "strong": ["robust", "sturdy", "powerful"],
    "weak": ["frail", "feeble"],
    "see": ["spot", "observe", "notice"],
    "look": ["gaze", "peer"],
    "run": ["dash", "sprint", "bolt"],
    "walk": ["stroll", "amble"],
    "eat": ["consume", "devour"],
    "drink": ["sip", "gulp"],
    "find": ["discover", "locate"],
    "search": ["seek", "hunt"],
    "near": ["close", "nearby"],
    "far": ["distant", "remote"],
    "good": ["fine", "decent"],
    "bad": ["poor", "lousy"],
    "want": ["desire", "crave"],
    "need": ["require", "must have"],
    "think": ["ponder", "consider"],
    "feel": ["sense", "experience"],
    "go": ["head", "move"],
    "stay": ["remain", "linger"],
    "rest": ["repose", "pause"],
    "fight": ["battle", "clash"],
    "flee": ["escape", "retreat"],
    "danger": ["threat", "peril"],
    "safe": ["secure", "protected"],
    "food": ["sustenance", "rations"],
    "water": ["liquid", "moisture"],
    "enemy": ["foe", "adversary"],
    "friend": ["ally", "companion"],
}


def _pick_replacement(word: str, rng: random.Random) -> str:
    lower = word.lower()
    if lower not in SYNONYMS:
        return word
    choice = rng.choice(SYNONYMS[lower])
    if word[:1].isupper():
        return choice[:1].upper() + choice[1:]
    return choice


def paraphrase(text: str, rng_seed: int = 0) -> str:
    if not text:
        return text
    rng = random.Random(rng_seed)
    tokens = re.findall(r"\w+|[^\w\s]+|\s+", text)
    out: list[str] = []
    for token in tokens:
        if token.strip() and token[:1].isalpha() and rng.random() < 0.7:
            out.append(_pick_replacement(token, rng))
            continue
        out.append(token)
    return "".join(out)
