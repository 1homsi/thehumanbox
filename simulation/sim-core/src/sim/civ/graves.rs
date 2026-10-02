//! The dead are remembered, and kept in one place. A tribe lays its grown
//! dead in a cemetery: a shrine in the middle of a gridded yard a little way
//! from the houses, filled from the heart outwards. When the yard is full the
//! oldest stones weather away to make room, so a village that has lasted for
//! generations has a graveyard to show for it and not a scatter of stones
//! across its streets.

use crate::sim::civ::civ_tick::{footprint_cells, prop_site_is_clear};
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::{Building, BuildingKind};
use rustc_hash::FxHashSet;

/// Ticks between burials.
pub(crate) const GRAVE_STEP: u64 = 120;
/// Gravestones laid per pass.
const PER_PASS: usize = 4;
/// Most gravestones one tribe's cemetery holds.
const MAX_PER_TRIBE: usize = 48;
/// Farthest from its home a death is still carried to the cemetery, in tiles.
const HOME_RANGE: f32 = 18.0;
/// How far from the tribe's home its cemetery lies, in tiles.
const CEMETERY_DISTANCE: f32 = 13.0;
/// How far the yard reaches from its shrine, in tiles.
const YARD_REACH: i32 = 6;

/// A stable angle for a tribe's cemetery, so it is always on the same side.
fn cemetery_angle(lineage: &str) -> f32 {
    let mut h: u32 = 2166136261;
    for b in lineage.bytes() {
        h = (h ^ u32::from(b)).wrapping_mul(16777619);
    }
    (h % 360) as f32 * std::f32::consts::PI / 180.0
}

/// Plots of a yard around its shrine at (cx, cy): every other tile in rows
/// and columns, nearest the shrine first.
fn yard_plots(cx: i32, cy: i32) -> Vec<(i32, i32)> {
    let mut plots: Vec<(i32, i32)> = (-YARD_REACH..=YARD_REACH)
        .step_by(2)
        .flat_map(|dy| (-YARD_REACH..=YARD_REACH).step_by(2).map(move |dx| (dx, dy)))
        .filter(|&(dx, dy)| (dx, dy) != (0, 0))
        .collect();
    plots.sort_by_key(|&(dx, dy)| (dx * dx + dy * dy, dy, dx));
    plots.into_iter().map(|(dx, dy)| (cx + dx, cy + dy)).collect()
}

impl Simulation {
    /// Where a tribe's cemetery lies: the first of eight bearings from its
    /// home whose shrine tile and most of whose yard are clear.
    fn cemetery_site(
        &mut self,
        lineage: &str,
        home: (f32, f32),
        occupied: &FxHashSet<(i32, i32)>,
    ) -> Option<(i32, i32)> {
        if let Some(&site) = self.cemeteries.get(lineage) {
            return Some(site);
        }
        let start = cemetery_angle(lineage);
        for step in 0..8 {
            let a = start + step as f32 * std::f32::consts::FRAC_PI_4;
            let c = (
                (home.0 + a.cos() * CEMETERY_DISTANCE).round() as i32,
                (home.1 + a.sin() * CEMETERY_DISTANCE).round() as i32,
            );
            if !prop_site_is_clear(&self.grid, occupied, BuildingKind::Shrine, c.0, c.1) {
                continue;
            }
            let room = yard_plots(c.0, c.1)
                .into_iter()
                .filter(|&(x, y)| prop_site_is_clear(&self.grid, occupied, BuildingKind::GraveStone, x, y))
                .count();
            if room >= 16 {
                self.cemeteries.insert(lineage.to_string(), c);
                return Some(c);
            }
        }
        None
    }

