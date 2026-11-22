//! The deadliest toys after the bomb: the ground opening into a sinkhole, a black hole swallowing a
//! place, acid rain burning a patch of land, and a plague let loose on one crowd. Each kills for real:
//! the dead are left at no health for the tick to bury, so the death is told by its cause, counted in
//! the history and mourned like any other, and a tribe that loses everyone falls.

use super::{cmd_tile, Simulation, Tile};
use crate::math::DetMath;
use crate::organism::organism::Harm;
use crate::sim::civ::building_damage::{strike_buildings, DamageCause};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;
use rand::RngExt;

/// The reach each one takes when the command carries none, and the most it may take.
pub(super) const SINKHOLE_REACH: (i32, i32) = (4, 10);
pub(super) const BLACK_HOLE_REACH: (f32, f32) = (6.0, 14.0);
pub(super) const ACID_REACH: (i32, i32) = (6, 20);
pub(super) const PLAGUE_REACH: (f32, f32) = (5.0, 24.0);

pub(super) fn reach_i(radius: i32, (default, max): (i32, i32)) -> i32 {
    if radius <= 0 {
        default
    } else {
        radius.min(max)
    }
}

pub(super) fn reach_f(radius: f32, (default, max): (f32, f32)) -> f32 {
    if radius.is_nan() || radius <= 0.0 {
        default
    } else {
        radius.min(max)
    }
}

