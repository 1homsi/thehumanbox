use crate::sim::era::Era;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ReligionKind {
    Animism,
    Polytheism,
    Monotheism,
    Philosophical,
    Secular,
}

impl ReligionKind {
    pub fn name(self) -> &'static str {
        match self {
            ReligionKind::Animism => "animism",
            ReligionKind::Polytheism => "polytheism",
            ReligionKind::Monotheism => "monotheism",
            ReligionKind::Philosophical => "philosophical",
            ReligionKind::Secular => "secular",
        }
    }
    pub fn era_unlock(self) -> Era {
        match self {
            ReligionKind::Animism => Era::PreStone,
            ReligionKind::Polytheism => Era::Bronze,
            ReligionKind::Monotheism => Era::Iron,
            ReligionKind::Philosophical => Era::Classical,
            ReligionKind::Secular => Era::Industrial,
        }
    }
    pub fn comfort_boost(self) -> f32 {
        match self {
            ReligionKind::Animism => 0.0008,
            ReligionKind::Polytheism => 0.0010,
            ReligionKind::Monotheism => 0.0012,
            ReligionKind::Philosophical => 0.0006,
            ReligionKind::Secular => 0.0002,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Religion {
    pub id: String,
    pub kind: ReligionKind,
    pub name: String,
    pub founded_tick: u64,
    pub founder_lineage: String,
    pub adherents: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_milestone: Option<u32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ArtKind {
    CavePainting,
    Sculpture,
    Fresco,
    Painting,
    Photograph,
    Film,
    Digital,
}

impl ArtKind {
    pub fn name(self) -> &'static str {
        match self {
            ArtKind::CavePainting => "cave_painting",
            ArtKind::Sculpture => "sculpture",
            ArtKind::Fresco => "fresco",
            ArtKind::Painting => "painting",
            ArtKind::Photograph => "photograph",
            ArtKind::Film => "film",
            ArtKind::Digital => "digital",
        }
    }
    pub fn era_unlock(self) -> Era {
        match self {
            ArtKind::CavePainting => Era::Stone,
            ArtKind::Sculpture => Era::Bronze,
            ArtKind::Fresco => Era::Classical,
            ArtKind::Painting => Era::Renaissance,
            ArtKind::Photograph => Era::Industrial,
            ArtKind::Film | ArtKind::Digital => Era::Modern,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Artwork {
    pub id: u32,
    pub kind: ArtKind,
    pub creator_id: String,
    pub creator_name: String,
    pub location: [i32; 2],
    pub tick: u64,
    pub title: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MusicKind {
    Drumming,
    Chanting,
    Folk,
    Classical,
    Jazz,
    Pop,
    Electronic,
}

impl MusicKind {
    pub fn era_unlock(self) -> Era {
        match self {
            MusicKind::Drumming => Era::Stone,
            MusicKind::Chanting => Era::Bronze,
            MusicKind::Folk => Era::Iron,
            MusicKind::Classical => Era::Renaissance,
            MusicKind::Jazz => Era::Industrial,
            MusicKind::Pop => Era::Modern,
            MusicKind::Electronic => Era::Information,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            MusicKind::Drumming => "drumming",
            MusicKind::Chanting => "chanting",
            MusicKind::Folk => "folk",
            MusicKind::Classical => "classical",
            MusicKind::Jazz => "jazz",
            MusicKind::Pop => "pop",
            MusicKind::Electronic => "electronic",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum FestivalKind {
    Harvest,
    Solstice,
    Spring,
    Religious,
    Wedding,
    Funeral,
    Coronation,
    Independence,
    NewYear,
    Carnival,
}

impl FestivalKind {
    pub fn name(self) -> &'static str {
        match self {
            FestivalKind::Harvest => "harvest",
            FestivalKind::Solstice => "solstice",
            FestivalKind::Spring => "spring",
            FestivalKind::Religious => "religious",
            FestivalKind::Wedding => "wedding",
            FestivalKind::Funeral => "funeral",
            FestivalKind::Coronation => "coronation",
            FestivalKind::Independence => "independence",
            FestivalKind::NewYear => "new_year",
            FestivalKind::Carnival => "carnival",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Festival {
    pub id: u32,
    pub lineage_id: String,
    pub name: String,
    pub kind: FestivalKind,
    pub start_tick: u64,
    pub duration_ticks: u32,
    pub center: [i32; 2],
}

pub const RELIGION_NAMES: &[&str] = &[
    "Sun Path",
    "Sky Mother",
    "Hearth Faith",
    "Stone Pact",
    "River Way",
    "Forest Whisper",
    "Eternal Flame",
    "Old Song",
    "First Word",
    "Long Road",
    "Bright Star",
    "Deep Water",
    "Iron Truth",
    "Wind Order",
    "Bone Wisdom",
    "Moon Vow",
];

pub fn pick_religion_name(seed: u64) -> &'static str {
    RELIGION_NAMES[(seed as usize) % RELIGION_NAMES.len()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn art_progression() {
        assert!(ArtKind::CavePainting.era_unlock() < ArtKind::Digital.era_unlock());
    }

    #[test]
    fn religion_name_is_stable() {
        assert_eq!(
            pick_religion_name(0),
            pick_religion_name(RELIGION_NAMES.len() as u64)
        );
    }
}