    pub(crate) fn tick_graves(&mut self) {
        if self.grave_queue.is_empty() {
            return;
        }
        let queue: Vec<(String, f32, f32)> = self.grave_queue.drain(..).collect();
        let mut occupied: FxHashSet<(i32, i32)> = self
            .buildings
            .iter()
            .flat_map(|b| footprint_cells(b.kind, b.x, b.y))
            .collect();
        let mut laid = 0;
        for (lineage, x, y) in queue {
            if laid >= PER_PASS {
                break;
            }
            let Some(home) = self
                .lineage_homes
                .get(&lineage)
                .map(|h| (h[0] as f32, h[1] as f32))
            else {
                continue;
            };
            if (x - home.0).hypot(y - home.1) > HOME_RANGE {
                continue;
            }
            let Some((cx, cy)) = self.cemetery_site(&lineage, home, &occupied) else {
                continue;
            };
            // A cemetery has its shrine before its first grave.
            let has_shrine = self
                .buildings
                .iter()
                .any(|b| b.kind == BuildingKind::Shrine && b.decorative && (b.x, b.y) == (cx, cy));
            if !has_shrine {
                let id = self.next_building_id;
                self.next_building_id += 1;
                let mut shrine = Building::new(
                    id,
                    BuildingKind::Shrine,
                    cx,
                    cy,
                    Some(lineage.clone()),
                    self.tick_count,
                );
                shrine.condition = 1.0;
                shrine.decorative = true;
                self.buildings.push(shrine);
                occupied.extend(footprint_cells(BuildingKind::Shrine, cx, cy));
            }
            // A full yard lets its oldest stone weather away.
            let mut mine: Vec<(u64, u32)> = self
                .buildings
                .iter()
                .filter(|b| {
                    b.kind == BuildingKind::GraveStone && b.owner_lineage.as_deref() == Some(lineage.as_str())
                })
                .map(|b| (b.built_at_tick, b.id))
                .collect();
            if mine.len() >= MAX_PER_TRIBE {
                mine.sort();
                let (_, oldest) = mine[0];
                if let Some(old) = self.buildings.iter().find(|b| b.id == oldest) {
                    for cell in footprint_cells(old.kind, old.x, old.y) {
                        occupied.remove(&cell);
                    }
                }
                self.buildings.retain(|b| b.id != oldest);
            }
            let Some((sx, sy)) = yard_plots(cx, cy).into_iter().find(|&(px, py)| {
                prop_site_is_clear(&self.grid, &occupied, BuildingKind::GraveStone, px, py)
            }) else {
                continue;
            };
            let id = self.next_building_id;
            self.next_building_id += 1;
            let mut grave = Building::new(
                id,
                BuildingKind::GraveStone,
                sx,
                sy,
                Some(lineage),
                self.tick_count,
            );
            grave.condition = 1.0;
            grave.decorative = true;
            self.buildings.push(grave);
            occupied.insert((sx, sy));
            laid += 1;
        }
        if laid > 0 {
            self.building_state_revision = self.building_state_revision.wrapping_add(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Tile;

    fn world() -> Simulation {
        let mut sim = Simulation::new(33);
        sim.buildings.clear();
        for y in 40..160 {
            for x in 40..160 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.lineage_homes.insert("clan".into(), [100, 100, 0]);
        sim
    }

    fn graves(sim: &Simulation) -> Vec<(i32, i32)> {
        sim.buildings
            .iter()
            .filter(|b| b.kind == BuildingKind::GraveStone)
            .map(|b| (b.x, b.y))
            .collect()
    }

    #[test]
    fn the_dead_lie_together_in_one_cemetery_with_a_shrine_apart_from_the_houses() {
        let mut sim = world();
        // Deaths all over the village still end in one yard.
        for (dx, dy) in [(1.0, 0.0), (-6.0, 3.0), (5.0, -7.0), (0.0, 9.0), (-8.0, -8.0)] {
            sim.grave_queue.push(("clan".into(), 100.0 + dx, 100.0 + dy));
        }
        sim.tick_graves();
        let stones = graves(&sim);
        assert_eq!(stones.len(), 4, "four graves per pass");
        let shrines: Vec<&Building> = sim
            .buildings
            .iter()
            .filter(|b| b.kind == BuildingKind::Shrine)
            .collect();
        assert_eq!(shrines.len(), 1, "a cemetery has one shrine");
        let (cx, cy) = (shrines[0].x, shrines[0].y);
        let away = (f64::from(cx - 100).powi(2) + f64::from(cy - 100).powi(2)).sqrt();
        assert!(away > 8.0, "the cemetery sits on the houses: {away}");
        for (x, y) in &stones {
            assert!(
                (x - cx).abs() <= YARD_REACH && (y - cy).abs() <= YARD_REACH,
                "a stone strayed from the yard"
            );
        }
        let distinct: std::collections::HashSet<_> = stones.iter().collect();
        assert_eq!(distinct.len(), stones.len());
        // The next pass fills the same yard, with no second shrine.
        sim.grave_queue.push(("clan".into(), 101.0, 100.0));
        sim.tick_graves();
        assert_eq!(graves(&sim).len(), 5);
        assert_eq!(
            sim.buildings
                .iter()
                .filter(|b| b.kind == BuildingKind::Shrine)
                .count(),
            1
        );
    }

    #[test]
    fn a_full_cemetery_lets_its_oldest_stone_weather_away() {
        let mut sim = world();
        for round in 0..(MAX_PER_TRIBE as u64 + 6) {
            sim.tick_count = 1_000 + round * 10;
            sim.grave_queue.push(("clan".into(), 101.0, 100.0));
            sim.tick_graves();
        }
        let stones: Vec<&Building> = sim
            .buildings
            .iter()
            .filter(|b| b.kind == BuildingKind::GraveStone)
            .collect();
        assert_eq!(stones.len(), MAX_PER_TRIBE);
        let oldest = stones.iter().map(|b| b.built_at_tick).min().unwrap();
        assert!(
            oldest >= 1_000 + 6 * 10,
            "the first stones were not the ones to go"
        );
    }

    #[test]
    fn a_grown_person_who_dies_is_buried_and_a_child_is_not() {
        use crate::organism::organism::Organism;
        let mut sim = world();
        sim.organisms.clear();
        for (id, age) in [("adult", 9_000u32), ("child", 1_000)] {
            let mut o = Organism::new(
                id.into(),
                id.into(),
                100.0,
                100.0,
                0,
                String::new(),
                "clan".into(),
                20_000,
                Default::default(),
            );
            o.alive = true;
            o.age = age;
            o.health = -1.0;
            sim.organisms.push(o);
        }
        for _ in 0..30 {
            sim.tick();
            if sim.organisms.iter().all(|o| !o.alive) {
                break;
            }
        }
        assert!(sim.organisms.iter().all(|o| !o.alive), "they did not die");
        sim.tick_graves();
        assert_eq!(graves(&sim).len(), 1, "one grown person died, so one grave");
    }

    #[test]
    fn far_from_home_or_without_a_home_nobody_is_buried() {
        let mut sim = world();
        sim.grave_queue.push(("clan".into(), 45.0, 45.0));
        sim.grave_queue.push(("nomads".into(), 101.0, 100.0));
        sim.tick_graves();
        assert!(sim.buildings.is_empty());
    }
}
