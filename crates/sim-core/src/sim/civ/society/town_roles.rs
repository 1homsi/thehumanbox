use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::organism::skills::Skill;
use crate::sim::civ::land::road_net::{Dest, NetKind};
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

pub const LAND_REACH: i32 = 14;
const RESCORE_TICKS: u64 = 4 * DAY_LENGTH;
const JUNCTION_ROADS: u8 = 3;
const LEAST_SCORE: f32 = 70.0;
const FERTILE: f32 = 0.3;
const FARM_WEIGHT: f32 = 0.5;
const COAST_WEIGHT: f32 = 2.5;
const ROCK_WEIGHT: f32 = 1.5;
const MINERAL_WEIGHT: f32 = 4.0;
const FOREST_WEIGHT: f32 = 0.45;
const MIN_COAST: u16 = 25;
const ROUTE_END: i32 = 4;
const ROUTE_DELIVERIES: u32 = 3;
const BUSY_ROUTES: u8 = 2;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TownRole {
    #[default]
    Mixed,
    Farming,
    Harbour,
    Mining,
    Timber,
    Trade,
    Capital,
}

pub const ROLES: [TownRole; 7] = [
    TownRole::Mixed,
    TownRole::Farming,
    TownRole::Harbour,
    TownRole::Mining,
    TownRole::Timber,
    TownRole::Trade,
    TownRole::Capital,
];

