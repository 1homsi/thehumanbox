use crate::sim::era::Era;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TransportKind {
    Foot,
    Sled,
    Cart,
    Wagon,
    Boat,
    Ship,
    Carriage,
    Train,
    Bicycle,
    Automobile,
    Truck,
    Plane,
    Subway,
    Helicopter,
    Rocket,
}

impl TransportKind {
    pub fn name(self) -> &'static str {
        match self {
            TransportKind::Foot => "foot",
            TransportKind::Sled => "sled",
            TransportKind::Cart => "cart",
            TransportKind::Wagon => "wagon",
            TransportKind::Boat => "boat",
            TransportKind::Ship => "ship",
            TransportKind::Carriage => "carriage",
            TransportKind::Train => "train",
            TransportKind::Bicycle => "bicycle",
            TransportKind::Automobile => "automobile",
            TransportKind::Truck => "truck",
            TransportKind::Plane => "plane",
            TransportKind::Subway => "subway",
            TransportKind::Helicopter => "helicopter",
            TransportKind::Rocket => "rocket",
        }
    }
    pub fn era_unlock(self) -> Era {
        match self {
            TransportKind::Foot | TransportKind::Sled => Era::PreStone,
            TransportKind::Cart | TransportKind::Boat => Era::Bronze,
            TransportKind::Wagon | TransportKind::Ship => Era::Iron,
            TransportKind::Carriage => Era::Classical,
            TransportKind::Train | TransportKind::Bicycle => Era::Industrial,
            TransportKind::Automobile
            | TransportKind::Truck
            | TransportKind::Plane
            | TransportKind::Subway
            | TransportKind::Helicopter => Era::Modern,
            TransportKind::Rocket => Era::Information,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Vehicle {
    pub id: u32,
    pub kind: TransportKind,
    pub owner_lineage: String,
    pub x: i32,
    pub y: i32,
    pub occupants: Vec<String>,
    pub cargo: u32,
    #[serde(default)]
    pub route: Vec<(i32, i32)>,
    #[serde(default)]
    pub ready_tick: u64,
    /// The mooring of a fishing boat (see `fleet.rs`); `None` for a boat built for a crossing.
    #[serde(default)]
    pub harbour: Option<(i32, i32)>,
    /// The harbour a trade boat is sailing to with its cargo (see `fleet.rs`).
    #[serde(default)]
    pub bound_for: Option<(i32, i32)>,
}
