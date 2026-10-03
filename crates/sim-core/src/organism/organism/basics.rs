use super::*;

pub const N_ACTIONS: usize = 538;

pub const ACTION_ID_SPACE: usize = 6144;

pub type QRow = Vec<(u16, f32)>;

pub trait QRowExt {
    fn get_q(&self, action: u16) -> f32;
    fn set_q(&mut self, action: u16, value: f32);
    fn max_q(&self) -> f32;
    fn max_q_for_actions(&self, actions: &[usize]) -> f32;
}

impl QRowExt for QRow {
    fn get_q(&self, action: u16) -> f32 {
        self.iter()
            .find(|&&(a, _)| a == action)
            .map(|&(_, v)| v)
            .unwrap_or(0.0)
    }
    fn set_q(&mut self, action: u16, value: f32) {
        if let Some(slot) = self.iter_mut().find(|(a, _)| *a == action) {
            slot.1 = value;
        } else {
            self.push((action, value));
        }
    }
    fn max_q(&self) -> f32 {
        let m = self.iter().map(|&(_, v)| v).fold(f32::NEG_INFINITY, f32::max);
        if m.is_finite() {
            m
        } else {
            0.0
        }
    }
    fn max_q_for_actions(&self, actions: &[usize]) -> f32 {
        if actions.is_empty() {
            return 0.0;
        }
        if actions.iter().any(|&a| a >= ACTION_ID_SPACE) {
            let m = actions
                .iter()
                .map(|&a| self.get_q(a as u16))
                .fold(f32::NEG_INFINITY, f32::max);
            return if m.is_finite() { m } else { 0.0 };
        }
        let mut avail = [false; ACTION_ID_SPACE];
        for &a in actions {
            avail[a] = true;
        }
        let mut m = f32::NEG_INFINITY;
        let mut matched = 0usize;
        for &(a, v) in self.iter() {
            let ai = a as usize;
            if ai < ACTION_ID_SPACE && avail[ai] {
                matched += 1;
                if v > m {
                    m = v;
                }
            }
        }
        if matched < actions.len() {
            m = m.max(0.0);
        }
        if m.is_finite() {
            m
        } else {
            0.0
        }
    }
}

pub const DIRECTIONS: [(i32, i32); 8] = [
    (0, -1),
    (0, 1),
    (-1, 0),
    (1, 0),
    (-1, -1),
    (1, -1),
    (-1, 1),
    (1, 1),
];

const CONSONANTS: &[u8] = b"bdfghjklmnprstvwz";
const VOWELS: &[u8] = b"aeiou";

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, serde::Deserialize, Default)]
pub enum Sex {
    #[default]
    Male,
    Female,
}

impl Sex {
    pub fn random(rng: &mut impl Rng) -> Self {
        if rng.random::<bool>() {
            Sex::Male
        } else {
            Sex::Female
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Sex::Male => "male",
            Sex::Female => "female",
        }
    }
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        if s == "female" {
            Sex::Female
        } else {
            Sex::Male
        }
    }
}

pub fn generate_name(rng: &mut impl Rng, sex: Sex) -> String {
    let syllables = rng.random_range(2..=3);
    let mut s = String::new();
    for i in 0..syllables {
        s.push(CONSONANTS[rng.random_range(0..CONSONANTS.len())] as char);
        s.push(VOWELS[rng.random_range(0..VOWELS.len())] as char);
        if i == syllables - 1 && sex == Sex::Male && rng.random::<f32>() < 0.65 {
            s.push(CONSONANTS[rng.random_range(0..CONSONANTS.len())] as char);
        }
    }
    let mut c = s.chars();
    match c.next() {
        None => s,
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

pub fn generate_tribe_name(rng: &mut impl Rng) -> String {
    const TRIBE_CONS: &[u8] = b"bdfghjklmnprstvwz";
    const TRIBE_VOWELS: &[u8] = b"aeiou";
    let syllables = rng.random_range(2..=3usize);
    let mut s = String::new();
    for i in 0..syllables {
        s.push(TRIBE_CONS[rng.random_range(0..TRIBE_CONS.len())] as char);
        s.push(TRIBE_VOWELS[rng.random_range(0..TRIBE_VOWELS.len())] as char);
        if i < syllables - 1 && rng.random::<f32>() < 0.30 {
            s.push(TRIBE_CONS[rng.random_range(0..TRIBE_CONS.len())] as char);
        }
        if i == syllables - 1 && rng.random::<f32>() < 0.60 {
            s.push(TRIBE_CONS[rng.random_range(0..TRIBE_CONS.len())] as char);
        }
    }
    let mut c = s.chars();
    match c.next() {
        None => s,
        Some(f) => f.to_uppercase().to_string() + c.as_str(),
    }
}

pub fn apply_sex_traits(traits: &mut crate::organism::traits::Traits, sex: Sex) {
    match sex {
        Sex::Male => {
            traits.aggression = (traits.aggression + 0.06).clamp(0.05, 0.95);
            traits.curiosity = (traits.curiosity + 0.02).clamp(0.05, 0.95);
            traits.social_tendency = (traits.social_tendency - 0.04).clamp(0.05, 0.95);
        }
        Sex::Female => {
            traits.resilience = (traits.resilience + 0.05).clamp(0.05, 0.95);
            traits.social_tendency = (traits.social_tendency + 0.05).clamp(0.05, 0.95);
            traits.memory_strength = (traits.memory_strength + 0.04).clamp(0.05, 0.95);
        }
    }
}