impl Simulation {
    /// The ground gives way: a round pit opens and fills with water, a lake from now on. Everyone and
    /// everything standing over it falls in and dies, and the buildings over it fall in with them.
    /// The ground around the lake is left as it was.
    pub(super) fn cmd_sinkhole(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (cmd_tile(x as f32), cmd_tile(y as f32));
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        let r = reach_i(radius, SINKHOLE_REACH).max(2);
        let now = self.tick_count;
        let (fx, fy, fr) = (x as f32, y as f32, r as f32);
        let mut swallowed = 0u32;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - fx).det_hypot(o.y - fy) <= fr {
                o.health = -1.0;
                o.mark_harm(Harm::Disaster, now);
                swallowed += 1;
            }
        }
        for a in self.animals.iter_mut() {
            if a.alive && !a.kind.flies() && (a.x - fx).det_hypot(a.y - fy) <= fr {
                a.alive = false;
            }
        }
        // Buildings over the pit fall in with it, props included, so the lake is left clear.
        let before = self.buildings.len();
        self.buildings.retain(|b| {
            let (nx, ny) = b.closest_footprint_tile(x, y);
            ((nx - x) as f32).det_hypot((ny - y) as f32) > fr
        });
        if self.buildings.len() != before {
            self.building_state_revision = self.building_state_revision.wrapping_add(1);
        }
        self.wither_plantings(x, y, r);
        for dy in -r..=r {
            for dx in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                let d2 = dx * dx + dy * dy;
                if !WorldGrid::in_bounds(nx, ny) || d2 > r * r || self.grid.get(nx, ny) == Tile::Void {
                    continue;
                }
                // The pit fills with water and stays.
                let i = WorldGrid::idx(nx, ny);
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                self.grid.set(nx, ny, Tile::Water);
                let depth = 1.0 - (d2 as f32).sqrt() / fr;
                self.grid.elevation[i] = (self.grid.elevation[i] - 0.2 * depth).max(0.0);
                self.grid.depth[i] = self.grid.depth[i].max(0.3 + 0.5 * depth);
            }
        }
        self.grid.wash_roads(x, y, r);
        self.planting_revision = self.planting_revision.wrapping_add(1);
        let what = match swallowed {
            0 => "opened in the ground".to_string(),
            1 => "opened in the ground and swallowed one person".to_string(),
            n => format!("opened in the ground and swallowed {n} people"),
        };
        push_event(&mut self.events, now, "disaster", "a sinkhole", &what);
        true
    }

    /// A black hole opens over the point for a moment: everyone on the ground it leaves dead is pulled
    /// in and gone, those just past it are dragged toward it and battered, buildings are torn apart, and the ground
    /// where it stood is left a dead ring of ash around a core of strange ore.
    pub(super) fn cmd_black_hole(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let (tx, ty) = (cmd_tile(x), cmd_tile(y));
        if !WorldGrid::in_bounds(tx, ty) {
            return false;
        }
        let r = reach_f(radius, BLACK_HOLE_REACH).max(3.0);
        let (x, y) = (tx as f32, ty as f32);
        let core = r * 0.5;
        let now = self.tick_count;
        let mut taken = 0u32;
        for o in self.organisms.iter_mut() {
            if !o.alive {
                continue;
            }
            let d = (o.x - x).det_hypot(o.y - y);
            // Everyone on the ground it leaves dead is pulled in.
            if d <= r {
                o.health = -1.0;
                o.mark_harm(Harm::Disaster, now);
                o.x = x;
                o.y = y;
                taken += 1;
            } else if d <= r * 1.6 {
                // Dragged most of the way in, and thrown about.
                let pull = 0.6 * (1.0 - (d - r) / (r * 0.6));
                o.x += (x - o.x) * pull;
                o.y += (y - o.y) * pull;
                o.health -= 0.3 + 0.3 * pull;
                o.mark_harm(Harm::Disaster, now);
                o.fear_level = 1.0;
                o.think("was dragged toward the dark", now);
            }
        }
        for a in self.animals.iter_mut() {
            if a.alive && (a.x - x).det_hypot(a.y - y) <= r {
                a.alive = false;
            }
        }
        strike_buildings(self, tx, ty, r, 1.0, 0.6, DamageCause::Meteor);
        let ri = r.ceil() as i32;
        self.wither_plantings(tx, ty, ri);
        for dy in -ri..=ri {
            for dx in -ri..=ri {
                let (nx, ny) = (tx + dx, ty + dy);
                let d2 = (dx * dx + dy * dy) as f32;
                if !WorldGrid::in_bounds(nx, ny) || d2 > r * r {
                    continue;
                }
                let cur = self.grid.get(nx, ny);
                if matches!(cur, Tile::Void | Tile::Water) {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                self.grid.fertility[i] = 0.0;
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                let tile = if d2 <= 2.0 {
                    Tile::Mineral
                } else if d2 <= core * core {
                    Tile::Rock
                } else {
                    Tile::Ash
                };
                self.grid.set(nx, ny, tile);
            }
        }
        self.grid.wash_roads(tx, ty, ri);
        self.planting_revision = self.planting_revision.wrapping_add(1);
        let what = match taken {
            0 => "opened and swallowed the land".to_string(),
            1 => "opened and swallowed one person".to_string(),
            n => format!("opened and swallowed {n} people"),
        };
        push_event(&mut self.events, now, "disaster", "a black hole", &what);
        true
    }

    /// Acid falls over the radius: it burns everyone out in it (the weak and the hurt die of it),
    /// kills some of the animals, scorches the wild food, withers the plantings, sours the soil and
    /// eats at the roofs.
    pub(super) fn cmd_acid_rain(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (cmd_tile(x as f32), cmd_tile(y as f32));
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        let r = reach_i(radius, ACID_REACH).max(2);
        let now = self.tick_count;
        let (fx, fy, fr) = (x as f32, y as f32, r as f32);
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - fx).det_hypot(o.y - fy) <= fr {
                o.health -= 0.45;
                o.mark_harm(Harm::Disaster, now);
                o.fear_level = (o.fear_level + 0.4).min(1.0);
                o.think("the rain burned us", now);
            }
        }
        for i in 0..self.animals.len() {
            let a = &self.animals[i];
            if a.alive
                && !a.kind.aquatic()
                && (a.x - fx).det_hypot(a.y - fy) <= fr
                && self.rng.random::<f32>() < 0.5
            {
                self.animals[i].alive = false;
            }
        }
        for dy in -r..=r {
            for dx in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                self.grid.fertility[i] *= 0.3;
                if self.grid.get(nx, ny) == Tile::Food {
                    self.grid.set(nx, ny, Tile::Scorched);
                }
            }
        }
        self.wither_plantings(x, y, r);
        self.planting_revision = self.planting_revision.wrapping_add(1);
        strike_buildings(self, x, y, fr, 0.3, 0.15, DamageCause::Storm);
        push_event(
            &mut self.events,
            now,
            "danger",
            "acid rain",
            "burned the land and everyone out in it",
        );
        true
    }

    /// Plague let loose on a crowd: up to `count` of the people nearest the point, within the radius,
    /// catch it. Fails when nobody is in reach.
    pub(super) fn cmd_outbreak_at(&mut self, x: f32, y: f32, radius: f32, count: u32) -> bool {
        let r = reach_f(radius, PLAGUE_REACH);
        let n = count.clamp(1, 50) as usize;
        let mut near: Vec<(usize, f32)> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= r)
            .collect();
        near.sort_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
        let now = self.tick_count;
        let mut hit = 0;
        for &(i, _) in near.iter().take(n) {
            let o = &mut self.organisms[i];
            o.infection = o.infection.max(0.85);
            if !o.diseases.iter().any(|(d, _)| d == "plague") {
                o.diseases.push(("plague".to_string(), now));
            }
            hit += 1;
        }
        if hit > 0 {
            push_event(
                &mut self.events,
                now,
                "danger",
                "a plague",
                &format!("broke out among {hit} people"),
            );
        }
        hit > 0
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;
    use crate::world::tiles::Tile;

    /// Everyone alive stands at (x, y) at full health.
    fn crowd_at(sim: &mut Simulation, x: f32, y: f32) {
        for o in sim.organisms.iter_mut().filter(|o| o.alive) {
            o.x = x;
            o.y = y;
            o.health = 1.0;
            o.infection = 0.0;
            o.diseases.clear();
        }
    }

    fn alive(sim: &Simulation) -> usize {
        sim.organisms.iter().filter(|o| o.alive).count()
    }

    #[test]
    fn a_sinkhole_swallows_what_stood_there_and_leaves_the_ground_around_it_clean() {
        use crate::sim::buildings::{Building, BuildingKind};
        let mut sim = Simulation::new(5);
        let (x, y, r) = (150i32, 150i32, 4i32);
        let rim = r + 2;
        for dy in -rim..=rim {
            for dx in -rim..=rim {
                let d2 = dx * dx + dy * dy;
                if d2 > r * r && d2 <= rim * rim {
                    sim.grid.set(x + dx, y + dy, Tile::Grass);
                }
            }
        }
        // One tile past the ring around the hole: the sinkhole does not reach it.
        sim.grid.set(x + rim + 1, y, Tile::Food);
        let standing = |id, bx, by, decorative| {
            let mut building = Building::new(id, BuildingKind::Hut, bx, by, Some("tribe".into()), 0);
            building.condition = 1.0;
            building.decorative = decorative;
            building
        };
        sim.buildings.push(standing(9_001, x, y, false));
        sim.buildings.push(standing(9_002, x + 1, y, true));
        let mut site = Building::new(9_003, BuildingKind::Hut, x - 1, y, Some("tribe".into()), 0);
        site.condition = 0.4;
        sim.buildings.push(site);
        sim.buildings.push(standing(9_004, x + 20, y, false));

        assert!(sim.apply_command_json(r#"{"cmd":"sinkhole","x":150,"y":150,"radius":4}"#));
        assert_eq!(sim.grid.get(x, y), Tile::Water, "the pit is a lake");
        for dy in -rim..=rim {
            for dx in -rim..=rim {
                let d2 = dx * dx + dy * dy;
                if d2 > r * r && d2 <= rim * rim {
                    assert_eq!(
                        sim.grid.get(x + dx, y + dy),
                        Tile::Grass,
                        "the ring around the lake stays clean at ({}, {})",
                        x + dx,
                        y + dy
                    );
                }
            }
        }
        assert_eq!(
            sim.grid.get(x + rim + 1, y),
            Tile::Food,
            "ground past the hole is left alone"
        );
        let left: Vec<u32> = sim
            .buildings
            .iter()
            .map(|b| b.id)
            .filter(|id| *id >= 9_001)
            .collect();
        assert_eq!(
            left,
            vec![9_004],
            "what stood over the hole is gone, not left as rubble"
        );
        let spared = sim
            .buildings
            .iter()
            .find(|b| b.id == 9_004)
            .expect("the far house");
        assert!(!spared.is_ruined(), "a building outside the hole is not wrecked");
    }

    #[test]
    fn a_sinkhole_swallows_the_crowd_and_leaves_a_lake() {
        let mut sim = Simulation::new(5);
        crowd_at(&mut sim, 150.0, 150.0);
        let n = alive(&sim);
        let outcome = sim.apply_command_json_reported(r#"{"cmd":"sinkhole","x":150,"y":150,"radius":4}"#);
        assert!(outcome.applied);
        assert_eq!(outcome.code, "disaster_killed");
        assert_eq!(outcome.count as usize, n);
        assert_eq!(sim.grid.get(150, 150), Tile::Water);
        let deaths = sim.history.deaths_disaster;
        let swallowed = sim.organisms.len();
        let was_alive: Vec<bool> = sim.organisms.iter().map(|o| o.alive).collect();
        for _ in 0..30 {
            sim.tick();
        }
        let left: Vec<_> = sim.organisms[..swallowed]
            .iter()
            .zip(&was_alive)
            .filter(|(o, &was)| was && o.alive)
            .map(|(o, _)| o)
            .map(|o| (o.id, o.health))
            .collect();
        assert!(left.is_empty(), "the swallowed die: {left:?}");
        assert!(sim.history.deaths_disaster >= deaths + n as u64);
    }

    #[test]
    fn a_black_hole_takes_those_at_its_heart_and_drags_the_rest() {
        let mut sim = Simulation::new(5);
        crowd_at(&mut sim, 150.0, 150.0);
        sim.organisms[1].x = 158.0;
        let outcome = sim.apply_command_json_reported(r#"{"cmd":"black_hole","x":150,"y":150,"radius":6}"#);
        assert!(outcome.applied);
        assert!(sim.organisms[0].health < 0.0);
        assert!(sim.organisms[1].x < 158.0, "the one further out is dragged in");
        assert_eq!(sim.grid.get(150, 150), Tile::Mineral);
    }

    /// One person alive, at (x, y), well; returns their index.
    fn one_at(sim: &mut Simulation, x: f32, y: f32) -> usize {
        let i = sim.organisms.iter().position(|o| o.alive).expect("someone lives");
        for (k, o) in sim.organisms.iter_mut().enumerate() {
            if k != i {
                o.alive = false;
            }
        }
        sim.organisms[i].x = x;
        sim.organisms[i].y = y;
        sim.organisms[i].health = 1.0;
        i
    }

    #[test]
    fn the_big_killers_kill_whoever_stands_on_the_ground_they_wreck() {
        // The volcano's ash and lava apron reaches past its cone: whoever stands on it is buried.
        let mut sim = Simulation::new(5);
        let i = one_at(&mut sim, 156.5, 150.0);
        assert!(sim.apply_command_json(r#"{"cmd":"volcano","x":150,"y":150,"radius":6}"#));
        assert!(sim.organisms[i].health < 0.0, "buried on the apron");
        // A meteor kills across its ash, and burns those in the ring of fire past it.
        let mut sim = Simulation::new(5);
        let i = one_at(&mut sim, 153.9, 150.0);
        assert!(sim.apply_command_json(r#"{"cmd":"meteor","x":150,"y":150,"radius":4}"#));
        assert!(sim.organisms[i].health < 0.0, "killed on the crater's ash");
        let mut sim = Simulation::new(5);
        let i = one_at(&mut sim, 155.0, 150.0);
        assert!(sim.apply_command_json(r#"{"cmd":"meteor","x":150,"y":150,"radius":4}"#));
        assert!(
            (sim.organisms[i].health - 0.7).abs() < 1e-5,
            "burned in the ring of fire"
        );
        // A black hole takes everyone on the dead ground it leaves.
        let mut sim = Simulation::new(5);
        let i = one_at(&mut sim, 155.5, 150.0);
        assert!(sim.apply_command_json(r#"{"cmd":"black_hole","x":150,"y":150,"radius":6}"#));
        assert!(sim.organisms[i].health < 0.0);
        assert_eq!(
            sim.grid.get(155, 150),
            Tile::Ash,
            "where they stood is dead ground"
        );
    }

    #[test]
    fn acid_rain_kills_the_weak_and_burns_the_rest() {
        let mut sim = Simulation::new(5);
        crowd_at(&mut sim, 150.0, 150.0);
        sim.organisms[0].health = 0.3;
        assert!(sim.apply_command_json(r#"{"cmd":"acid_rain","x":150,"y":150,"radius":6}"#));
        assert!(sim.organisms[0].health <= 0.0, "the weak die of it");
        assert!(
            (sim.organisms[1].health - 0.55).abs() < 1e-5,
            "the rest are burned"
        );
    }

    #[test]
    fn a_plague_let_loose_on_a_crowd_sickens_the_nearest() {
        let mut sim = Simulation::new(5);
        crowd_at(&mut sim, 40.0, 40.0);
        sim.organisms[0].x = 150.0;
        sim.organisms[0].y = 150.0;
        sim.organisms[1].x = 151.0;
        sim.organisms[1].y = 150.0;
        assert!(sim.apply_command_json(r#"{"cmd":"outbreak","x":150,"y":150,"radius":5,"count":12}"#));
        assert!(sim.organisms[0].infection >= 0.85);
        assert!(sim.organisms[1].infection >= 0.85);
        assert_eq!(sim.organisms[2].infection, 0.0, "the crowd far away is spared");
        assert!(!sim.apply_command_json(r#"{"cmd":"outbreak","x":300,"y":300,"radius":5,"count":12}"#));
    }
}
