use rand::{Rng, RngExt};
use rustc_hash::FxHashMap as HashMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
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
    // Was listed twice: also appeared in the action-verb group further up.
    // `concept_index` resolves a name to one slot, so the earlier copy was
    // unreachable by name - it could never be spoken, touched, or forgotten,
    // and the HashMap wire format silently overwrote it on every save. This
    // is the copy lookups resolved to, so it is the one kept.
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

/// Reserved key used to carry `Vocabulary::last_used` through the
/// `HashMap<String, String>` wire format. Not a concept, so older
/// readers ignore it and `from_hashmap` skips it.
///
/// Only ever emitted by `as_hashmap`, which exists for the
/// serialise/deserialise round trip. Anything that treats the map as
/// *words* - snapshots, the client, the org-detail API - must use
/// `words` instead, or this clock blob gets rendered as if it were a
/// word the organism speaks.
const LAST_USED_KEY: &str = "__thb_last_used";

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
            let mut counts: HashMap<&str, usize> = HashMap::default();
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

    /// The words this organism currently knows, keyed by concept.
    ///
    /// This is the view for anything that *reads* the vocabulary as
    /// language: snapshots sent to the client and the
    /// org-detail API.
    /// It deliberately omits `LAST_USED_KEY`.
    ///
    /// Allocates - use sparingly; for hot reads prefer `word_for`.
    pub fn words(&self) -> HashMap<String, String> {
        let mut out = HashMap::with_capacity_and_hasher(self.slots.len(), Default::default());
        for (i, w) in self.slots.iter().enumerate() {
            if !w.is_empty() {
                if let Some(concept) = CONCEPTS.get(i) {
                    out.insert(concept.to_string(), w.clone());
                }
            }
        }
        out
    }

    /// [`Vocabulary::words`] as a JSON object, built directly in key order.
    /// Converting the `HashMap` through `serde_json::to_value` inserted ~120
    /// keys one at a time into a `BTreeMap` (a string comparison walk per
    /// key); here the concepts are visited in their precomputed sorted order
    /// so the map is bulk-built from sorted input.
    pub fn words_value(&self) -> serde_json::Value {
        static SORTED: OnceLock<Vec<usize>> = OnceLock::new();
        let order = SORTED.get_or_init(|| {
            let mut order: Vec<usize> = (0..CONCEPTS.len()).collect();
            order.sort_by_key(|&i| CONCEPTS[i]);
            order
        });
        serde_json::Value::Object(
            order
                .iter()
                .filter_map(|&i| {
                    let word = self.slots.get(i).filter(|w| !w.is_empty())?;
                    Some((CONCEPTS[i].to_string(), serde_json::Value::String(word.clone())))
                })
                .collect(),
        )
    }

    /// The word map *plus* the reserved `LAST_USED_KEY` clock blob.
    ///
    /// Only for the `Serialize`/`from_hashmap` round trip, which needs
    /// `last_used` to survive a save/load - without it every load reset
    /// the forgetting clock to 0 and `decay` treated each word as unused
    /// since tick 0. Never pass this to a consumer that treats the map
    /// as words; use [`Vocabulary::words`] there.
    pub fn as_hashmap(&self) -> HashMap<String, String> {
        let mut out = self.words();
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
    /// The same map `as_hashmap` builds, but borrowing the concept names and
    /// words instead of cloning ~120 strings per organism per save. The
    /// hasher, capacity and insertion order are identical (`&str` hashes like
    /// `String`), so the entries come out in the same order and the bytes do
    /// not change.
    fn serialize<S: Serializer>(&self, ser: S) -> Result<S::Ok, S::Error> {
        use std::fmt::Write as _;
        let mut out: HashMap<&str, &str> =
            HashMap::with_capacity_and_hasher(self.slots.len(), Default::default());
        for (i, w) in self.slots.iter().enumerate() {
            if !w.is_empty() {
                if let Some(concept) = CONCEPTS.get(i) {
                    out.insert(concept, w.as_str());
                }
            }
        }
        let mut packed = String::new();
        if self.last_used.iter().any(|&t| t != 0) {
            for (i, t) in self.last_used.iter().enumerate() {
                if i > 0 {
                    packed.push(',');
                }
                let _ = write!(packed, "{t}");
            }
            out.insert(LAST_USED_KEY, packed.as_str());
        }
        out.serialize(ser)
    }
}

impl<'de> Deserialize<'de> for Vocabulary {
    fn deserialize<D: Deserializer<'de>>(deser: D) -> Result<Self, D::Error> {
        let map = HashMap::<String, String>::deserialize(deser)?;
        Ok(Vocabulary::from_hashmap(&map))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    fn vocab() -> Vocabulary {
        let mut rng = StdRng::seed_from_u64(7);
        Vocabulary::generate(&mut rng)
    }

    /// The regression this guards: `words()` feeds snapshots, the client
    /// and the org-detail API. When it carried
    /// the reserved clock blob, `__thb_last_used` was rendered as if it
    /// were one of the organism's words - a ~400-number string.
    #[test]
    fn words_never_exposes_the_reserved_clock_key() {
        let mut v = vocab();
        v.touch_concept("food", 500);
        v.touch_concept("danger", 900);
        let words = v.words();
        assert!(
            !words.contains_key(LAST_USED_KEY),
            "words() leaked the reserved clock key"
        );
        // Sanity: the clock really is set, so this is not a vacuous pass.
        assert!(v.as_hashmap().contains_key(LAST_USED_KEY));
        assert!(!words.is_empty());
    }

