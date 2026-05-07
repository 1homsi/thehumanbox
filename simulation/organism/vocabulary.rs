use std::collections::HashMap;
use rand::Rng;
use serde::{Serialize, Deserialize};

pub const CONCEPTS: &[&str] = &[
    "food", "water", "fire", "danger", "friend",
    "foe", "shelter", "hunt", "night", "day",
    "sick", "home", "group", "alone",
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

#[derive(Clone, Serialize, Deserialize)]
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

    // Absorb up to 1 word from another's vocabulary via social contact
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

    // Converge toward the majority word for each concept given a list of kin snapshots.
    // adopt_rate: probability per concept to check and possibly adopt.
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
