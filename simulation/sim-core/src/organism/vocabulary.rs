use rand::{Rng, RngExt};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::collections::HashMap;
use std::sync::OnceLock;

pub const CONCEPTS: &[&str] = &[
    "food",
    "water",
    "fire",
    "danger",
    "friend",
    "foe",
    "shelter",
    "hunt",
    "night",
    "day",
    "sick",
    "home",
    "group",
    "alone",
    "sun",
    "moon",
    "star",
    "sky",
    "rain",
    "storm",
    "wind",
    "snow",
    "ice",
    "cloud",
    "river",
    "lake",
    "sea",
    "mountain",
    "forest",
    "tree",
    "grass",
    "stone",
    "sand",
    "earth",
    "cave",
    "path",
    "world",
    "hunger",
    "thirst",
    "pain",
    "tired",
    "strong",
    "weak",
    "hurt",
    "heal",
    "rest",
    "sleep",
    "breath",
    "blood",
    "old",
    "young",
    "born",
    "death",
    "life",
    "fear",
    "joy",
    "anger",
    "sad",
    "love",
    "hate",
    "calm",
    "brave",
    "lonely",
    "hope",
    "trust",
    "grief",
    "pride",
    "shame",
    "curious",
    "kin",
    "child",
    "mother",
    "father",
    "elder",
    "mate",
    "stranger",
    "leader",
    "tribe",
    "ally",
    "gift",
    "share",
    "help",
    "teach",
    "learn",
    "story",
    "song",
    "dance",
    "play",
    "talk",
    "listen",
    "greet",
    "fight",
    "war",
    "peace",
    "trade",
    "go",
    "come",
    "stay",
    "run",
    "climb",
    "swim",
    "dig",
    "build",
    "break",
    "carry",
    "give",
    "find",
    "see",
    "hear",
    "hide",
    "watch",
    "follow",
    "lead",
    "gather",
    "plant",
    "make",
    "cold",
    "warm",
    "dark",
    "light",
    "big",
    "small",
    "near",
    "far",
    "many",
    "good",
    "bad",
    "new",
    "here",
    "there",
    "meat",
    "berry",
    "root",
    "wood",
    "tool",
    "trap",
    "spear",
    "basket",
    "medicine",
    "farm",
    "nest",
    "name",
    "time",
    "season",
    "eye",
    "ear",
    "hand",
    "foot",
    "mouth",
    "skin",
    "heart",
    "voice",
    "scent",
    "bone",
    "birth",
    "wedding",
    "funeral",
    "ancestor",
    "twin",
    "orphan",
    "widow",
    "sibling",
    "blood-kin",
    "lineage",
    "wolf",
    "bird",
    "deer",
    "bear",
    "snake",
    "insect",
    "beast",
    "prey",
    "predator",
    "flock",
    "pack",
    "swarm",
    "cliff",
    "ridge",
    "plain",
    "marsh",
    "swamp",
    "oasis",
    "dune",
    "glacier",
    "shore",
    "island",
    "crater",
    "gorge",
    "meadow",
    "grove",
    "thicket",
    "clearing",
    "valley",
    "hill",
    "spring",
    "dawn",
    "dusk",
    "twilight",
    "fog",
    "frost",
    "hail",
    "thunder",
    "lightning",
    "rainbow",
    "drought",
    "flood",
    "heat",
    "eclipse",
    "clay",
    "mud",
    "hide",
    "fur",
    "feather",
    "shell",
    "salt",
    "charcoal",
    "ore",
    "metal",
    "gem",
    "flint",
    "thread",
    "truth",
    "lie",
    "secret",
    "promise",
    "oath",
    "law",
    "custom",
    "tradition",
    "memory",
    "dream",
    "idea",
    "plan",
    "choice",
    "fate",
    "luck",
    "omen",
    "sign",
    "mystery",
    "wisdom",
    "honor",
    "duty",
    "freedom",
    "power",
    "change",
    "beginning",
    "ending",
    "journey",
    "return",
    "loss",
    "gain",
    "debt",
    "balance",
    "bless",
    "curse",
    "forgive",
    "betray",
    "protect",
    "abandon",
    "rescue",
    "sacrifice",
    "scatter",
    "destroy",
    "create",
    "mend",
    "sharpen",
    "carve",
    "weave",
    "guard",
    "chase",
    "flee",
    "attack",
    "defend",
    "one",
    "two",
    "three",
    "half",
    "whole",
    "none",
    "all",
    "more",
    "less",
    "enough",
    "empty",
    "full",
    "red",
    "blue",
    "green",
    "yellow",
    "white",
    "black",
    "brown",
    "grey",
    "flower",
    "leaf",
    "seed",
    "vine",
    "moss",
    "fern",
    "reed",
    "bark",
    "branch",
    "thorn",
    "fruit",
    "nut",
    "herb",
    "sprout",
    "blossom",
    "morning",
    "noon",
    "evening",
    "midnight",
    "year",
    "moment",
    "forever",
    "soon",
    "early",
    "late",
    "north",
    "south",
    "east",
    "west",
    "up",
    "down",
    "forward",
    "back",
    "between",
    "above",
    "below",
    "inside",
    "outside",
    "around",
    "cry",
    "shout",
    "whisper",
    "laugh",
    "roar",
    "howl",
    "call",
    "echo",
    "silence",
    "noise",
    "growl",
    "hum",
    "worry",
    "relief",
    "longing",
    "envy",
    "gratitude",
    "regret",
    "awe",
    "disgust",
    "surprise",
    "sorrow",
    "delight",
    "dread",
    "yearning",
    "serenity",
    "council",
    "clan",
    "family",
    "band",
    "gathering",
    "market",
    "border",
    "neighbor",
    "kinship",
    "guest",
    "jump",
    "crawl",
    "crouch",
    "reach",
    "grab",
    "throw",
    "push",
    "pull",
    "kick",
    "bite",
    "sniff",
    "blink",
    "nod",
    "point",
    "wave",
    "kneel",
    "question",
    "answer",
    "word",
    "language",
    "speech",
    "skill",
    "craft",
    "work",
    "effort",
    "ease",
    "meaning",
    "purpose",
    "reason",
    "cause",
    "heavy",
    "hard",
    "soft",
    "sharp",
    "dull",
    "smooth",
    "rough",
    "wet",
    "dry",
    "hot",
    "fast",
    "slow",
    "loud",
    "quiet",
    "bright",
    "deep",
    "shallow",
    "high",
    "low",
    "wide",
];

