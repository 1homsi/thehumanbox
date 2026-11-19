use serde::{Deserialize, Serialize};

use crate::hashing::{FxHashMap, FxHashSet};
use crate::sim::civ::civ_tick::town::{town_residents, Town};
use crate::sim::civ::society::migration::Migration;
use crate::sim::civ::society::town_roles::TownRole;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{WorldGrid, ROAD_NONE};
use crate::world::tiles::{Biome, Tile};

pub const LAND_STEP: u64 = DAY_LENGTH;
const LAND_PHASE: u64 = DAY_LENGTH / 3;
const CLEAR_PEOPLE: usize = 5;
const CLEAR_REACH: i32 = 7;
const TIMBER_REACH: i32 = 9;
const CLEAR_PER_PASS: u32 = 2;
const TIMBER_PER_PASS: u32 = 3;
const CLEAR_CHANCE: f32 = 0.05;
const REGROW_TICKS: u64 = 8 * DAY_LENGTH;
const REGROW_CLEAR: i32 = 20;
const MAX_CLEARED: usize = 4096;
const RUIN_DAYS: [u64; 3] = [5, 20, 40];
const RUIN_REACH: i32 = 12;
pub const RESETTLE_REACH: i32 = 14;
const LIVED_IN: i32 = 8;
const MAX_RUINS: usize = 256;
const RUIN_MIN_AGE: u64 = 2 * DAY_LENGTH;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ClearedForest {
    pub at: [i32; 2],
    pub biome: u8,
    pub tick: u64,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct TownRuin {
    pub id: u32,
    pub lineage: String,
    pub name: String,
    pub center: [i32; 2],
    pub abandoned_tick: u64,
    pub role: TownRole,
}

impl TownRuin {
    pub fn stage(&self, now: u64) -> u8 {
        let days = now.saturating_sub(self.abandoned_tick) / DAY_LENGTH;
        RUIN_DAYS.iter().filter(|&&d| days >= d).count() as u8
    }

    pub fn stage_name(stage: u8) -> &'static str {
        match stage {
            0 => "empty",
            1 => "ruined",
            2 => "foundations",
            _ => "overgrown",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct LandStats {
    pub forest_cleared: u32,
    pub forest_regrown: u32,
    pub belt_fields: u32,
    pub towns_abandoned: u32,
    pub ruins_resettled: u32,
    pub ruins_overgrown: u32,
    pub migrations: [u32; 2],
    pub refugees: u32,
    pub welcomed: u32,
    pub turned_away: u32,
    pub settled: u32,
    pub people_welcomed: u32,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct LandMemory {
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub cleared: Vec<ClearedForest>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub ruins: Vec<TownRuin>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub migrations: Vec<Migration>,
    pub next_migration: u32,
    #[serde(skip)]
    pub stats: LandStats,
}

impl PartialEq for LandMemory {
    fn eq(&self, other: &Self) -> bool {
        self.cleared == other.cleared
            && self.ruins == other.ruins
            && self.migrations == other.migrations
            && self.next_migration == other.next_migration
    }
}

impl LandMemory {
    pub fn is_empty(&self) -> bool {
        self.cleared.is_empty()
            && self.ruins.is_empty()
            && self.migrations.is_empty()
            && self.next_migration == 0
    }

    pub fn shift(&mut self, dx: i32, dy: i32) {
        let move_by = |p: &mut [i32; 2]| {
            p[0] += dx;
            p[1] += dy;
        };
        self.cleared.iter_mut().for_each(|c| move_by(&mut c.at));
        self.ruins.iter_mut().for_each(|r| move_by(&mut r.center));
        for m in &mut self.migrations {
            move_by(&mut m.from);
            move_by(&mut m.to);
            m.path.iter_mut().for_each(move_by);
        }
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

pub(crate) fn tick_forests(sim: &mut Simulation) {
    use rand::RngExt;
    let residents = town_residents(sim);
    let mut towns: Vec<(u32, [i32; 2], TownRole)> = sim
        .towns
        .iter()
        .filter(|t| residents.get(&t.id).copied().unwrap_or(0) >= CLEAR_PEOPLE)
        .map(|t| (t.id, t.center, t.role))
        .collect();
    towns.sort_unstable_by_key(|t| t.0);
    let now = sim.tick_count;
    for (_, [cx, cy], role) in towns {
        let (reach, cap) = if role == TownRole::Timber {
            (TIMBER_REACH, TIMBER_PER_PASS)
        } else {
            (CLEAR_REACH, CLEAR_PER_PASS)
        };
        let mut cleared = 0;
        'scan: for dy in -reach..=reach {
            for dx in -reach..=reach {
                if cleared >= cap {
                    break 'scan;
                }
                let (x, y) = (cx + dx, cy + dy);
                if !WorldGrid::in_bounds(x, y) {
                    continue;
                }
                let biome = sim.grid.biome_at(x, y);
                if biome.wooded() && sim.rng.random::<f32>() < CLEAR_CHANCE {
                    let i = WorldGrid::idx(x, y);
                    sim.grid.biome[i] = Biome::Grassland as u8;
                    sim.land.cleared.push(ClearedForest {
                        at: [x, y],
                        biome: biome as u8,
                        tick: now,
                    });
                    sim.land.stats.forest_cleared += 1;
                    cleared += 1;
                }
            }
        }
    }
    if sim.land.cleared.len() > MAX_CLEARED {
        let extra = sim.land.cleared.len() - MAX_CLEARED;
        sim.land.cleared.drain(..extra);
    }
}

fn covered_tiles(sim: &Simulation) -> FxHashSet<(i32, i32)> {
    let mut covered = FxHashSet::default();
    for b in &sim.buildings {
        let (w, h) = b.footprint();
        for dy in 0..i32::from(h) {
            for dx in 0..i32::from(w) {
                covered.insert((b.x + dx, b.y + dy));
            }
        }
    }
    for f in &sim.farms {
        covered.insert((f.x, f.y));
    }
    covered
}

impl Simulation {
    pub(crate) fn tick_land_memory(&mut self) {
        if self.tick_count == 0 || self.tick_count % LAND_STEP != LAND_PHASE {
            return;
        }
        self.regrow_forests();
        self.age_ruins();
    }

    fn regrow_forests(&mut self) {
        if self.land.cleared.is_empty() {
            return;
        }
        let now = self.tick_count;
        let centres: Vec<[i32; 2]> = self.towns.iter().map(|t| t.center).collect();
        let covered = covered_tiles(self);
        let mut regrown = 0;
        let grid = &mut self.grid;
        self.land.cleared.retain(|c| {
            if now.saturating_sub(c.tick) < REGROW_TICKS
                || centres.iter().any(|&t| chebyshev(t, c.at) <= REGROW_CLEAR)
            {
                return true;
            }
            let [x, y] = c.at;
            if !matches!(grid.get(x, y), Tile::Grass | Tile::Food | Tile::Snow) {
                return false;
            }
            if covered.contains(&(x, y)) || grid.road_at(x, y) != ROAD_NONE {
                return true;
            }
            grid.biome[WorldGrid::idx(x, y)] = c.biome;
            regrown += 1;
            false
        });
        self.land.stats.forest_regrown += regrown;
    }

    pub(crate) fn note_abandoned_towns(&mut self, dropped: &[Town]) {
        let now = self.tick_count;
        for town in dropped {
            if !town.planned || now.saturating_sub(town.founded_tick) < RUIN_MIN_AGE {
                continue;
            }
            let name = self.tribe_name(&town.lineage);
            self.land.ruins.push(TownRuin {
                id: town.id,
                lineage: town.lineage.clone(),
                name: name.clone(),
                center: town.center,
                abandoned_tick: now,
                role: town.role,
            });
            self.land.stats.towns_abandoned += 1;
            let detail = format!("\u{1F3DA}\u{FE0F} A town of the {name} stands empty.");
            push_event(&mut self.events, now, "milestone", &name, &detail);
        }
        if self.land.ruins.len() > MAX_RUINS {
            let extra = self.land.ruins.len() - MAX_RUINS;
            self.land.ruins.drain(..extra);
        }
    }

    pub(crate) fn resettle_ruin(&mut self, lineage: &str, at: [i32; 2]) -> Option<[i32; 2]> {
        let (i, _) = self
            .land
            .ruins
            .iter()
            .enumerate()
            .map(|(i, r)| (i, (chebyshev(r.center, at), r.id)))
            .filter(|(_, (d, _))| *d <= RESETTLE_REACH)
            .min_by_key(|(_, key)| *key)?;
        let ruin = self.land.ruins.remove(i);
        self.land.stats.ruins_resettled += 1;
        let now = self.tick_count;
        let name = self.tribe_name(lineage);
        let detail = if ruin.lineage == lineage {
            format!("\u{1F3D7}\u{FE0F} The {name} came back to their old town and built it up again.")
        } else {
            format!(
                "\u{1F3D7}\u{FE0F} The {name} settled in the ruins of an old town of the {}.",
                ruin.name
            )
        };
        push_event(&mut self.events, now, "milestone", &name, &detail);
        Some(ruin.center)
    }

    fn age_ruins(&mut self) {
        if self.land.ruins.is_empty() {
            return;
        }
        let now = self.tick_count;
        let lived_in: Vec<(String, [i32; 2])> = self
            .land
            .ruins
            .iter()
            .filter_map(|r| {
                self.towns
                    .iter()
                    .filter(|t| chebyshev(t.center, r.center) <= LIVED_IN)
                    .min_by_key(|t| (chebyshev(t.center, r.center), t.id))
                    .map(|t| (t.lineage.clone(), r.center))
            })
            .collect();
        for (lineage, at) in lived_in {
            self.resettle_ruin(&lineage, at);
        }
        let living: FxHashSet<&str> = self
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| o.lineage_id.as_str())
            .collect();
        let mut gone: Vec<TownRuin> = Vec::new();
        self.land.ruins.retain(|r| {
            if r.stage(now) >= 3 {
                gone.push(r.clone());
                false
            } else {
                true
            }
        });
        if gone.is_empty() {
            return;
        }
        let mut cleared: FxHashMap<usize, ()> = FxHashMap::default();
        for (i, b) in self.buildings.iter().enumerate() {
            let dead = b.owner_lineage.as_deref().is_none_or(|l| !living.contains(l));
            if b.is_ruined() && dead && gone.iter().any(|r| chebyshev(r.center, [b.x, b.y]) <= RUIN_REACH) {
                cleared.insert(i, ());
            }
        }
        if !cleared.is_empty() {
            let mut i = 0;
            self.buildings.retain(|_| {
                i += 1;
                !cleared.contains_key(&(i - 1))
            });
            self.building_state_revision = self.building_state_revision.wrapping_add(1);
        }
        for r in gone {
            self.land.stats.ruins_overgrown += 1;
            let detail = format!("\u{1F33F} Grass has grown over the old town of the {}.", r.name);
            push_event(&mut self.events, now, "life", &r.name, &detail);
        }
    }
}

#[cfg(test)]
#[path = "land_memory_tests.rs"]
mod tests;
