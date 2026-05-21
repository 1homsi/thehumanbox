use serde::{Deserialize, Serialize};
use crate::sim::era::Era;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BuildingKind {
    Hut, House, Manor, TownHouse, Apartment,
    School, University, Library,
    Market, Temple, Factory, Hospital,
    Forge, Mill, Bakery, Inn, Bank, Workshop, Granary,
    Barracks, Lighthouse, Windmill, Watermill,
    Aqueduct, Bridge, Wall, Tower, Plaza, Statue, Fountain,
    TrainStation, Airport, Port, Stadium, Museum, Cathedral, Castle,
    Theatre, Observatory,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildingFunction {
    Housing, Education, Worship, Trade, Industry, Healthcare,
    Military, Civic, Infrastructure, Recreation,
}

impl BuildingKind {
    pub fn name(self) -> &'static str {
        match self {
            BuildingKind::Hut => "hut",
            BuildingKind::House => "house",
            BuildingKind::Manor => "manor",
            BuildingKind::TownHouse => "townhouse",
            BuildingKind::Apartment => "apartment",
            BuildingKind::School => "school",
            BuildingKind::University => "university",
            BuildingKind::Library => "library",
            BuildingKind::Market => "market",
            BuildingKind::Temple => "temple",
            BuildingKind::Factory => "factory",
            BuildingKind::Hospital => "hospital",
            BuildingKind::Forge => "forge",
            BuildingKind::Mill => "mill",
            BuildingKind::Bakery => "bakery",
            BuildingKind::Inn => "inn",
            BuildingKind::Bank => "bank",
            BuildingKind::Workshop => "workshop",
            BuildingKind::Granary => "granary",
            BuildingKind::Barracks => "barracks",
            BuildingKind::Lighthouse => "lighthouse",
            BuildingKind::Windmill => "windmill",
            BuildingKind::Watermill => "watermill",
            BuildingKind::Aqueduct => "aqueduct",
            BuildingKind::Bridge => "bridge",
            BuildingKind::Wall => "wall",
            BuildingKind::Tower => "tower",
            BuildingKind::Plaza => "plaza",
            BuildingKind::Statue => "statue",
            BuildingKind::Fountain => "fountain",
            BuildingKind::TrainStation => "train_station",
            BuildingKind::Airport => "airport",
            BuildingKind::Port => "port",
            BuildingKind::Stadium => "stadium",
            BuildingKind::Museum => "museum",
            BuildingKind::Cathedral => "cathedral",
            BuildingKind::Castle => "castle",
            BuildingKind::Theatre => "theatre",
            BuildingKind::Observatory => "observatory",
        }
    }

    pub fn era_unlock(self) -> Era {
        match self {
            BuildingKind::Hut => Era::Stone,
            BuildingKind::House => Era::Bronze,
            BuildingKind::Manor | BuildingKind::Castle => Era::Medieval,
            BuildingKind::TownHouse => Era::Renaissance,
            BuildingKind::Apartment => Era::Modern,
            BuildingKind::School | BuildingKind::Library => Era::Classical,
            BuildingKind::University | BuildingKind::Theatre => Era::Renaissance,
            BuildingKind::Market | BuildingKind::Plaza => Era::Iron,
            BuildingKind::Temple => Era::Bronze,
            BuildingKind::Cathedral => Era::Medieval,
            BuildingKind::Factory | BuildingKind::Bank => Era::Industrial,
            BuildingKind::Hospital | BuildingKind::Stadium | BuildingKind::Airport | BuildingKind::Museum => Era::Modern,
            BuildingKind::Forge | BuildingKind::Workshop | BuildingKind::Granary | BuildingKind::Statue | BuildingKind::Fountain | BuildingKind::Wall | BuildingKind::Tower | BuildingKind::Barracks => Era::Bronze,
            BuildingKind::Mill | BuildingKind::Windmill | BuildingKind::Watermill | BuildingKind::Inn | BuildingKind::Bakery => Era::Medieval,
            BuildingKind::Aqueduct | BuildingKind::Bridge | BuildingKind::Lighthouse | BuildingKind::Observatory => Era::Classical,
            BuildingKind::TrainStation => Era::Industrial,
            BuildingKind::Port => Era::Iron,
        }
    }

    pub fn footprint(self) -> (u8, u8) {
        match self {
            BuildingKind::Hut | BuildingKind::Statue | BuildingKind::Fountain => (1, 1),
            BuildingKind::House | BuildingKind::Inn | BuildingKind::Bakery | BuildingKind::Forge | BuildingKind::Workshop | BuildingKind::Granary | BuildingKind::Mill | BuildingKind::Windmill | BuildingKind::Watermill | BuildingKind::Bank | BuildingKind::Wall | BuildingKind::Tower | BuildingKind::Lighthouse | BuildingKind::Observatory => (2, 2),
            BuildingKind::TownHouse => (2, 3),
            BuildingKind::Market | BuildingKind::School | BuildingKind::Hospital | BuildingKind::Plaza | BuildingKind::Temple | BuildingKind::Theatre | BuildingKind::Barracks | BuildingKind::Museum | BuildingKind::TrainStation | BuildingKind::Port => (3, 3),
            BuildingKind::Manor | BuildingKind::University | BuildingKind::Library | BuildingKind::Stadium | BuildingKind::Apartment | BuildingKind::Cathedral | BuildingKind::Castle | BuildingKind::Factory | BuildingKind::Airport => (4, 4),
            BuildingKind::Aqueduct | BuildingKind::Bridge => (4, 1),
        }
    }

    pub fn capacity(self) -> u8 {
        match self {
            BuildingKind::Hut => 2,
            BuildingKind::House | BuildingKind::Inn | BuildingKind::Bakery | BuildingKind::Workshop | BuildingKind::Forge => 4,
            BuildingKind::TownHouse => 6,
            BuildingKind::Manor | BuildingKind::Apartment => 12,
            BuildingKind::School | BuildingKind::University | BuildingKind::Library | BuildingKind::Temple | BuildingKind::Market | BuildingKind::Hospital | BuildingKind::Cathedral | BuildingKind::Theatre | BuildingKind::Museum => 20,
            BuildingKind::Castle | BuildingKind::Barracks | BuildingKind::Factory | BuildingKind::Stadium | BuildingKind::Airport | BuildingKind::TrainStation | BuildingKind::Port => 40,
            _ => 0,
        }
    }

    pub fn material_cost(self) -> &'static [(&'static str, u32)] {
        match self {
            BuildingKind::Hut => &[("wood", 8), ("grass", 4)],
            BuildingKind::House => &[("wood", 20), ("stone", 8)],
            BuildingKind::Manor => &[("wood", 60), ("stone", 40), ("iron", 6)],
            BuildingKind::TownHouse => &[("wood", 40), ("stone", 28)],
            BuildingKind::Apartment => &[("concrete", 200), ("steel", 60), ("glass", 40)],
            BuildingKind::School => &[("wood", 40), ("stone", 30), ("paper", 10)],
            BuildingKind::University => &[("stone", 80), ("wood", 60), ("paper", 30), ("iron", 10)],
            BuildingKind::Library => &[("stone", 50), ("wood", 30), ("paper", 60)],
            BuildingKind::Market => &[("wood", 25), ("stone", 10)],
            BuildingKind::Temple => &[("stone", 60), ("gold", 4)],
            BuildingKind::Cathedral => &[("stone", 200), ("gold", 20), ("glass", 10)],
            BuildingKind::Castle => &[("stone", 250), ("iron", 30), ("wood", 60)],
            BuildingKind::Factory => &[("brick", 150), ("steel", 80), ("coal", 30)],
            BuildingKind::Hospital => &[("brick", 80), ("steel", 30), ("glass", 20)],
            BuildingKind::Forge => &[("stone", 30), ("iron", 8)],
            BuildingKind::Mill | BuildingKind::Windmill | BuildingKind::Watermill => &[("wood", 30), ("stone", 12)],
            BuildingKind::Bakery | BuildingKind::Inn | BuildingKind::Workshop => &[("wood", 25), ("stone", 10)],
            BuildingKind::Bank => &[("stone", 60), ("iron", 20), ("gold", 10)],
            BuildingKind::Granary => &[("wood", 30), ("stone", 10)],
            BuildingKind::Barracks => &[("wood", 40), ("stone", 30), ("iron", 12)],
            BuildingKind::Lighthouse => &[("stone", 50), ("wood", 15)],
            BuildingKind::Aqueduct => &[("stone", 80)],
            BuildingKind::Bridge => &[("stone", 60), ("wood", 20)],
            BuildingKind::Wall | BuildingKind::Tower => &[("stone", 40)],
            BuildingKind::Plaza | BuildingKind::Statue | BuildingKind::Fountain => &[("stone", 20)],
            BuildingKind::TrainStation => &[("brick", 100), ("steel", 60), ("iron", 30)],
            BuildingKind::Airport => &[("concrete", 300), ("steel", 200), ("glass", 80)],
            BuildingKind::Port => &[("wood", 80), ("stone", 60)],
            BuildingKind::Stadium => &[("concrete", 250), ("steel", 100)],
            BuildingKind::Museum => &[("stone", 120), ("glass", 30), ("paper", 20)],
            BuildingKind::Theatre => &[("wood", 80), ("stone", 50)],
            BuildingKind::Observatory => &[("stone", 60), ("glass", 30), ("iron", 10)],
        }
    }

    pub fn function(self) -> BuildingFunction {
        match self {
            BuildingKind::Hut | BuildingKind::House | BuildingKind::Manor | BuildingKind::TownHouse | BuildingKind::Apartment | BuildingKind::Castle | BuildingKind::Inn => BuildingFunction::Housing,
            BuildingKind::School | BuildingKind::University | BuildingKind::Library | BuildingKind::Museum | BuildingKind::Observatory => BuildingFunction::Education,
            BuildingKind::Temple | BuildingKind::Cathedral => BuildingFunction::Worship,
            BuildingKind::Market | BuildingKind::Bank | BuildingKind::Workshop | BuildingKind::Bakery | BuildingKind::Port => BuildingFunction::Trade,
            BuildingKind::Forge | BuildingKind::Mill | BuildingKind::Windmill | BuildingKind::Watermill | BuildingKind::Factory | BuildingKind::Granary => BuildingFunction::Industry,
            BuildingKind::Hospital => BuildingFunction::Healthcare,
            BuildingKind::Barracks | BuildingKind::Wall | BuildingKind::Tower => BuildingFunction::Military,
            BuildingKind::Plaza | BuildingKind::Statue | BuildingKind::Fountain | BuildingKind::Lighthouse => BuildingFunction::Civic,
            BuildingKind::Aqueduct | BuildingKind::Bridge | BuildingKind::TrainStation | BuildingKind::Airport => BuildingFunction::Infrastructure,
            BuildingKind::Stadium | BuildingKind::Theatre => BuildingFunction::Recreation,
        }
    }

    pub fn all() -> &'static [BuildingKind] {
        use BuildingKind::*;
        &[Hut, House, Manor, TownHouse, Apartment, School, University, Library,
          Market, Temple, Factory, Hospital, Forge, Mill, Bakery, Inn, Bank,
          Workshop, Granary, Barracks, Lighthouse, Windmill, Watermill,
          Aqueduct, Bridge, Wall, Tower, Plaza, Statue, Fountain,
          TrainStation, Airport, Port, Stadium, Museum, Cathedral, Castle,
          Theatre, Observatory]
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Building {
    pub id: u32,
    pub kind: BuildingKind,
    pub x: i32,
    pub y: i32,
    pub owner_lineage: Option<String>,
    pub occupants: Vec<String>,
    pub built_at_tick: u64,
    pub condition: f32,
}

impl Building {
    pub fn new(id: u32, kind: BuildingKind, x: i32, y: i32, owner: Option<String>, tick: u64) -> Self {
        Building { id, kind, x, y, owner_lineage: owner, occupants: Vec::new(), built_at_tick: tick, condition: 1.0 }
    }

    pub fn footprint(&self) -> (u8, u8) { self.kind.footprint() }
    pub fn function(&self) -> BuildingFunction { self.kind.function() }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        let (w, h) = self.kind.footprint();
        x >= self.x && x < self.x + w as i32 && y >= self.y && y < self.y + h as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn footprint_smoke() {
        assert_eq!(BuildingKind::Hut.footprint(), (1, 1));
        assert_eq!(BuildingKind::Apartment.footprint(), (4, 4));
        assert_eq!(BuildingKind::Bridge.footprint(), (4, 1));
    }

    #[test]
    fn era_unlock_progression() {
        assert!(BuildingKind::Hut.era_unlock() < BuildingKind::House.era_unlock());
        assert!(BuildingKind::House.era_unlock() < BuildingKind::Manor.era_unlock());
        assert!(BuildingKind::Manor.era_unlock() < BuildingKind::Apartment.era_unlock());
    }
}
