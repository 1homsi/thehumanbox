use super::{clamp_cmd_coord, protected, Simulation, Tile};
use crate::math::DetMath;
use crate::organism::organism::Harm;
use crate::sim::civ::building_damage::{strike_buildings, DamageCause};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Biome;
use rand::RngExt;

/// Radius of the crater the bomb digs, in tiles: bare rock, scarred for good.
pub(super) const CRATER_RADIUS: i32 = 5;
/// Radius of the blast, in tiles: everyone and everything inside dies, every building falls and the
/// ground is scorched barren. A whole village fits inside it.
pub(super) const BLAST_RADIUS: i32 = 16;
/// Radius of the firestorm, in tiles: past the blast, everything that burns catches, most people
/// there die of their burns and the rest are badly burned, and buildings are wrecked.
pub(super) const FIRESTORM_RADIUS: i32 = 22;
/// The share of the people in the firestorm who die of it.
const FIRESTORM_DEATHS: f32 = 0.75;
/// Radius the fallout settles over, in tiles (see `world_events::fallout`).
pub(super) const FALLOUT_RADIUS: i32 = 28;

impl Simulation {
    /// A bomb falls on the point. Everyone inside the blast dies and every building there falls; the
    /// crater at its heart is scarred into bare rock for good, the land around it is burnt to ash and
    /// the forest past it catches fire. Fallout then poisons a wider ring for two seasons, sickening
    /// whoever stays in it. Fails only off the map.
    pub(super) fn cmd_nuke(&mut self, x: i32, y: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        let now = self.tick_count;
        let (fx, fy) = (x as f32, y as f32);
        let blast = BLAST_RADIUS as f32;
        let storm = FIRESTORM_RADIUS as f32;
        let mut killed = 0u32;
        let mut tribes: Vec<String> = Vec::new();
        for i in 0..self.organisms.len() {
            if !self.organisms[i].alive {
                continue;
            }
            let d = (self.organisms[i].x - fx).det_hypot(self.organisms[i].y - fy);
            if d > storm * 1.3 {
                continue;
            }
            // In the firestorm most die of their burns; who lives is the world's own dice.
            let dies = d <= blast || (d <= storm && self.rng.random::<f32>() < FIRESTORM_DEATHS);
            let o = &mut self.organisms[i];
            if dies {
                o.health = -1.0;
                o.mark_harm(if d <= blast { Harm::Disaster } else { Harm::Fire }, now);
                killed += 1;
                if !tribes.contains(&o.lineage_id) {
                    tribes.push(o.lineage_id.clone());
                }
            } else {
                // Survivors of the firestorm are badly burned; those just past it are scorched and terrified.
                o.health -= if d <= storm { 0.6 } else { 0.25 };
                o.mark_harm(Harm::Fire, now);
                o.fear_level = 1.0;
                o.think("saw the sky turn white", now);
            }
        }
        for i in 0..self.animals.len() {
            let a = &self.animals[i];
            if !a.alive {
                continue;
            }
            let d = (a.x - fx).det_hypot(a.y - fy);
            if d <= blast || (d <= storm && self.rng.random::<f32>() < FIRESTORM_DEATHS) {
                self.animals[i].alive = false;
            }
        }
        // Every building in the blast falls; those in the firestorm are wrecked.
        strike_buildings(self, x, y, blast, 1.0, 1.0, DamageCause::Meteor);
        strike_buildings(self, x, y, storm, 0.9, 0.7, DamageCause::Fire);
        self.wither_plantings(x, y, FIRESTORM_RADIUS);
        let outer = FIRESTORM_RADIUS;
        for dy in -outer..=outer {
            for dx in -outer..=outer {
                let (nx, ny) = (x + dx, y + dy);
                let d2 = dx * dx + dy * dy;
                if !WorldGrid::in_bounds(nx, ny) || d2 > outer * outer {
                    continue;
                }
                let cur = self.grid.get(nx, ny);
                if cur == Tile::Void {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                if d2 <= CRATER_RADIUS * CRATER_RADIUS {
                    // The crater: bare rock, sunk into the ground, scarred for good.
                    self.grid.set(nx, ny, Tile::Rock);
                    self.grid.biome[i] = Biome::Volcanic as u8;
                    self.grid.fertility[i] = 0.0;
                    let depth = 1.0 - (d2 as f32).sqrt() / CRATER_RADIUS as f32;
                    self.grid.elevation[i] = (self.grid.elevation[i] - 0.25 * depth).max(0.05);
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                } else if d2 <= BLAST_RADIUS * BLAST_RADIUS {
                    // The blast: everything standing is flattened and burnt to ash; water boils off the shallows.
                    if cur != Tile::Water && cur != Tile::Rock && cur != Tile::Mineral {
                        self.grid
                            .set(nx, ny, if protected(cur) { Tile::Ash } else { Tile::Scorched });
                    }
                    self.grid.biome[i] = Biome::Badlands as u8;
                    self.grid.fertility[i] = 0.0;
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                } else {
                    // The firestorm: everything that burns is alight, and what does not is charred.
                    if cur.flammable() || protected(cur) {
                        self.grid.set(nx, ny, Tile::Fire);
                        *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                        self.physics.register_fire(nx, ny);
                    } else if matches!(cur, Tile::Sand | Tile::Snow | Tile::Flooded) {
                        self.grid.set(nx, ny, Tile::Ash);
                    }
                    self.grid.fertility[i] *= 0.3;
                }
            }
        }
        self.grid.wash_roads(x, y, BLAST_RADIUS);
        self.planting_revision = self.planting_revision.wrapping_add(1);
        self.lay_fallout(fx, fy, FALLOUT_RADIUS as f32);
        let what = match killed {
            0 => format!("a bomb fell at ({x}, {y}); fallout settles on the land around it"),
            1 => format!("a bomb fell at ({x}, {y}) and killed one person; fallout settles around it"),
            n => format!("a bomb fell at ({x}, {y}) and killed {n} people; fallout settles around it"),
        };
        push_event(&mut self.events, now, "disaster", "the bomb", &what);
        for lineage in tribes {
            let name = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            push_event(
                &mut self.events,
                now,
                "danger",
                &name,
                "lost their people to the bomb",
            );
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::{BLAST_RADIUS, FALLOUT_RADIUS, FIRESTORM_RADIUS};
    use crate::sim::simulation::Simulation;
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    /// Everyone alive stands at (x, y), well.
    fn all_people_at(sim: &mut Simulation, x: f32, y: f32) {
        for o in sim.organisms.iter_mut().filter(|o| o.alive) {
            o.x = x;
            o.y = y;
            o.infection = 0.0;
            o.health = 1.0;
        }
    }

    fn living(sim: &Simulation) -> Vec<usize> {
        (0..sim.organisms.len())
            .filter(|&i| sim.organisms[i].alive)
            .collect()
    }

    #[test]
    fn a_bomb_falls_in_any_age() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 120.0, 120.0);
        sim.lineage_eras.clear();
        assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
    }

    #[test]
    fn a_bomb_wipes_out_a_village_across_the_whole_blast() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 30.0, 30.0);
        let people = living(&sim);
        // A village spread right out to the edge of the blast.
        for (k, &i) in people.iter().enumerate() {
            let a = k as f32 * 0.7;
            let d = (k % 16) as f32;
            sim.organisms[i].x = 120.0 + a.cos() * d;
            sim.organisms[i].y = 120.0 + a.sin() * d;
        }
        let outcome = sim.apply_command_json_reported(r#"{"cmd":"nuke","x":120,"y":120}"#);
        assert_eq!(outcome.code, "disaster_killed");
        assert_eq!(outcome.count as usize, people.len(), "everyone in the blast dies");
        assert!(people.iter().all(|&i| sim.organisms[i].health < 0.0));
        // The dead are buried by the tick and counted in the history.
        let deaths_before = sim.history.deaths_disaster;
        sim.tick();
        assert!(people.iter().all(|&i| !sim.organisms[i].alive));
        assert!(sim.history.deaths_disaster >= deaths_before + people.len() as u64);
    }

