use std::collections::HashMap;
use rand::Rng;
use serde::{Serialize, Deserialize};

pub const CONCEPTS: &[&str] = &[
    "food", "water", "fire", "danger", "friend",
    "foe", "shelter", "hunt", "night", "day",
    "sick", "home", "group", "alone",
    "sun", "moon", "star", "sky", "rain",
    "storm", "wind", "snow", "ice", "cloud",
    "river", "lake", "sea", "mountain", "forest",
    "tree", "grass", "stone", "sand", "earth",
    "cave", "path", "world",
    "hunger", "thirst", "pain", "tired", "strong",
    "weak", "hurt", "heal", "rest", "sleep",
    "breath", "blood", "old", "young", "born",
    "death", "life",
    "fear", "joy", "anger", "sad", "love",
    "hate", "calm", "brave", "lonely", "hope",
    "trust", "grief", "pride", "shame", "curious",
    "kin", "child", "mother", "father", "elder",
    "mate", "stranger", "leader", "tribe", "ally",
    "gift", "share", "help", "teach", "learn",
    "story", "song", "dance", "play", "talk",
    "listen", "greet", "fight", "war", "peace",
    "trade",
    "go", "come", "stay", "run", "climb",
    "swim", "dig", "build", "break", "carry",
    "give", "find", "see", "hear", "hide",
    "watch", "follow", "lead", "gather", "plant",
    "make",
    "cold", "warm", "dark", "light", "big",
    "small", "near", "far", "many", "good",
    "bad", "new", "here", "there",
    "meat", "berry", "root", "wood", "tool",
    "trap", "spear", "basket", "medicine", "farm",
    "nest", "name", "time", "season",
    "eye", "ear", "hand", "foot", "mouth",
    "skin", "heart", "voice", "scent", "bone",
    "birth", "wedding", "funeral", "ancestor", "twin",
    "orphan", "widow", "sibling", "blood-kin", "lineage",
    "wolf", "bird", "deer", "bear", "snake",
    "insect", "beast", "prey", "predator", "flock",
    "pack", "swarm",
    "cliff", "ridge", "plain", "marsh", "swamp",
    "oasis", "dune", "glacier", "shore", "island",
    "crater", "gorge", "meadow", "grove", "thicket",
    "clearing", "valley", "hill", "spring",
    "dawn", "dusk", "twilight", "fog", "frost",
    "hail", "thunder", "lightning", "rainbow", "drought",
    "flood", "heat", "eclipse",
    "clay", "mud", "hide", "fur", "feather",
    "shell", "salt", "charcoal", "ore", "metal",
    "gem", "flint", "thread",
    "truth", "lie", "secret", "promise", "oath",
    "law", "custom", "tradition", "memory", "dream",
    "idea", "plan", "choice", "fate", "luck",
    "omen", "sign", "mystery", "wisdom", "honor",
    "duty", "freedom", "power", "change", "beginning",
    "ending", "journey", "return", "loss", "gain",
    "debt", "balance",
    "bless", "curse", "forgive", "betray", "protect",
    "abandon", "rescue", "sacrifice", "scatter", "destroy",
    "create", "mend", "sharpen", "carve", "weave",
    "guard", "chase", "flee", "attack", "defend",
    "one", "two", "three", "half", "whole",
    "none", "all", "more", "less", "enough",
    "empty", "full",
    "red", "blue", "green", "yellow", "white",
    "black", "brown", "grey",
    "flower", "leaf", "seed", "vine", "moss",
    "fern", "reed", "bark", "branch", "thorn",
    "fruit", "nut", "herb", "sprout", "blossom",
    "morning", "noon", "evening", "midnight", "year",
    "moment", "forever", "soon", "early", "late",
    "north", "south", "east", "west", "up",
    "down", "forward", "back", "between", "above",
    "below", "inside", "outside", "around",
    "cry", "shout", "whisper", "laugh", "roar",
    "howl", "call", "echo", "silence", "noise",
    "growl", "hum",
    "worry", "relief", "longing", "envy", "gratitude",
    "regret", "awe", "disgust", "surprise", "sorrow",
    "delight", "dread", "yearning", "serenity",
    "council", "clan", "family", "band", "gathering",
    "market", "border", "neighbor", "kinship", "guest",
    "jump", "crawl", "crouch", "reach", "grab",
    "throw", "push", "pull", "kick", "bite",
    "sniff", "blink", "nod", "point", "wave",
    "kneel",
    "question", "answer", "word", "language", "speech",
    "skill", "craft", "work", "effort", "ease",
    "meaning", "purpose", "reason", "cause",
    "heavy", "hard", "soft", "sharp", "dull",
    "smooth", "rough", "wet", "dry", "hot",
    "fast", "slow", "loud", "quiet", "bright",
    "deep", "shallow", "high", "low", "wide",
];

