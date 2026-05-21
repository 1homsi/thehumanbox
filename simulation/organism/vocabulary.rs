use std::collections::HashMap;
use std::sync::OnceLock;
use rand::Rng;
use serde::{Serialize, Serializer, Deserialize, Deserializer};

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

/// Concept name → index in `CONCEPTS`, computed once. Used by all
/// lookup methods so we never re-scan the slice.
fn concept_index() -> &'static HashMap<&'static str, usize> {
    static IDX: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();
    IDX.get_or_init(|| {
        CONCEPTS.iter().enumerate().map(|(i, &c)| (c, i)).collect()
    })
}

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

/// Per-organism vocabulary. Internally a positional `Vec<String>`
/// indexed by `CONCEPTS` position — no per-organism `HashMap`
/// allocations, no key Strings, and slot lookups are an O(1) hash
/// against a single shared concept-index map. With ~280 concepts ×
/// hundreds of organisms this trims ~3+ MB of HashMap bucket
/// overhead off resident memory at steady state.
///
/// Wire/save format is unchanged: a custom Serialize / Deserialize
/// impl converts to and from the previous `HashMap<String, String>`
/// shape, so persisted saves and client wire frames keep working
/// with no migration.
#[derive(Default, Clone)]
pub struct Vocabulary {
    /// One slot per concept (same length and order as `CONCEPTS`).
    /// Empty string = the organism doesn't have a word for the
    /// concept yet.
    slots: Vec<String>,
    last_used: Vec<u64>,
}

impl Vocabulary {
    pub fn generate(rng: &mut impl Rng) -> Self {
        let mut slots = Vec::with_capacity(CONCEPTS.len());
        for _ in CONCEPTS { slots.push(gen_word(rng)); }
        let last_used = vec![0u64; slots.len()];
        Vocabulary { slots, last_used }
    }

    pub fn inherit_from(parent: &Vocabulary, rng: &mut impl Rng) -> Self {
        let mut slots = parent.slots_padded();
        for word in slots.iter_mut() {
            if word.is_empty() { continue; }
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
        let last_used = vec![0u64; slots.len()];
        Vocabulary { slots, last_used }
    }

    pub fn absorb_from(&mut self, other: &Vocabulary, rng: &mut impl Rng) {
        let idx = concept_index();
        let mut candidates: Vec<usize> = Vec::new();
        for (&_concept, &i) in idx.iter() {
            let mine   = self.slots.get(i).map(|s| s.as_str()).unwrap_or("");
            let theirs = other.slots.get(i).map(|s| s.as_str()).unwrap_or("");
            if !mine.is_empty() && !theirs.is_empty() && mine != theirs {
                candidates.push(i);
            }
        }
        if candidates.is_empty() { return; }
        if rng.gen::<f32>() < 0.06 {
            let i = candidates[rng.gen_range(0..candidates.len())];
            if let Some(theirs) = other.slots.get(i) {
                self.ensure_capacity();
                self.slots[i] = theirs.clone();
            }
        }
    }

    pub fn converge_with(
        &mut self,
        snapshots: &[HashMap<String, String>],
        rng: &mut impl Rng,
        adopt_rate: f32,
    ) {
        self.ensure_capacity();
        for (i, &concept) in CONCEPTS.iter().enumerate() {
            if rng.gen::<f32>() >= adopt_rate { continue; }
            let mut counts: HashMap<&str, usize> = HashMap::new();
            for snap in snapshots {
                if let Some(w) = snap.get(concept) {
                    *counts.entry(w.as_str()).or_insert(0) += 1;
                }
            }
            if let Some((&majority, _)) = counts.iter().max_by_key(|(_, &c)| c) {
                let mine = self.slots.get(i).map(|s| s.as_str()).unwrap_or("");
                if mine != majority {
                    self.slots[i] = majority.to_string();
                }
            }
        }
    }

    pub fn touch(&mut self, idx: usize, tick: u64) {
        if idx >= self.slots.len() { return; }
        if self.last_used.len() < self.slots.len() {
            self.last_used.resize(self.slots.len(), 0);
        }
        if idx >= self.last_used.len() {
            self.last_used.resize(idx + 1, 0);
        }
        self.last_used[idx] = tick;
    }

    pub fn decay(&mut self, tick: u64, threshold_ticks: u64) {
        if self.last_used.len() < self.slots.len() {
            self.last_used.resize(self.slots.len(), 0);
        }
        for i in 0..self.slots.len() {
            if self.slots[i].is_empty() { continue; }
            let last = self.last_used[i];
            if tick.saturating_sub(last) > threshold_ticks {
                self.slots[i] = String::new();
            }
        }
    }

    pub fn word_for<'a>(&'a self, concept: &'a str) -> &'a str {
        let idx = concept_index();
        if let Some(&i) = idx.get(concept) {
            if let Some(w) = self.slots.get(i) {
                if !w.is_empty() { return w.as_str(); }
            }
        }
        concept
    }

    /// Compatibility view exposing the per-concept word map for
    /// callers (serialisation, snapshots) that still want a
    /// HashMap. Allocates — use sparingly; for hot reads prefer
    /// `word_for`.
    pub fn as_hashmap(&self) -> HashMap<String, String> {
        let mut out = HashMap::with_capacity(self.slots.len());
        for (i, w) in self.slots.iter().enumerate() {
            if !w.is_empty() {
                out.insert(CONCEPTS[i].to_string(), w.clone());
            }
        }
        out
    }

    /// Rebuild the vocabulary from a HashMap (e.g. when loading a
    /// save or absorbing a snapshot).
    pub fn from_hashmap(map: &HashMap<String, String>) -> Self {
        let mut slots = vec![String::new(); CONCEPTS.len()];
        let idx = concept_index();
        for (k, v) in map {
            if let Some(&i) = idx.get(k.as_str()) {
                slots[i] = v.clone();
            }
        }
        let last_used = vec![0u64; slots.len()];
        Vocabulary { slots, last_used }
    }

    /// Length accessor for callers that previously did `.words.len()`.
    pub fn len(&self) -> usize {
        self.slots.iter().filter(|s| !s.is_empty()).count()
    }

    pub fn is_empty(&self) -> bool { self.slots.iter().all(|s| s.is_empty()) }

    /// Pads the slot vector to `CONCEPTS.len()` so positional writes
    /// don't panic on freshly-constructed vocabularies.
    fn ensure_capacity(&mut self) {
        if self.slots.len() < CONCEPTS.len() {
            self.slots.resize(CONCEPTS.len(), String::new());
        }
        if self.last_used.len() < self.slots.len() {
            self.last_used.resize(self.slots.len(), 0);
        }
    }

    fn slots_padded(&self) -> Vec<String> {
        let mut out = self.slots.clone();
        if out.len() < CONCEPTS.len() {
            out.resize(CONCEPTS.len(), String::new());
        }
        out
    }
}

// Custom serde impls so the on-disk / on-wire format remains
// HashMap<String, String> — existing saves and the client wire
// decoder don't need to change.
impl Serialize for Vocabulary {
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        self.as_hashmap().serialize(ser)
    }
}

impl<'de> Deserialize<'de> for Vocabulary {
    fn deserialize<D: Deserializer<'de>>(deser: D) -> Result<Self, D::Error> {
        let map = HashMap::<String, String>::deserialize(deser)?;
        Ok(Vocabulary::from_hashmap(&map))
    }
}
