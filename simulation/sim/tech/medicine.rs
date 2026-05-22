use serde::{Deserialize, Serialize};
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DiseaseKind {
    Cold, Flu, Fever, Plague, Cholera, Pox, Tuberculosis, Influenza, Malaria, Scurvy,
}

impl DiseaseKind {
    pub fn name(self) -> &'static str {
        match self {
            DiseaseKind::Cold => "cold",
            DiseaseKind::Flu => "flu",
            DiseaseKind::Fever => "fever",
            DiseaseKind::Plague => "plague",
            DiseaseKind::Cholera => "cholera",
            DiseaseKind::Pox => "pox",
            DiseaseKind::Tuberculosis => "tuberculosis",
            DiseaseKind::Influenza => "influenza",
            DiseaseKind::Malaria => "malaria",
            DiseaseKind::Scurvy => "scurvy",
        }
    }
    pub fn era_appearance(self) -> Era {
        match self {
            DiseaseKind::Cold | DiseaseKind::Fever | DiseaseKind::Scurvy => Era::PreStone,
            DiseaseKind::Flu | DiseaseKind::Pox => Era::Bronze,
            DiseaseKind::Plague => Era::Iron,
            DiseaseKind::Malaria => Era::Classical,
            DiseaseKind::Cholera => Era::Renaissance,
            DiseaseKind::Tuberculosis => Era::Industrial,
            DiseaseKind::Influenza => Era::Modern,
        }
    }
    pub fn contagion(self) -> f32 {
        match self {
            DiseaseKind::Cold => 0.08,
            DiseaseKind::Flu => 0.12,
            DiseaseKind::Fever => 0.06,
            DiseaseKind::Plague => 0.35,
            DiseaseKind::Cholera => 0.22,
            DiseaseKind::Pox => 0.25,
            DiseaseKind::Tuberculosis => 0.10,
            DiseaseKind::Influenza => 0.18,
            DiseaseKind::Malaria => 0.04,
            DiseaseKind::Scurvy => 0.0,
        }
    }
    pub fn lethality(self) -> f32 {
        match self {
            DiseaseKind::Cold => 0.001,
            DiseaseKind::Flu => 0.005,
            DiseaseKind::Fever => 0.010,
            DiseaseKind::Plague => 0.080,
            DiseaseKind::Cholera => 0.050,
            DiseaseKind::Pox => 0.060,
            DiseaseKind::Tuberculosis => 0.030,
            DiseaseKind::Influenza => 0.015,
            DiseaseKind::Malaria => 0.020,
            DiseaseKind::Scurvy => 0.025,
        }
    }
    pub fn duration_ticks(self) -> u32 {
        match self {
            DiseaseKind::Cold => 800,
            DiseaseKind::Flu => 1400,
            DiseaseKind::Fever => 1000,
            DiseaseKind::Plague => 2400,
            DiseaseKind::Cholera => 1800,
            DiseaseKind::Pox => 2200,
            DiseaseKind::Tuberculosis => 4000,
            DiseaseKind::Influenza => 1600,
            DiseaseKind::Malaria => 3000,
            DiseaseKind::Scurvy => 2400,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TreatmentKind {
    Herbal, Bloodletting, Quinine, Antibiotics, Vaccine, Surgery, GeneTherapy,
}

impl TreatmentKind {
    pub fn era_unlock(self) -> Era {
        match self {
            TreatmentKind::Herbal => Era::PreStone,
            TreatmentKind::Bloodletting => Era::Classical,
            TreatmentKind::Quinine => Era::Renaissance,
            TreatmentKind::Antibiotics | TreatmentKind::Vaccine | TreatmentKind::Surgery => Era::Industrial,
            TreatmentKind::GeneTherapy => Era::Information,
        }
    }
    pub fn effectiveness(self, against: DiseaseKind) -> f32 {
        match (self, against) {
            (TreatmentKind::Herbal, DiseaseKind::Cold | DiseaseKind::Fever) => 0.30,
            (TreatmentKind::Quinine, DiseaseKind::Malaria | DiseaseKind::Fever) => 0.70,
            (TreatmentKind::Antibiotics, DiseaseKind::Plague | DiseaseKind::Cholera | DiseaseKind::Tuberculosis | DiseaseKind::Pox) => 0.85,
            (TreatmentKind::Vaccine, _) => 0.95,
            (TreatmentKind::Surgery, DiseaseKind::Plague) => 0.20,
            (TreatmentKind::GeneTherapy, _) => 0.98,
            (TreatmentKind::Bloodletting, _) => -0.15,
            _ => 0.10,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ActiveDisease {
    pub kind: DiseaseKind,
    pub started_tick: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Outbreak {
    pub kind: DiseaseKind,
    pub epicenter: [i32; 2],
    pub started_tick: u64,
    pub affected_count: u32,
    pub deaths: u32,
}

pub fn pick_introduction(era: Era, seed: u64) -> Option<DiseaseKind> {
    let candidates: Vec<DiseaseKind> = [
        DiseaseKind::Cold, DiseaseKind::Flu, DiseaseKind::Fever, DiseaseKind::Plague,
        DiseaseKind::Cholera, DiseaseKind::Pox, DiseaseKind::Tuberculosis,
        DiseaseKind::Influenza, DiseaseKind::Malaria, DiseaseKind::Scurvy,
    ].into_iter().filter(|d| d.era_appearance() <= era).collect();
    if candidates.is_empty() { return None; }
    Some(candidates[(seed as usize) % candidates.len()])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plague_more_lethal_than_cold() {
        assert!(DiseaseKind::Plague.lethality() > DiseaseKind::Cold.lethality());
    }

    #[test]
    fn introduction_respects_era() {
        let d = pick_introduction(Era::Stone, 0).unwrap();
        assert!(d.era_appearance() <= Era::Stone);
    }
}
