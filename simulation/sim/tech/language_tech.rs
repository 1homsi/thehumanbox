use serde::{Deserialize, Serialize};
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WritingSystem {
    None, Pictograph, Cuneiform, Alphabet, Script, Print, Typewriter, Digital,
}

impl WritingSystem {
    pub fn name(self) -> &'static str {
        match self {
            WritingSystem::None => "none",
            WritingSystem::Pictograph => "pictograph",
            WritingSystem::Cuneiform => "cuneiform",
            WritingSystem::Alphabet => "alphabet",
            WritingSystem::Script => "script",
            WritingSystem::Print => "print",
            WritingSystem::Typewriter => "typewriter",
            WritingSystem::Digital => "digital",
        }
    }
    pub fn for_era(era: Era) -> Self {
        match era {
            Era::PreStone | Era::Stone => WritingSystem::None,
            Era::Bronze => WritingSystem::Pictograph,
            Era::Iron => WritingSystem::Cuneiform,
            Era::Classical => WritingSystem::Alphabet,
            Era::Medieval => WritingSystem::Script,
            Era::Renaissance => WritingSystem::Print,
            Era::Industrial => WritingSystem::Typewriter,
            Era::Modern | Era::Information => WritingSystem::Digital,
            _ => WritingSystem::Digital,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum InformationMedium {
    Oral, Cave, Stone, Scroll, Codex, Book, Pamphlet, Newspaper, Radio, Television, Internet,
}

impl InformationMedium {
    pub fn era_unlock(self) -> Era {
        match self {
            InformationMedium::Oral | InformationMedium::Cave => Era::PreStone,
            InformationMedium::Stone => Era::Bronze,
            InformationMedium::Scroll => Era::Iron,
            InformationMedium::Codex => Era::Classical,
            InformationMedium::Book => Era::Medieval,
            InformationMedium::Pamphlet => Era::Renaissance,
            InformationMedium::Newspaper => Era::Industrial,
            InformationMedium::Radio | InformationMedium::Television => Era::Modern,
            InformationMedium::Internet => Era::Information,
        }
    }
    pub fn reach_multiplier(self) -> f32 {
        match self {
            InformationMedium::Oral => 1.0,
            InformationMedium::Cave | InformationMedium::Stone => 1.5,
            InformationMedium::Scroll => 4.0,
            InformationMedium::Codex => 8.0,
            InformationMedium::Book => 20.0,
            InformationMedium::Pamphlet => 50.0,
            InformationMedium::Newspaper => 200.0,
            InformationMedium::Radio => 800.0,
            InformationMedium::Television => 4000.0,
            InformationMedium::Internet => 50000.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BookTopic {
    History, Philosophy, Science, Medicine, Religion, Poetry, Law, Engineering,
    Geography, Mathematics, Astronomy, Fiction, Biography, Economics, Drama,
}

impl BookTopic {
    pub fn name(self) -> &'static str {
        match self {
            BookTopic::History => "history",
            BookTopic::Philosophy => "philosophy",
            BookTopic::Science => "science",
            BookTopic::Medicine => "medicine",
            BookTopic::Religion => "religion",
            BookTopic::Poetry => "poetry",
            BookTopic::Law => "law",
            BookTopic::Engineering => "engineering",
            BookTopic::Geography => "geography",
            BookTopic::Mathematics => "mathematics",
            BookTopic::Astronomy => "astronomy",
            BookTopic::Fiction => "fiction",
            BookTopic::Biography => "biography",
            BookTopic::Economics => "economics",
            BookTopic::Drama => "drama",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Book {
    pub id: u32,
    pub title: String,
    pub author_org_id: String,
    pub author_name: String,
    pub written_tick: u64,
    pub lineage_id: String,
    pub topic: BookTopic,
    pub copies: u32,
}

pub const BOOK_TITLE_PREFIX: &[&str] = &[
    "On", "The Book of", "Of", "Notes on", "Letters from", "Songs of",
    "Tales of", "A Treatise on", "Reflections upon",
];

pub const BOOK_TITLE_TOPIC: &[&str] = &[
    "the River", "the Sky", "the Hearth", "the Wandering", "the Coming",
    "the Long Road", "the Stone", "the Star", "the First Word", "the Old Year",
    "the Hunters", "the Builders", "the Sea", "the Mountain", "the Forest",
];

pub fn pick_book_title(seed: u64) -> String {
    let p = BOOK_TITLE_PREFIX[(seed as usize) % BOOK_TITLE_PREFIX.len()];
    let t = BOOK_TITLE_TOPIC[((seed / 7) as usize) % BOOK_TITLE_TOPIC.len()];
    format!("{} {}", p, t)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writing_evolves_with_era() {
        assert_eq!(WritingSystem::for_era(Era::Stone), WritingSystem::None);
        assert_eq!(WritingSystem::for_era(Era::Information), WritingSystem::Digital);
    }

    #[test]
    fn internet_reaches_far() {
        assert!(InformationMedium::Internet.reach_multiplier() > InformationMedium::Oral.reach_multiplier());
    }

    #[test]
    fn book_title_stable_for_seed() {
        assert_eq!(pick_book_title(42), pick_book_title(42));
    }
}
