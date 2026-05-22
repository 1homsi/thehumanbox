use serde::{Deserialize, Serialize};
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Invention {
    Wheel, Sail, Compass, PrintingPress, SteamEngine, Telegraph, Lightbulb,
    Telephone, Camera, Radio, Television, Computer, Internet, Satellite,
    Smartphone, Antibiotic, Vaccine, NuclearPower, Penicillin, Plastic,
    Refrigerator, Automobile, Airplane, GPS, AIModel, Drone, SolarCell,
    GeneEditing, ElectricCar, VR,
}

impl Invention {
    pub fn name(self) -> &'static str {
        match self {
            Invention::Wheel => "wheel",
            Invention::Sail => "sail",
            Invention::Compass => "compass",
            Invention::PrintingPress => "printing_press",
            Invention::SteamEngine => "steam_engine",
            Invention::Telegraph => "telegraph",
            Invention::Lightbulb => "lightbulb",
            Invention::Telephone => "telephone",
            Invention::Camera => "camera",
            Invention::Radio => "radio",
            Invention::Television => "television",
            Invention::Computer => "computer",
            Invention::Internet => "internet",
            Invention::Satellite => "satellite",
            Invention::Smartphone => "smartphone",
            Invention::Antibiotic => "antibiotic",
            Invention::Vaccine => "vaccine",
            Invention::NuclearPower => "nuclear_power",
            Invention::Penicillin => "penicillin",
            Invention::Plastic => "plastic",
            Invention::Refrigerator => "refrigerator",
            Invention::Automobile => "automobile",
            Invention::Airplane => "airplane",
            Invention::GPS => "gps",
            Invention::AIModel => "ai_model",
            Invention::Drone => "drone",
            Invention::SolarCell => "solar_cell",
            Invention::GeneEditing => "gene_editing",
            Invention::ElectricCar => "electric_car",
            Invention::VR => "virtual_reality",
        }
    }
    pub fn era(self) -> Era {
        match self {
            Invention::Wheel | Invention::Sail => Era::Bronze,
            Invention::Compass => Era::Medieval,
            Invention::PrintingPress => Era::Renaissance,
            Invention::SteamEngine | Invention::Telegraph | Invention::Lightbulb | Invention::Telephone | Invention::Camera => Era::Industrial,
            Invention::Radio | Invention::Television | Invention::Antibiotic | Invention::Vaccine | Invention::Penicillin | Invention::Plastic | Invention::Refrigerator | Invention::Automobile | Invention::Airplane | Invention::NuclearPower => Era::Modern,
            Invention::Computer | Invention::Internet | Invention::Satellite | Invention::Smartphone | Invention::GPS | Invention::AIModel | Invention::Drone | Invention::SolarCell | Invention::GeneEditing | Invention::ElectricCar | Invention::VR => Era::Information,
        }
    }
    pub fn knowledge_mult(self) -> f32 {
        match self {
            Invention::PrintingPress => 4.0,
            Invention::Internet => 50.0,
            Invention::AIModel => 100.0,
            _ => 1.0,
        }
    }
    pub fn all() -> &'static [Invention] {
        use Invention::*;
        &[Wheel, Sail, Compass, PrintingPress, SteamEngine, Telegraph, Lightbulb,
          Telephone, Camera, Radio, Television, Computer, Internet, Satellite,
          Smartphone, Antibiotic, Vaccine, NuclearPower, Penicillin, Plastic,
          Refrigerator, Automobile, Airplane, GPS, AIModel, Drone, SolarCell,
          GeneEditing, ElectricCar, VR]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ai_in_information_era() {
        assert_eq!(Invention::AIModel.era(), Era::Information);
    }

    #[test]
    fn printing_press_boosts_knowledge() {
        assert!(Invention::PrintingPress.knowledge_mult() > 1.0);
    }
}
