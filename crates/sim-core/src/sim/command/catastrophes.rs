//! The deadliest toys after the bomb: the ground opening into a sinkhole, a black hole swallowing a
//! place, acid rain burning a patch of land, and a plague let loose on one crowd. Each kills for real:
//! the dead are left at no health for the tick to bury, so the death is told by its cause, counted in
//! the history and mourned like any other, and a tribe that loses everyone falls.

use super::{cmd_tile, protected, Simulation, Tile};
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
    /// everything standing over it falls in and dies, buildings over it collapse into it, and the
    /// ground at its rim slumps to bare rock and sand.
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
        strike_buildings(self, x, y, fr, 1.0, 1.0, DamageCause::Quake);
        self.wither_plantings(x, y, r);
        let rim = r + 2;
        for dy in -rim..=rim {
            for dx in -rim..=rim {
                let (nx, ny) = (x + dx, y + dy);
                let d2 = dx * dx + dy * dy;
                if !WorldGrid::in_bounds(nx, ny) || d2 > rim * rim || self.grid.get(nx, ny) == Tile::Void {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                if d2 <= r * r {
                    // The pit: water fills it and stays.
                    self.grid.set(nx, ny, Tile::Water);
                    let depth = 1.0 - (d2 as f32).sqrt() / fr;
                    self.grid.elevation[i] = (self.grid.elevation[i] - 0.2 * depth).max(0.0);
                    self.grid.depth[i] = self.grid.depth[i].max(0.3 + 0.5 * depth);
                } else if !protected(self.grid.get(nx, ny)) && self.grid.get(nx, ny) != Tile::Water {
                    let slump = if self.rng.random::<f32>() < 0.55 {
                        Tile::Rock
                    } else {
                        Tile::Sand
                    };
                    self.grid.set(nx, ny, slump);
                }
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

    /// A black hole opens over the point for a moment: everyone near its heart is pulled in and gone,
    /// those further out are dragged toward it and battered, buildings are torn apart, and the ground
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
            if d <= core {
                o.health = -1.0;
                o.mark_harm(Harm::Disaster, now);
                o.x = x;
                o.y = y;
                taken += 1;
            } else if d <= r * 1.5 {
                // Dragged most of the way in, and thrown about.
                let pull = 0.6 * (1.0 - (d - core) / (r * 1.5 - core));
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
            .map(|o| (o.id.clone(), o.health))
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