const CONSONANTS: &[u8] = b"bdfghjklmnprstvwz";
const VOWELS:     &[u8] = b"aeiou";

fn gen_syllable(rng: &mut impl Rng) -> String {
    let mut s = String::new();
    s.push(CONSONANTS[rng.gen_range(0..CONSONANTS.len())] as char);
    s.push(VOWELS[rng.gen_range(0..VOWELS.len())] as char);
    s
}

fn gen_word(rng: &mut impl Rng) -> String {
    let syllables = rng.gen_range(1usize..=2);
    (0..syllables).map(|_| gen_syllable(rng)).collect()
}

pub fn gen_phoneme_word(rng: &mut impl Rng) -> String {
    gen_word(rng)
}

#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Vocabulary {
    pub words: HashMap<String, String>,
}

impl Vocabulary {
    pub fn generate(rng: &mut impl Rng) -> Self {
        let mut words = HashMap::new();
        for &concept in CONCEPTS {
            words.insert(concept.to_string(), gen_word(rng));
        }
        Vocabulary { words }
    }

    pub fn inherit_from(parent: &Vocabulary, rng: &mut impl Rng) -> Self {
        let mut words = parent.words.clone();
        for word in words.values_mut() {
            if rng.gen::<f32>() < 0.03 {
                let bytes = word.as_bytes().to_vec();
                let pos = rng.gen_range(0..bytes.len());
                let mut mutated = bytes;
                if pos % 2 == 0 {
                    mutated[pos] = CONSONANTS[rng.gen_range(0..CONSONANTS.len())];
                } else {
                    mutated[pos] = VOWELS[rng.gen_range(0..VOWELS.len())];
                }
                *word = String::from_utf8_lossy(&mutated).to_string();
            }
        }
        Vocabulary { words }
    }

    pub fn absorb_from(&mut self, other: &Vocabulary, rng: &mut impl Rng) {
        let concepts: Vec<&str> = CONCEPTS.iter()
            .filter(|&&c| {
                let mine  = self.words.get(c).map(|s| s.as_str()).unwrap_or("");
                let theirs = other.words.get(c).map(|s| s.as_str()).unwrap_or("");
                !mine.is_empty() && !theirs.is_empty() && mine != theirs
            })
            .copied()
            .collect();
        if concepts.is_empty() { return; }
        if rng.gen::<f32>() < 0.06 {
            let concept = concepts[rng.gen_range(0..concepts.len())];
            if let Some(word) = other.words.get(concept) {
                self.words.insert(concept.to_string(), word.clone());
            }
        }
    }

    pub fn converge_with(
        &mut self,
        snapshots: &[std::collections::HashMap<String, String>],
        rng: &mut impl Rng,
        adopt_rate: f32,
    ) {
        for &concept in CONCEPTS {
            if rng.gen::<f32>() >= adopt_rate { continue; }
            let mut counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
            for snap in snapshots {
                if let Some(w) = snap.get(concept) {
                    *counts.entry(w.as_str()).or_insert(0) += 1;
                }
            }
            if let Some((&majority, _)) = counts.iter().max_by_key(|(_, &c)| c) {
                let mine = self.words.get(concept).map(|s| s.as_str()).unwrap_or("");
                if mine != majority {
                    self.words.insert(concept.to_string(), majority.to_string());
                }
            }
        }
    }

    pub fn word_for<'a>(&'a self, concept: &'a str) -> &'a str {
        self.words.get(concept).map(|s| s.as_str()).unwrap_or(concept)
    }
}
