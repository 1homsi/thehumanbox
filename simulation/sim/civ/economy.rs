use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Specialty {
    Farmer, Smith, Hunter, Healer, Scholar, Merchant, Soldier, Builder, Priest, Artist,
    Engineer, Sailor, Miner, Weaver, Baker, Brewer, Carpenter, Mason, Scribe, Banker,
    Doctor, Teacher, Lawyer, Officer, Pilot, Programmer, Journalist, Actor, Athlete, Politician,
}

impl Specialty {
    pub fn name(self) -> &'static str {
        match self {
            Specialty::Farmer => "farmer",
            Specialty::Smith => "smith",
            Specialty::Hunter => "hunter",
            Specialty::Healer => "healer",
            Specialty::Scholar => "scholar",
            Specialty::Merchant => "merchant",
            Specialty::Soldier => "soldier",
            Specialty::Builder => "builder",
            Specialty::Priest => "priest",
            Specialty::Artist => "artist",
            Specialty::Engineer => "engineer",
            Specialty::Sailor => "sailor",
            Specialty::Miner => "miner",
            Specialty::Weaver => "weaver",
            Specialty::Baker => "baker",
            Specialty::Brewer => "brewer",
            Specialty::Carpenter => "carpenter",
            Specialty::Mason => "mason",
            Specialty::Scribe => "scribe",
            Specialty::Banker => "banker",
            Specialty::Doctor => "doctor",
            Specialty::Teacher => "teacher",
            Specialty::Lawyer => "lawyer",
            Specialty::Officer => "officer",
            Specialty::Pilot => "pilot",
            Specialty::Programmer => "programmer",
            Specialty::Journalist => "journalist",
            Specialty::Actor => "actor",
            Specialty::Athlete => "athlete",
            Specialty::Politician => "politician",
        }
    }

    pub fn era_unlock(self) -> Era {
        match self {
            Specialty::Farmer | Specialty::Hunter | Specialty::Healer | Specialty::Builder | Specialty::Priest | Specialty::Artist => Era::Stone,
            Specialty::Smith | Specialty::Merchant | Specialty::Soldier | Specialty::Sailor | Specialty::Miner | Specialty::Weaver | Specialty::Baker | Specialty::Brewer | Specialty::Carpenter | Specialty::Mason => Era::Bronze,
            Specialty::Scholar | Specialty::Scribe | Specialty::Engineer => Era::Iron,
            Specialty::Banker | Specialty::Doctor | Specialty::Teacher | Specialty::Lawyer | Specialty::Officer => Era::Renaissance,
            Specialty::Pilot | Specialty::Journalist | Specialty::Actor | Specialty::Athlete | Specialty::Politician => Era::Modern,
            Specialty::Programmer => Era::Information,
        }
    }

    pub fn wealth_per_tick(self) -> u32 {
        match self {
            Specialty::Farmer | Specialty::Hunter | Specialty::Miner => 1,
            Specialty::Smith | Specialty::Builder | Specialty::Weaver | Specialty::Baker | Specialty::Carpenter | Specialty::Mason | Specialty::Brewer => 2,
            Specialty::Merchant | Specialty::Sailor => 3,
            Specialty::Healer | Specialty::Priest | Specialty::Artist | Specialty::Scribe | Specialty::Scholar => 2,
            Specialty::Engineer | Specialty::Teacher | Specialty::Soldier => 4,
            Specialty::Doctor | Specialty::Lawyer | Specialty::Banker | Specialty::Officer => 6,
            Specialty::Pilot | Specialty::Journalist | Specialty::Actor | Specialty::Athlete | Specialty::Politician => 8,
            Specialty::Programmer => 12,
        }
    }
}

