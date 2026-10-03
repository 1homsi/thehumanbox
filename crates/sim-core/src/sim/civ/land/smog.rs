//! Industry leaves its mark. Factories, refineries and coal plants foul the
//! air around them: the soil sours, and people who live in the smoke wear
//! down. Woodland drinks the smoke in, so a tribe or a god who plants trees
//! around its mills breathes easier, and the later ages learn to build clean.

use crate::sim::civ::eras::Era;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use serde::{Deserialize, Serialize};

/// How far a source's smoke reaches, in tiles.
pub const SMOG_REACH: f32 = 9.0;
/// Smog thicker than this wears on the people living in it.
const BREATHLESS: f32 = 0.25;
/// Health a day in the thickest smoke costs.
const SMOG_HARM: f32 = 0.03;
/// Fertility a day at a source's heart costs the soil.
const SMOG_SOURING: f32 = 0.004;
/// Most smoke the trees around a source can drink in.
const MAX_ABSORB: f32 = 0.7;

/// A chimney or pit fouling the air, with the trees around it accounted for.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SmogSource {
    pub x: f32,
    pub y: f32,
    pub strength: f32,
}

/// How much smoke a building gives off in its owner's age.
pub fn emission(kind: BuildingKind, era: Era) -> f32 {
    use BuildingKind::*;
    let base = match kind {
        PowerPlant => 1.5,
        Refinery => 1.2,
        Factory => 1.0,
        Mine => 0.3,
        _ => return 0.0,
    };
    // The information age learns to filter its chimneys; the solar age is clean.
    if era >= Era::Solar {
        0.0
    } else if era >= Era::Information {
        base * 0.4
    } else {
        base
    }
}

impl Simulation {
    /// How thick the smog is at (x, y): 0 clear, 1 and up choking.
    pub(crate) fn smog_at(&self, x: f32, y: f32) -> f32 {
        self.smog
            .iter()
            .map(|s| {
                let d = (s.x - x).hypot(s.y - y);
                if d >= SMOG_REACH {
                    0.0
                } else {
                    s.strength * (1.0 - d / SMOG_REACH)
                }
            })
            .sum()
    }

    fn smog_sources(&self) -> Vec<SmogSource> {
        let mut out = Vec::new();
        for b in self.buildings.iter().filter(|b| b.is_operational()) {
            let owner_era = b
                .owner_lineage
                .as_deref()
                .map_or(Era::Industrial, |l| self.era(l));
            let raw = emission(b.kind, owner_era);
            if raw <= 0.0 {
                continue;
            }
            let (fw, fh) = b.kind.footprint();
            let (x, y) = (b.x as f32 + fw as f32 / 2.0, b.y as f32 + fh as f32 / 2.0);
            let mut trees = 0u32;
            for dy in -4..=4 {
                for dx in -4..=4 {
                    if self.grid.biome_at(x as i32 + dx, y as i32 + dy).wooded() {
                        trees += 1;
                    }
                }
            }
            let absorbed = (trees as f32 * 0.025).min(MAX_ABSORB);
            out.push(SmogSource {
                x,
                y,
                strength: raw * (1.0 - absorbed),
            });
        }
        out
    }

    /// Once a day: recompute the smoke, sour the soil under it, and wear on
    /// the people breathing it.
    pub(crate) fn tick_smog(&mut self) {
        if !self.tick_count.is_multiple_of(DAY_LENGTH) {
            return;
        }
        self.smog = self.smog_sources();
        if self.smog.is_empty() {
            return;
        }
        let reach = SMOG_REACH as i32;
        for s in &self.smog {
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    let d = ((dx * dx + dy * dy) as f32).sqrt();
                    if d >= SMOG_REACH {
                        continue;
                    }
                    let amount = SMOG_SOURING * s.strength * (1.0 - d / SMOG_REACH);
                    self.grid
                        .reduce_fertility(s.x as i32 + dx, s.y as i32 + dy, amount);
                }
            }
        }
        let now = self.tick_count;
        let thick: Vec<(usize, f32)> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, self.smog_at(o.x, o.y)))
            .filter(|&(_, s)| s > BREATHLESS)
            .collect();
        for (i, smog) in thick {
            let o = &mut self.organisms[i];
            o.health = (o.health - SMOG_HARM * smog.min(2.0)).max(0.0);
            o.mark_harm(crate::organism::organism::Harm::Sickness, now);
            o.think("the air is thick with smoke", now);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::tech::buildings::Building;
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Biome;

    fn factory_world(trees: bool) -> Simulation {
        let mut sim = Simulation::new(71);
        sim.buildings.clear();
        for y in 80..120 {
            for x in 80..120 {
                let i = WorldGrid::idx(x, y);
                sim.grid.biome[i] = if trees {
                    Biome::Forest as u8
                } else {
                    Biome::Grassland as u8
                };
                sim.grid.fertility[i] = 0.7;
            }
        }
        let mut f = Building::new(1, BuildingKind::Factory, 100, 100, None, 0);
        f.condition = 1.0;
        sim.buildings.push(f);
        sim
    }

    #[test]
    fn a_factory_fouls_the_air_and_sours_the_soil() {
        let mut sim = factory_world(false);
        let far = sim.grid.fertility_at(130, 130);
        sim.tick_count = DAY_LENGTH;
        sim.tick_smog();
        assert!(sim.smog_at(101.0, 101.0) > 0.5);
        assert_eq!(sim.smog_at(140.0, 140.0), 0.0);
        assert!(
            sim.grid.fertility_at(101, 101) < 0.7,
            "the soil under the smoke never soured"
        );
        assert_eq!(sim.grid.fertility_at(130, 130), far, "the smoke reached too far");
    }

    #[test]
    fn woodland_drinks_the_smoke_in() {
        let mut bare = factory_world(false);
        let mut wooded = factory_world(true);
        for sim in [&mut bare, &mut wooded] {
            sim.tick_count = DAY_LENGTH;
            sim.tick_smog();
        }
        assert!(wooded.smog_at(101.0, 101.0) < bare.smog_at(101.0, 101.0) * 0.5);
    }

    #[test]
    fn people_in_the_smoke_wear_down() {
        let mut sim = factory_world(false);
        let i = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[i].x = 101.0;
        sim.organisms[i].y = 101.0;
        sim.organisms[i].health = 1.0;
        sim.tick_count = DAY_LENGTH;
        sim.tick_smog();
        assert!(sim.organisms[i].health < 1.0);
        assert_eq!(sim.organisms[i].thought, "the air is thick with smoke");
    }

    #[test]
    fn later_ages_build_clean() {
        assert!(
            emission(BuildingKind::Factory, Era::Industrial)
                > emission(BuildingKind::Factory, Era::Information)
        );
        assert_eq!(emission(BuildingKind::Factory, Era::Solar), 0.0);
        assert_eq!(emission(BuildingKind::House, Era::Industrial), 0.0);
    }
}