    #[test]
    fn most_in_the_firestorm_die_and_the_same_world_always_loses_the_same_people() {
        let run = || {
            let mut sim = Simulation::new(6);
            let people = living(&sim);
            for &i in &people {
                sim.organisms[i].x = 120.0 + (BLAST_RADIUS + 3) as f32;
                sim.organisms[i].y = 120.0;
                sim.organisms[i].health = 1.0;
            }
            assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
            let dead: Vec<usize> = people
                .iter()
                .copied()
                .filter(|&i| sim.organisms[i].health < 0.0)
                .collect();
            let burned = people
                .iter()
                .filter(|&&i| (sim.organisms[i].health - 0.4).abs() < 1e-5)
                .count();
            (people.len(), dead, burned)
        };
        let (n, dead, burned) = run();
        assert!(dead.len() * 2 > n, "most die: {} of {n}", dead.len());
        assert!(dead.len() < n, "a few survive");
        assert_eq!(dead.len() + burned, n, "the survivors are badly burned");
        assert_eq!(run().1, dead, "deterministic");
    }

    #[test]
    fn past_the_firestorm_people_live_under_the_fallout() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 30.0, 30.0);
        let i = living(&sim)[0];
        let out = 120.0 + FIRESTORM_RADIUS as f32 + 3.0;
        assert!(out - 120.0 < FALLOUT_RADIUS as f32);
        sim.organisms[i].x = out;
        sim.organisms[i].y = 120.0;
        assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
        assert!(
            (sim.organisms[i].health - 0.75).abs() < 1e-5,
            "scorched, not killed"
        );
        assert_eq!(sim.fallout.len(), 1, "fallout settles");
        assert!(sim.fallout[0].covers(out, 120.0));
    }

    #[test]
    fn the_ground_shows_exactly_what_the_bomb_destroyed() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 30.0, 30.0);
        for dx in -30..=30 {
            sim.grid.set(120 + dx, 120, Tile::Grass);
        }
        assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
        assert_eq!(sim.grid.get(120, 120), Tile::Rock, "the crater is bare rock");
        assert_eq!(
            sim.grid.get(120 + BLAST_RADIUS, 120),
            Tile::Scorched,
            "the blast's edge is scorched"
        );
        let i = WorldGrid::idx(120 + BLAST_RADIUS - 1, 120);
        assert_eq!(sim.grid.fertility[i], 0.0, "nothing grows in the blast");
        assert_eq!(
            sim.grid.get(120 + BLAST_RADIUS + 1, 120),
            Tile::Fire,
            "the firestorm burns"
        );
        assert_eq!(sim.grid.get(120 + FIRESTORM_RADIUS, 120), Tile::Fire);
        assert_eq!(
            sim.grid.get(120 + FIRESTORM_RADIUS + 1, 120),
            Tile::Grass,
            "and stops at its edge"
        );
        // A loaded world keeps the crater and the fallout.
        let loaded = Simulation::from_save(6, sim.to_save_state());
        assert_eq!(loaded.grid.get(120, 120), Tile::Rock);
        assert_eq!(loaded.fallout, sim.fallout);
    }
}