pub fn currency_unit_for_era(era: Era) -> &'static str {
    match era {
        Era::PreStone | Era::Stone => "shells",
        Era::Bronze => "beads",
        Era::Iron | Era::Classical => "coins",
        Era::Medieval => "denarii",
        Era::Renaissance => "florins",
        Era::Industrial => "pounds",
        Era::Modern | Era::Information => "dollars",
        Era::Atomic | Era::Space => "credits",
        Era::Digital | Era::Quantum => "tokens",
        Era::Solar | Era::Fusion => "ergs",
        Era::Genetic | Era::Orbital | Era::Lunar | Era::Martian => "creds",
        Era::Cyber | Era::Neural | Era::Posthuman => "synth",
        Era::Interstellar | Era::Singularity | Era::Galactic => "stars",
        _ => "essence",
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PriceTable {
    pub food: u32,
    pub water: u32,
    pub wood: u32,
    pub stone: u32,
    pub iron: u32,
    pub cloth: u32,
    pub bread: u32,
}

impl PriceTable {
    pub fn for_era(era: Era) -> Self {
        match era {
            Era::PreStone | Era::Stone => PriceTable { food: 1, water: 1, wood: 1, stone: 1, iron: 0, cloth: 0, bread: 0 },
            Era::Bronze => PriceTable { food: 2, water: 1, wood: 1, stone: 1, iron: 0, cloth: 2, bread: 2 },
            Era::Iron => PriceTable { food: 2, water: 1, wood: 1, stone: 2, iron: 4, cloth: 2, bread: 2 },
            Era::Classical => PriceTable { food: 3, water: 1, wood: 2, stone: 3, iron: 5, cloth: 3, bread: 3 },
            Era::Medieval => PriceTable { food: 3, water: 1, wood: 2, stone: 3, iron: 6, cloth: 4, bread: 3 },
            Era::Renaissance => PriceTable { food: 4, water: 1, wood: 3, stone: 4, iron: 6, cloth: 5, bread: 4 },
            Era::Industrial => PriceTable { food: 5, water: 1, wood: 4, stone: 5, iron: 8, cloth: 4, bread: 4 },
            Era::Modern => PriceTable { food: 6, water: 2, wood: 5, stone: 6, iron: 9, cloth: 5, bread: 5 },
            Era::Information => PriceTable { food: 8, water: 3, wood: 6, stone: 7, iron: 10, cloth: 7, bread: 6 },
            _ => PriceTable { food: 10, water: 4, wood: 8, stone: 9, iron: 12, cloth: 9, bread: 8 },
        }
    }

    pub fn price_for(&self, era: Era, good: &str) -> u32 {
        match good {
            "food" => self.food,
            "water" => self.water,
            "wood" => self.wood,
            "stone" => self.stone,
            "iron" => self.iron,
            "cloth" => self.cloth,
            "bread" => self.bread,
            _ => tools_price(era, good),
        }
    }
}

pub const TRADABLE_TOOLS: &[&str] = &[
    "blended_spirit",
    "aged_spirit",
    "bottled_spirit",
    "spirit",
    "bottle",
    "preserved",
    "preserved_meat",
    "sausage",
    "ground",
    "cuts",
    "meat",
    "garment",
    "pattern",
    "article",
    "drink",
    "pastry",
    "coffee",
    "stock",
];

pub fn tools_price(era: Era, good: &str) -> u32 {
    let base: u32 = match good {
        "blended_spirit" => 14,
        "aged_spirit" => 11,
        "bottled_spirit" => 9,
        "spirit" => 7,
        "bottle" => 5,
        "preserved" | "preserved_meat" => 7,
        "sausage" => 6,
        "ground" => 4,
        "cuts" => 4,
        "meat" => 3,
        "garment" => 9,
        "pattern" => 3,
        "article" => 10,
        "drink" => 5,
        "pastry" => 4,
        "coffee" => 3,
        "stock" => 3,
        _ => 0,
    };
    if base == 0 {
        return 0;
    }
    base + (era as u32).min(8) / 2
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Trade {
    pub tick: u64,
    pub buyer_id: String,
    pub seller_id: String,
    pub good: String,
    pub amount: u32,
    pub price: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LineageTreasury {
    pub balance: u64,
    pub tax_rate: f32,
}

pub fn elder_pension(era: Era) -> u32 {
    match era {
        Era::Modern | Era::Information => 2,
        Era::Industrial => 1,
        _ => 0,
    }
}

pub fn lineage_currencies(lineage_eras: &HashMap<String, Era>) -> HashMap<String, &'static str> {
    lineage_eras.iter().map(|(lid, era)| (lid.clone(), currency_unit_for_era(*era))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn currency_progression() {
        assert_eq!(currency_unit_for_era(Era::Stone), "shells");
        assert_eq!(currency_unit_for_era(Era::Information), "dollars");
    }

    #[test]
    fn price_growth_with_era() {
        assert!(PriceTable::for_era(Era::Information).food > PriceTable::for_era(Era::Stone).food);
    }
}
