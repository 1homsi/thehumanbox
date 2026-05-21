use serde::{Deserialize, Serialize};
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TransportKind {
    Foot, Sled, Cart, Wagon, Boat, Ship, Carriage, Train,
    Bicycle, Automobile, Truck, Plane, Subway, Helicopter, Rocket,
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
            TransportKind::Automobile | TransportKind::Truck | TransportKind::Plane | TransportKind::Subway | TransportKind::Helicopter => Era::Modern,
            TransportKind::Rocket => Era::Information,
        }
    }
    pub fn max_speed(self) -> f32 {
        match self {
            TransportKind::Foot => 1.0,
            TransportKind::Sled => 1.4,
            TransportKind::Cart | TransportKind::Wagon => 1.7,
            TransportKind::Boat => 1.8,
            TransportKind::Ship => 2.4,
            TransportKind::Carriage => 2.6,
            TransportKind::Bicycle => 3.0,
            TransportKind::Train | TransportKind::Subway => 5.0,
            TransportKind::Automobile => 4.5,
            TransportKind::Truck => 4.0,
            TransportKind::Plane => 12.0,
            TransportKind::Helicopter => 10.0,
            TransportKind::Rocket => 30.0,
        }
    }
    pub fn cargo_capacity(self) -> u32 {
        match self {
            TransportKind::Foot => 8,
            TransportKind::Sled => 30,
            TransportKind::Cart => 50,
            TransportKind::Wagon => 120,
            TransportKind::Boat => 80,
            TransportKind::Ship => 1200,
            TransportKind::Carriage => 60,
            TransportKind::Train => 5000,
            TransportKind::Bicycle => 20,
            TransportKind::Automobile => 200,
            TransportKind::Truck => 1000,
            TransportKind::Plane => 800,
            TransportKind::Subway => 600,
            TransportKind::Helicopter => 300,
            TransportKind::Rocket => 5000,
        }
    }
    pub fn passenger_capacity(self) -> u8 {
        match self {
            TransportKind::Foot | TransportKind::Bicycle => 1,
            TransportKind::Sled | TransportKind::Cart | TransportKind::Boat => 2,
            TransportKind::Wagon | TransportKind::Carriage | TransportKind::Automobile => 4,
            TransportKind::Truck | TransportKind::Helicopter => 4,
            TransportKind::Train | TransportKind::Subway => 100,
            TransportKind::Ship => 60,
            TransportKind::Plane => 120,
            TransportKind::Rocket => 6,
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn faster_with_era() {
        assert!(TransportKind::Rocket.max_speed() > TransportKind::Foot.max_speed());
        assert!(TransportKind::Train.max_speed() > TransportKind::Cart.max_speed());
    }
}