const CONSONANTS: &[u8] = b"bdfghjklmnprstvwz";
const VOWELS: &[u8] = b"aeiou";

/// Concept name → index in `CONCEPTS`, computed once. Used by all
/// lookup methods so we never re-scan the slice.
fn concept_index() -> &'static HashMap<&'static str, usize> {
    static IDX: OnceLock<HashMap<&'static str, usize>> = OnceLock::new();
    IDX.get_or_init(|| CONCEPTS.iter().enumerate().map(|(i, &c)| (c, i)).collect())
}

fn gen_syllable(rng: &mut impl Rng) -> String {
    let mut s = String::new();
    s.push(CONSONANTS[rng.random_range(0..CONSONANTS.len())] as char);
    s.push(VOWELS[rng.random_range(0..VOWELS.len())] as char);
    s
}

fn gen_word(rng: &mut impl Rng) -> String {
    let syllables = rng.random_range(1usize..=2);
    (0..syllables).map(|_| gen_syllable(rng)).collect()
}

pub fn gen_phoneme_word(rng: &mut impl Rng) -> String {
    gen_word(rng)
}

/// Per-organism vocabulary. Internally a positional `Vec<String>`
/// indexed by `CONCEPTS` position - no per-organism `HashMap`
/// allocations, no key Strings, and slot lookups are an O(1) hash
/// against a single shared concept-index map. With ~280 concepts ×
/// hundreds of organisms this trims ~3+ MB of HashMap bucket
/// overhead off resident memory at steady state.
///
/// Wire/save format is unchanged: a custom Serialize / Deserialize
/// impl converts to and from the previous `HashMap<String, String>`
/// shape, so persisted saves and client wire frames keep working
/// with no migration.
/// Reserved key used to carry `Vocabulary::last_used` through the
/// `HashMap<String, String>` wire format. Not a concept, so older
/// readers ignore it and `from_hashmap` skips it.
const LAST_USED_KEY: &str = "__thb_last_used";

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
        for _ in CONCEPTS {
            slots.push(gen_word(rng));
        }
        let last_used = vec![0u64; slots.len()];
        Vocabulary { slots, last_used }
    }

    pub fn inherit_from(parent: &Vocabulary, rng: &mut impl Rng) -> Self {
        let mut slots = parent.slots_padded();
        for word in slots.iter_mut() {
            if word.is_empty() {
                continue;
            }
            if rng.random::<f32>() < 0.03 {
                let bytes = word.as_bytes().to_vec();
                let pos = rng.random_range(0..bytes.len());
                let mut mutated = bytes;
                if pos % 2 == 0 {
                    mutated[pos] = CONSONANTS[rng.random_range(0..CONSONANTS.len())];
                } else {
                    mutated[pos] = VOWELS[rng.random_range(0..VOWELS.len())];
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
            let mine = self.slots.get(i).map(|s| s.as_str()).unwrap_or("");
            let theirs = other.slots.get(i).map(|s| s.as_str()).unwrap_or("");
            if !mine.is_empty() && !theirs.is_empty() && mine != theirs {
                candidates.push(i);
            }
        }
        if candidates.is_empty() {
            return;
        }
        if rng.random::<f32>() < 0.06 {
            let i = candidates[rng.random_range(0..candidates.len())];
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
        tick: u64,
    ) {
        self.ensure_capacity();
        for (i, &concept) in CONCEPTS.iter().enumerate() {
            if rng.random::<f32>() >= adopt_rate {
                continue;
            }
            let mut counts: HashMap<&str, usize> = HashMap::new();
            for snap in snapshots {
                if let Some(w) = snap.get(concept) {
                    *counts.entry(w.as_str()).or_insert(0) += 1;
                }
            }
            // `HashMap::iter().max_by_key` resolves ties in iteration order,
            // so which word "won" depended on per-process hash seeding.
            // Break ties on the word itself for a reproducible result.
            let majority = counts
                .iter()
                .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)))
                .map(|(&w, _)| w);
            if let Some(majority) = majority {
                let mine = self.slots.get(i).map(|s| s.as_str()).unwrap_or("");
                if mine != majority {
                    self.slots[i] = majority.to_string();
                    // An adopted word is one the organism now uses, so it
                    // must not be forgotten by the very next decay pass.
                    self.touch(i, tick);
                }
            }
        }
    }

    pub fn touch(&mut self, idx: usize, tick: u64) {
        if idx >= self.slots.len() {
            return;
        }
        if self.last_used.len() < self.slots.len() {
            self.last_used.resize(self.slots.len(), 0);
        }
        if idx >= self.last_used.len() {
            self.last_used.resize(idx + 1, 0);
        }
        self.last_used[idx] = tick;
    }

    pub fn touch_concept(&mut self, concept: &str, tick: u64) {
        if let Some(&i) = concept_index().get(concept) {
            self.touch(i, tick);
        }
    }

    pub fn touch_all_known(&mut self, tick: u64) {
        if self.last_used.len() < self.slots.len() {
            self.last_used.resize(self.slots.len(), 0);
        }
        for i in 0..self.slots.len() {
            if !self.slots[i].is_empty() {
                self.last_used[i] = tick;
            }
        }
    }

    pub fn decay(&mut self, tick: u64, threshold_ticks: u64) {
        if self.last_used.len() < self.slots.len() {
            self.last_used.resize(self.slots.len(), 0);
        }
        for i in 0..self.slots.len() {
            if self.slots[i].is_empty() {
                continue;
            }
            let last = self.last_used[i];
            if last == 0 {
                // Never explicitly used. Start the forgetting clock now
                // instead of reading 0 as "last used at tick 0", which
                // wiped every concept an organism had not personally
                // spoken about the moment the world passed `threshold_ticks`.
                self.last_used[i] = tick;
                continue;
            }
            if tick.saturating_sub(last) > threshold_ticks {
                self.slots[i] = String::new();
            }
        }
    }

    /// Borrowed word for a concept, or `None` when the organism has
    /// forgotten it. `word_for` cannot express this: it falls back to the
    /// English concept name, so two organisms who both forgot a word
    /// compared as recognising each other's signal.
    pub fn known_word<'a>(&'a self, concept: &str) -> Option<&'a str> {
        let idx = concept_index();
        let i = *idx.get(concept)?;
        let w = self.slots.get(i)?;
        if w.is_empty() {
            None
        } else {
            Some(w.as_str())
        }
    }

    pub fn word_for<'a>(&'a self, concept: &'a str) -> &'a str {
        let idx = concept_index();
        if let Some(&i) = idx.get(concept) {
            if let Some(w) = self.slots.get(i) {
                if !w.is_empty() {
                    return w.as_str();
                }
            }
        }
        concept
    }

    /// Compatibility view exposing the per-concept word map for
    /// callers (serialisation, snapshots) that still want a
    /// HashMap. Allocates - use sparingly; for hot reads prefer
    /// `word_for`.
    pub fn as_hashmap(&self) -> HashMap<String, String> {
        let mut out = HashMap::with_capacity(self.slots.len() + 1);
        for (i, w) in self.slots.iter().enumerate() {
            if !w.is_empty() {
                if let Some(concept) = CONCEPTS.get(i) {
                    out.insert(concept.to_string(), w.clone());
                }
            }
        }
        // Carry the forgetting clock through the HashMap wire format.
        // Without it every save/load reset `last_used` to 0, and `decay`
        // then treated each word as unused since tick 0.
        if self.last_used.iter().any(|&t| t != 0) {
            let packed = self
                .last_used
                .iter()
                .map(|t| t.to_string())
                .collect::<Vec<_>>()
                .join(",");
            out.insert(LAST_USED_KEY.to_string(), packed);
        }
        out
    }

    /// Rebuild the vocabulary from a HashMap (e.g. when loading a
    /// save or absorbing a snapshot).
    pub fn from_hashmap(map: &HashMap<String, String>) -> Self {
        let mut slots = vec![String::new(); CONCEPTS.len()];
        let idx = concept_index();
        for (k, v) in map {
            if k == LAST_USED_KEY {
                continue;
            }
            if let Some(&i) = idx.get(k.as_str()) {
                slots[i] = v.clone();
            }
        }
        let mut last_used = vec![0u64; slots.len()];
        if let Some(packed) = map.get(LAST_USED_KEY) {
            for (i, part) in packed.split(',').enumerate() {
                if i >= last_used.len() {
                    break;
                }
                if let Ok(t) = part.parse::<u64>() {
                    last_used[i] = t;
                }
            }
        }
        Vocabulary { slots, last_used }
    }

    /// Length accessor for callers that previously did `.words.len()`.
    pub fn len(&self) -> usize {
        self.slots.iter().filter(|s| !s.is_empty()).count()
    }

    pub fn is_empty(&self) -> bool {
        self.slots.iter().all(|s| s.is_empty())
    }

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
// HashMap<String, String> - existing saves and the client wire
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
