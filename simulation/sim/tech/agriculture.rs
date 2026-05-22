use serde::{Deserialize, Serialize};
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgriEra {
    Foraging, Horticulture, Subsistence, Plough, CropRotation, Industrial, Genetic,
}

impl AgriEra {
    pub fn name(self) -> &'static str {
        match self {
            AgriEra::Foraging => "foraging",
            AgriEra::Horticulture => "horticulture",
            AgriEra::Subsistence => "subsistence",
            AgriEra::Plough => "plough",
            AgriEra::CropRotation => "crop_rotation",
            AgriEra::Industrial => "industrial",
            AgriEra::Genetic => "genetic",
        }
    }
    pub fn from_era(era: Era) -> AgriEra {
        match era {
            Era::PreStone | Era::Stone => AgriEra::Foraging,
            Era::Bronze => AgriEra::Horticulture,
            Era::Iron => AgriEra::Subsistence,
            Era::Classical => AgriEra::Plough,
            Era::Medieval | Era::Renaissance => AgriEra::CropRotation,
            Era::Industrial | Era::Modern => AgriEra::Industrial,
            Era::Information => AgriEra::Genetic,
        }
    }
    pub fn yield_multiplier(self) -> f32 {
        match self {
            AgriEra::Foraging => 1.0,
            AgriEra::Horticulture => 1.4,
            AgriEra::Subsistence => 1.8,
            AgriEra::Plough => 2.5,
            AgriEra::CropRotation => 3.5,
            AgriEra::Industrial => 7.0,
            AgriEra::Genetic => 12.0,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CropKind {
    Wheat, Rice, Maize, Barley, Potato, Beans, Cotton, Tobacco, Sugarcane, Coffee, Tea,
}

impl CropKind {
    pub fn name(self) -> &'static str {
        match self {
            CropKind::Wheat => "wheat",
            CropKind::Rice => "rice",
            CropKind::Maize => "maize",
            CropKind::Barley => "barley",
            CropKind::Potato => "potato",
            CropKind::Beans => "beans",
            CropKind::Cotton => "cotton",
            CropKind::Tobacco => "tobacco",
            CropKind::Sugarcane => "sugarcane",
            CropKind::Coffee => "coffee",
            CropKind::Tea => "tea",
        }
    }
    pub fn era_introduced(self) -> Era {
        match self {
            CropKind::Wheat | CropKind::Barley | CropKind::Rice => Era::Bronze,
            CropKind::Maize | CropKind::Beans => Era::Iron,
            CropKind::Potato => Era::Classical,
            CropKind::Cotton | CropKind::Tobacco | CropKind::Sugarcane => Era::Renaissance,
            CropKind::Coffee | CropKind::Tea => Era::Industrial,
        }
    }
    pub fn yield_per_tile(self) -> u32 {
        match self {
            CropKind::Wheat | CropKind::Rice | CropKind::Barley => 4,
            CropKind::Maize | CropKind::Beans | CropKind::Potato => 5,
            CropKind::Cotton | CropKind::Tobacco | CropKind::Sugarcane => 3,
            CropKind::Coffee | CropKind::Tea => 2,
        }
    }
    pub fn growth_ticks(self) -> u32 {
        match self {
            CropKind::Wheat | CropKind::Barley => 1200,
            CropKind::Rice => 1400,
            CropKind::Maize => 1300,
            CropKind::Potato | CropKind::Beans => 900,
            CropKind::Cotton => 1800,
            CropKind::Tobacco | CropKind::Sugarcane => 2000,
            CropKind::Coffee | CropKind::Tea => 3000,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Farm {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub owner_lineage: String,
    pub crop: CropKind,
    pub planted_tick: u64,
    pub ready_tick: u64,
    pub harvested: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn agri_era_grows_with_era() {
        assert_eq!(AgriEra::from_era(Era::Stone), AgriEra::Foraging);
        assert_eq!(AgriEra::from_era(Era::Information), AgriEra::Genetic);
    }

    #[test]
    fn industrial_yields_more() {
        assert!(AgriEra::Industrial.yield_multiplier() > AgriEra::Foraging.yield_multiplier());
    }
}
