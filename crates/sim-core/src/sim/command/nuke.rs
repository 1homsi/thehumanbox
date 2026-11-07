use super::{clamp_cmd_coord, protected, Simulation, Tile};
use crate::math::DetMath;
use crate::organism::organism::Harm;
use crate::sim::civ::building_damage::{strike_buildings, DamageCause};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Biome;
use rand::RngExt;

/// Radius of the crater the bomb digs, in tiles: bare rock, scarred for good.
pub(super) const CRATER_RADIUS: i32 = 4;
/// Radius of the blast, in tiles: everyone and everything inside dies, and every building falls.
pub(super) const BLAST_RADIUS: i32 = 10;
/// How far past the blast the firestorm reaches: what burns there catches.
const FIRE_RING: i32 = 4;
/// Radius the fallout settles over, in tiles (see `world_events::fallout`).
pub(super) const FALLOUT_RADIUS: i32 = 24;

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
        let mut killed = 0u32;
        let mut tribes: Vec<String> = Vec::new();
        for o in self.organisms.iter_mut() {
            if !o.alive {
                continue;
            }
            let d = (o.x - fx).det_hypot(o.y - fy);
            if d <= blast {
                o.health = -1.0;
                o.mark_harm(Harm::Disaster, now);
                killed += 1;
                if !tribes.contains(&o.lineage_id) {
                    tribes.push(o.lineage_id.clone());
                }
            } else if d <= blast * 2.0 {
                // The shockwave and the heat reach further: burns, and terror.
                o.health -= 0.35 * (1.0 - (d - blast) / blast);
                o.mark_harm(Harm::Fire, now);
                o.fear_level = 1.0;
                o.think("saw the sky turn white", now);
            }
        }
        for a in self.animals.iter_mut() {
            if a.alive && (a.x - fx).det_hypot(a.y - fy) <= blast {
                a.alive = false;
            }
        }
        // Every building in the blast falls; the shockwave cracks those further out.
        strike_buildings(self, x, y, blast, 1.0, 1.0, DamageCause::Meteor);
        strike_buildings(self, x, y, blast * 2.0, 0.5, 0.1, DamageCause::Fire);
        self.wither_plantings(x, y, BLAST_RADIUS + FIRE_RING);
        let outer = BLAST_RADIUS + FIRE_RING;
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
                } else if self.grid.get(nx, ny).flammable() && self.rng.random::<f32>() < 0.6 {
                    // The firestorm: the forest and fields past the blast catch.
                    self.grid.set(nx, ny, Tile::Fire);
                    *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                    self.physics.register_fire(nx, ny);
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
    use super::{BLAST_RADIUS, FALLOUT_RADIUS};
    use crate::sim::simulation::Simulation;
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    fn all_people_at(sim: &mut Simulation, x: f32, y: f32) {
        for o in sim.organisms.iter_mut() {
            o.alive = true;
            o.x = x;
            o.y = y;
            o.infection = 0.0;
            o.health = 1.0;
        }
    }

    #[test]
    fn a_bomb_falls_in_any_age() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 120.0, 120.0);
        sim.lineage_eras.clear();
        assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
    }

    #[test]
    fn a_bomb_kills_everyone_in_the_blast_and_leaves_fallout_beyond_it() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 120.0, 120.0);
        // One person stands past the blast, inside the fallout.
        let out = 120.0 + BLAST_RADIUS as f32 * 2.0 + 2.0;
        assert!(out - 120.0 < FALLOUT_RADIUS as f32);
        sim.organisms[1].x = out;
        let outcome = sim.apply_command_json_reported(r#"{"cmd":"nuke","x":120,"y":120}"#);
        assert!(outcome.applied);
        assert_eq!(outcome.code, "disaster_killed");
        assert!(
            sim.organisms[0].health < 0.0,
            "the blast takes the person at the point"
        );
        assert_eq!(
            sim.organisms[1].health, 1.0,
            "the person past the blast is not burnt"
        );
        assert_eq!(sim.fallout.len(), 1, "fallout settles");
        // Ticking the world on: the dead are recorded, and the fallout sickens the survivor.
        let deaths_before = sim.history.deaths_disaster;
        for _ in 0..crate::sim::world_events::FALLOUT_STEP * 3 {
            sim.tick();
        }
        assert!(
            sim.history.deaths_disaster > deaths_before,
            "the blast's dead are recorded"
        );
        assert!(!sim.organisms[0].alive);
    }

    #[test]
    fn a_bomb_scars_the_ground_for_good() {
        let mut sim = Simulation::new(6);
        all_people_at(&mut sim, 30.0, 30.0);
        assert!(sim.apply_command_json(r#"{"cmd":"nuke","x":120,"y":120}"#));
        assert_eq!(sim.grid.get(120, 120), Tile::Rock, "the crater is bare rock");
        let i = WorldGrid::idx(120 + BLAST_RADIUS - 1, 120);
        assert_eq!(sim.grid.fertility[i], 0.0, "nothing grows in the blast");
        // A loaded world keeps the crater and the fallout.
        let loaded = Simulation::from_save(6, sim.to_save_state());
        assert_eq!(loaded.grid.get(120, 120), Tile::Rock);
        assert_eq!(loaded.fallout, sim.fallout);
    }
}
