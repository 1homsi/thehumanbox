use serde::{Deserialize, Serialize};
use super::era::Era;

#[derive(Clone, Copy, Debug, Eq, Hash, Serialize, Deserialize, PartialEq, PartialOrd, Ord)]
pub enum ToolKind {
    StoneAxe,
    StoneSpear,
    BronzeAxe,
    BronzeSpear,
    IronSword,
    IronPlow,
    Bow,
    Crossbow,
    Musket,
    Rifle,
    Hammer,
    Saw,
    Plow,
    FishingRod,
    Book,
    Sextant,
    Telescope,
    Microscope,
    Camera,
    Radio,
    Computer,
    Phone,
}

impl ToolKind {
    pub fn name(self) -> &'static str {
        match self {
            ToolKind::StoneAxe   => "stone_axe",
            ToolKind::StoneSpear => "stone_spear",
            ToolKind::BronzeAxe  => "bronze_axe",
            ToolKind::BronzeSpear => "bronze_spear",
            ToolKind::IronSword  => "iron_sword",
            ToolKind::IronPlow   => "iron_plow",
            ToolKind::Bow        => "bow",
            ToolKind::Crossbow   => "crossbow",
            ToolKind::Musket     => "musket",
            ToolKind::Rifle      => "rifle",
            ToolKind::Hammer     => "hammer",
            ToolKind::Saw        => "saw",
            ToolKind::Plow       => "plow",
            ToolKind::FishingRod => "fishing_rod",
            ToolKind::Book       => "book",
            ToolKind::Sextant    => "sextant",
            ToolKind::Telescope  => "telescope",
            ToolKind::Microscope => "microscope",
            ToolKind::Camera     => "camera",
            ToolKind::Radio      => "radio",
            ToolKind::Computer   => "computer",
            ToolKind::Phone      => "phone",
        }
    }

    pub fn from_name(s: &str) -> Option<ToolKind> {
        for &k in Self::all() {
            if k.name() == s { return Some(k); }
        }
        None
    }

    pub fn era_unlock(self) -> Era {
        match self {
            ToolKind::StoneAxe | ToolKind::StoneSpear => Era::Stone,
            ToolKind::BronzeAxe | ToolKind::BronzeSpear | ToolKind::Hammer => Era::Bronze,
            ToolKind::IronSword | ToolKind::IronPlow | ToolKind::Bow | ToolKind::Saw | ToolKind::FishingRod => Era::Iron,
            ToolKind::Plow | ToolKind::Book => Era::Medieval,
            ToolKind::Crossbow | ToolKind::Musket | ToolKind::Sextant | ToolKind::Telescope => Era::Renaissance,
            ToolKind::Rifle | ToolKind::Camera | ToolKind::Microscope => Era::Industrial,
            ToolKind::Radio => Era::Modern,
            ToolKind::Computer | ToolKind::Phone => Era::Information,
        }
    }

    pub fn material_cost(self) -> &'static [(&'static str, u8)] {
        match self {
            ToolKind::StoneAxe   => &[("wood", 1), ("stone", 1)],
            ToolKind::StoneSpear => &[("wood", 1), ("stone", 1)],
            ToolKind::BronzeAxe  => &[("wood", 1), ("stone", 2)],
            ToolKind::BronzeSpear => &[("wood", 1), ("stone", 2)],
            ToolKind::IronSword  => &[("wood", 1), ("stone", 3)],
            ToolKind::IronPlow   => &[("wood", 2), ("stone", 3)],
            ToolKind::Bow        => &[("wood", 2)],
            ToolKind::Crossbow   => &[("wood", 2), ("stone", 1)],
            ToolKind::Musket     => &[("wood", 2), ("stone", 3)],
            ToolKind::Rifle      => &[("wood", 2), ("stone", 4)],
            ToolKind::Hammer     => &[("wood", 1), ("stone", 1)],
            ToolKind::Saw        => &[("wood", 1), ("stone", 2)],
            ToolKind::Plow       => &[("wood", 2), ("stone", 1)],
            ToolKind::FishingRod => &[("wood", 1)],
            ToolKind::Book       => &[("wood", 1)],
            ToolKind::Sextant    => &[("wood", 1), ("stone", 1)],
            ToolKind::Telescope  => &[("wood", 1), ("stone", 2)],
            ToolKind::Microscope => &[("wood", 1), ("stone", 2)],
            ToolKind::Camera     => &[("wood", 1), ("stone", 2)],
            ToolKind::Radio      => &[("wood", 1), ("stone", 3)],
            ToolKind::Computer   => &[("wood", 1), ("stone", 4)],
            ToolKind::Phone      => &[("wood", 1), ("stone", 3)],
        }
    }

    pub fn combat_bonus(self) -> f32 {
        match self {
            ToolKind::StoneSpear => 0.20,
            ToolKind::BronzeSpear => 0.35,
            ToolKind::IronSword => 0.50,
            ToolKind::Bow => 0.40,
            ToolKind::Crossbow => 0.80,
            ToolKind::Musket => 2.00,
            ToolKind::Rifle => 4.00,
            ToolKind::StoneAxe | ToolKind::BronzeAxe => 0.15,
            ToolKind::Hammer => 0.10,
            _ => 0.0,
        }
    }

    pub fn gather_bonus(self) -> f32 {
        match self {
            ToolKind::StoneAxe => 2.00,
            ToolKind::BronzeAxe => 2.50,
            ToolKind::Saw => 3.00,
            ToolKind::FishingRod => 1.50,
            ToolKind::Hammer => 0.40,
            _ => 0.0,
        }
    }

    pub fn hunt_bonus(self) -> f32 {
        match self {
            ToolKind::StoneSpear => 0.50,
            ToolKind::BronzeSpear => 0.90,
            ToolKind::Bow => 1.20,
            ToolKind::Crossbow => 1.80,
            ToolKind::Musket => 3.00,
            ToolKind::Rifle => 5.00,
            ToolKind::IronSword => 0.80,
            _ => 0.0,
        }
    }

    pub fn knowledge_bonus(self) -> f32 {
        match self {
            ToolKind::Book => 2.00,
            ToolKind::Sextant => 0.60,
            ToolKind::Telescope => 1.20,
            ToolKind::Microscope => 1.50,
            ToolKind::Camera => 0.80,
            ToolKind::Radio => 1.50,
            ToolKind::Phone => 3.00,
            ToolKind::Computer => 10.00,
            _ => 0.0,
        }
    }

    pub fn build_bonus(self) -> f32 {
        match self {
            ToolKind::Hammer => 1.50,
            ToolKind::Saw => 1.20,
            ToolKind::StoneAxe => 0.60,
            ToolKind::BronzeAxe => 1.00,
            ToolKind::IronPlow => 0.80,
            ToolKind::Plow => 1.00,
            _ => 0.0,
        }
    }

    pub fn all() -> &'static [ToolKind] {
        &[
            ToolKind::StoneAxe, ToolKind::StoneSpear,
            ToolKind::BronzeAxe, ToolKind::BronzeSpear,
            ToolKind::IronSword, ToolKind::IronPlow,
            ToolKind::Bow, ToolKind::Crossbow,
            ToolKind::Musket, ToolKind::Rifle,
            ToolKind::Hammer, ToolKind::Saw,
            ToolKind::Plow, ToolKind::FishingRod,
            ToolKind::Book, ToolKind::Sextant,
            ToolKind::Telescope, ToolKind::Microscope,
            ToolKind::Camera, ToolKind::Radio,
            ToolKind::Computer, ToolKind::Phone,
        ]
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToolRole { Combat, Gather, Hunt, Knowledge, Build }