    /// A duplicate concept name is silently destructive: `concept_index`
    /// resolves the name to one slot, so the other slot is unreachable by
    /// name (never spoken, never touched, therefore never forgotten) and
    /// both collide on the same key in the HashMap wire format, so one word
    /// is overwritten on every save. Guard the invariant directly.
    #[test]
    fn concepts_are_unique() {
        let mut seen = rustc_hash::FxHashSet::default();
        let dupes: Vec<&str> = CONCEPTS.iter().filter(|c| !seen.insert(**c)).copied().collect();
        assert!(dupes.is_empty(), "duplicate concepts in CONCEPTS: {dupes:?}");
        // `concept_index` is the reverse map; a duplicate breaks its 1:1
        // relationship with CONCEPTS, so its length must equal the list.
        assert_eq!(concept_index().len(), CONCEPTS.len());
    }

    /// `words_value` builds the JSON object directly in sorted order; it must
    /// equal converting `words()` through serde for every mix of known and
    /// forgotten words.
    #[test]
    fn words_value_matches_the_converted_hash_map() {
        for seed in 0..30u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let mut v = Vocabulary::generate(&mut rng);
            assert_eq!(
                serde_json::to_vec(&v.words_value()).unwrap(),
                serde_json::to_vec(&serde_json::to_value(v.words()).unwrap()).unwrap()
            );
            for (n, concept) in CONCEPTS.iter().enumerate() {
                if n % (seed as usize % 5 + 2) == 0 {
                    v.touch_concept(concept, 500 + n as u64);
                }
            }
            v.decay(2_000_000, 100_000 + seed * 60_000);
            assert_eq!(v.words_value(), serde_json::to_value(v.words()).unwrap());
            assert_eq!(
                serde_json::to_vec(&v.words_value()).unwrap(),
                serde_json::to_vec(&serde_json::to_value(v.words()).unwrap()).unwrap()
            );
        }
        assert_eq!(Vocabulary::default().words_value(), serde_json::json!({}));
    }

    #[test]
    fn words_holds_only_real_concepts() {
        let v = vocab();
        let words = v.words();
        for k in words.keys() {
            assert!(
                CONCEPTS.contains(&k.as_str()),
                "words() returned a non-concept key {k:?}"
            );
        }
        assert_eq!(words.len(), v.len());
    }

    /// The behaviour the reserved key exists to protect: the forgetting
    /// clock must survive a save/load, or `decay` reads 0 as "unused
    /// since tick 0" and wipes a freshly-loaded vocabulary.
    #[test]
    fn the_clock_survives_a_serde_round_trip() {
        let mut v = vocab();
        v.touch_concept("food", 5_000);
        let json = serde_json::to_string(&v).unwrap();
        let back: Vocabulary = serde_json::from_str(&json).unwrap();
        assert_eq!(back.known_word("food"), v.known_word("food"));
        assert_eq!(back.len(), v.len());

        // A word touched at tick 5000 must survive a decay pass at 5100
        // (100 ticks later, under a 200-tick threshold).
        let mut back = back;
        back.decay(5_100, 200);
        assert_eq!(
            back.known_word("food"),
            v.known_word("food"),
            "decay forgot a freshly-used word right after a reload"
        );
    }

    /// `Serialize` borrows instead of building `as_hashmap`'s owned map; the
    /// bytes (including the order the hash map iterates in) must be the same
    /// for vocabularies with every mix of forgotten words and clock values.
    #[test]
    fn serialize_matches_the_owned_hashmap_byte_for_byte() {
        let mut checked = 0;
        for seed in 0..40u64 {
            let mut rng = StdRng::seed_from_u64(seed);
            let mut v = Vocabulary::generate(&mut rng);
            let reference = |v: &Vocabulary| serde_json::to_string(&v.as_hashmap()).unwrap();
            assert_eq!(
                serde_json::to_string(&v).unwrap(),
                reference(&v),
                "fresh, seed {seed}"
            );

            for (n, concept) in CONCEPTS.iter().enumerate() {
                if n % (seed as usize % 7 + 2) == 0 {
                    v.touch_concept(concept, 1_000 + n as u64 * (seed + 1));
                }
            }
            assert_eq!(
                serde_json::to_string(&v).unwrap(),
                reference(&v),
                "touched, seed {seed}"
            );

            // Forget a seed-dependent share of the words.
            v.decay(1_000_000 + seed, 50_000 + seed * 9_000);
            assert_eq!(
                serde_json::to_string(&v).unwrap(),
                reference(&v),
                "decayed, seed {seed}"
            );
            checked += usize::from(v.len() < CONCEPTS.len());
        }
        assert!(checked > 0, "some vocabularies must have forgotten words");
        let empty = Vocabulary::default();
        assert_eq!(serde_json::to_string(&empty).unwrap(), "{}");
    }

    #[test]
    fn from_hashmap_ignores_the_reserved_key_as_a_concept() {
        let mut map = HashMap::default();
        map.insert("food".to_string(), "kra".to_string());
        map.insert(LAST_USED_KEY.to_string(), "7,7,7".to_string());
        let v = Vocabulary::from_hashmap(&map);
        assert_eq!(v.known_word("food"), Some("kra"));
        // The clock entry must not have been mistaken for a word.
        assert!(!v.words().contains_key(LAST_USED_KEY));
    }
}
