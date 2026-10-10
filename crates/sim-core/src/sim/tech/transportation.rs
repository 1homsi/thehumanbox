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
    /// The two water tiles a ferry is moored at, one on each shore of a strait (see `ferry.rs`).
    /// `None` for every other boat.
    #[serde(default)]
    pub ferry: Option<FerryLine>,
}

/// A ferry line: the water tile at each landing of a strait.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FerryLine {
    pub a: (i32, i32),
    pub b: (i32, i32),
}