impl TownRole {
    pub fn name(self) -> &'static str {
        match self {
            TownRole::Mixed => "mixed",
            TownRole::Farming => "farming",
            TownRole::Harbour => "harbour",
            TownRole::Mining => "mining",
            TownRole::Timber => "timber",
            TownRole::Trade => "trade",
            TownRole::Capital => "capital",
        }
    }

    fn words(self) -> &'static str {
        match self {
            TownRole::Mixed => "a market town",
            TownRole::Farming => "a farming town",
            TownRole::Harbour => "a harbour town",
            TownRole::Mining => "a mining town",
            TownRole::Timber => "a timber town",
            TownRole::Trade => "a trade hub",
            TownRole::Capital => "the capital",
        }
    }

    fn icon(self) -> &'static str {
        match self {
            TownRole::Mixed => "\u{1F3D8}\u{FE0F}",
            TownRole::Farming => "\u{1F33E}",
            TownRole::Harbour => "\u{2693}",
            TownRole::Mining => "\u{26CF}\u{FE0F}",
            TownRole::Timber => "\u{1FAB5}",
            TownRole::Trade => "\u{1F42A}",
            TownRole::Capital => "\u{1F451}",
        }
    }

    pub fn skill(self) -> Option<Skill> {
        match self {
            TownRole::Farming => Some(Skill::Farming),
            TownRole::Harbour => Some(Skill::Fishing),
            TownRole::Mining => Some(Skill::Quarrying),
            TownRole::Timber => Some(Skill::Woodcutting),
            _ => None,
        }
    }

    pub fn makes(self) -> Option<usize> {
        match self {
            TownRole::Farming | TownRole::Harbour => Some(0),
            TownRole::Timber => Some(1),
            TownRole::Mining => Some(2),
            _ => None,
        }
    }

    pub fn buildings(self) -> &'static [(Era, BuildingKind)] {
        use BuildingKind::*;
        match self {
            TownRole::Farming => &[
                (Era::Bronze, Granary),
                (Era::Medieval, Mill),
                (Era::Medieval, Windmill),
                (Era::Industrial, Silo),
            ],
            TownRole::Harbour => &[
                (Era::Iron, Port),
                (Era::Iron, Fishmonger),
                (Era::Industrial, Dock),
            ],
            TownRole::Mining => &[(Era::Bronze, Quarry), (Era::Bronze, Mine), (Era::Bronze, Smithy)],
            TownRole::Timber => &[
                (Era::Stone, Workshop),
                (Era::Bronze, SawMill),
                (Era::Iron, Tannery),
            ],
            TownRole::Trade => &[
                (Era::Bronze, MarketStall),
                (Era::Medieval, Inn),
                (Era::Industrial, Warehouse),
            ],
            TownRole::Capital => &[
                (Era::Bronze, Monument),
                (Era::Renaissance, Courthouse),
                (Era::Renaissance, CityHall),
            ],
            TownRole::Mixed => &[],
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct TownLand {
    pub fertile: u16,
    pub coast: u16,
    pub rock: u16,
    pub mineral: u16,
    pub forest: u16,
    pub junction: u8,
    pub routes: u8,
}

impl TownLand {
    pub fn role(&self, capital: bool) -> TownRole {
        if capital {
            return TownRole::Capital;
        }
        if self.junction >= JUNCTION_ROADS
            || (self.junction + 1 >= JUNCTION_ROADS && self.routes >= BUSY_ROUTES)
        {
            return TownRole::Trade;
        }
        let coast = if self.coast >= MIN_COAST {
            f32::from(self.coast) * COAST_WEIGHT
        } else {
            0.0
        };
        let scores = [
            (f32::from(self.fertile) * FARM_WEIGHT, TownRole::Farming),
            (coast, TownRole::Harbour),
            (
                f32::from(self.rock) * ROCK_WEIGHT + f32::from(self.mineral) * MINERAL_WEIGHT,
                TownRole::Mining,
            ),
            (f32::from(self.forest) * FOREST_WEIGHT, TownRole::Timber),
        ];
        let (best, role) =
            scores.into_iter().fold(
                (0.0f32, TownRole::Mixed),
                |acc, s| if s.0 > acc.0 { s } else { acc },
            );
        if best < LEAST_SCORE {
            TownRole::Mixed
        } else {
            role
        }
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

pub fn town_land(sim: &Simulation, centre: [i32; 2], id: u32) -> TownLand {
    let mut land = TownLand::default();
    let grid = &sim.grid;
    for dy in -LAND_REACH..=LAND_REACH {
        for dx in -LAND_REACH..=LAND_REACH {
            let (x, y) = (centre[0] + dx, centre[1] + dy);
            if !WorldGrid::in_bounds(x, y) {
                continue;
            }
            match grid.get(x, y) {
                Tile::Rock => land.rock += 1,
                Tile::Mineral => land.mineral += 1,
                Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow => {
                    if [(1, 0), (-1, 0), (0, 1), (0, -1)]
                        .iter()
                        .any(|&(ox, oy)| grid.get(x + ox, y + oy) == Tile::Water)
                    {
                        land.coast += 1;
                    }
                    if grid.biome_at(x, y).wooded() {
                        land.forest += 1;
                    } else if grid.fertility_at(x, y) >= FERTILE {
                        land.fertile += 1;
                    }
                }
                _ => {}
            }
        }
    }
    let roads = sim
        .road_net
        .edges
        .iter()
        .filter(|e| {
            e.kind == NetKind::Road
                && matches!(e.dest, Dest::Town | Dest::Partner)
                && e.complete()
                && (e.from_town == id || e.to_town == Some(id) || e.from == centre || e.to == centre)
        })
        .count();
    let routes = sim
        .trade_routes
        .iter()
        .filter(|r| {
            r.deliveries >= ROUTE_DELIVERIES
                && (chebyshev(r.a_center, centre) <= ROUTE_END || chebyshev(r.b_center, centre) <= ROUTE_END)
        })
        .count();
    land.junction = roads.min(usize::from(u8::MAX)) as u8;
    land.routes = routes.min(usize::from(u8::MAX)) as u8;
    land
}

impl Simulation {
    pub(crate) fn score_town_roles(&mut self) {
        let now = self.tick_count;
        let capitals: BTreeMap<u32, ()> = self.diplomacy.nations.iter().map(|n| (n.capital, ())).collect();
        let mut changes: Vec<(String, TownRole, TownRole)> = Vec::new();
        for i in 0..self.towns.len() {
            let town = &self.towns[i];
            let capital = capitals.contains_key(&town.id);
            let due = town.role_tick == 0
                || now.saturating_sub(town.role_tick) >= RESCORE_TICKS
                || (capital != (town.role == TownRole::Capital));
            if !due {
                continue;
            }
            let role = town_land(self, town.center, town.id).role(capital);
            let town = &mut self.towns[i];
            let before = town.role;
            let scored = town.role_tick != 0;
            town.role = role;
            town.role_tick = now.max(1);
            if scored && before != role {
                changes.push((town.lineage.to_string(), before, role));
            }
        }
        for (lineage, before, after) in changes {
            if before == TownRole::Capital || after == TownRole::Capital {
                continue;
            }
            self.diplomacy.stats.role_changes += 1;
            let name = self.tribe_name(&lineage);
            let detail = format!(
                "{} A town of the {name} became {} (it was {}).",
                after.icon(),
                after.words(),
                before.words()
            );
            push_event(&mut self.events, now, "milestone", &name, &detail);
        }
    }

    pub(crate) fn home_town_role(&self, idx: usize) -> TownRole {
        let o = &self.organisms[idx];
        let home = [o.home_x as i32, o.home_y as i32];
        self.towns
            .iter()
            .filter(|t| t.lineage == o.lineage_id)
            .map(|t| (t.distance(home[0], home[1]), t.id, t.role))
            .filter(|&(d, _, _)| d <= crate::sim::civ::civ_tick::town::PARENT_REACH)
            .min()
            .map_or(TownRole::Mixed, |(_, _, role)| role)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_land_round_a_town_decides_its_role() {
        let farm = TownLand {
            fertile: 400,
            ..Default::default()
        };
        assert_eq!(farm.role(false), TownRole::Farming);
        let mine = TownLand {
            fertile: 100,
            rock: 60,
            mineral: 20,
            ..Default::default()
        };
        assert_eq!(mine.role(false), TownRole::Mining);
        let harbour = TownLand {
            fertile: 100,
            coast: 40,
            ..Default::default()
        };
        assert_eq!(harbour.role(false), TownRole::Harbour);
        let wood = TownLand {
            fertile: 60,
            forest: 500,
            ..Default::default()
        };
        assert_eq!(wood.role(false), TownRole::Timber);
        let poor = TownLand {
            fertile: 40,
            ..Default::default()
        };
        assert_eq!(poor.role(false), TownRole::Mixed);
        let hub = TownLand { junction: 3, ..farm };
        assert_eq!(hub.role(false), TownRole::Trade);
        assert_eq!(hub.role(true), TownRole::Capital);
    }
}
