//! Fallout: the poisoned ground a bomb leaves behind. For two seasons after the blast everyone who
//! stands in it sickens (health drains and they fear the place), plantings in it wither and the soil
//! stays barren. It weakens as it settles, so the land is safe again once it has run its course.

use crate::math::DetMath;
use crate::organism::organism::Harm;
use crate::sim::simulation::Simulation;
use crate::world::grid::WorldGrid;
use serde::{Deserialize, Serialize};

/// How long fallout lingers: two seasons.
pub const FALLOUT_TICKS: u64 = 6_000;
/// The fallout acts every this many ticks.
pub const FALLOUT_STEP: u64 = 30;
/// Health a person loses each step at the heart of fresh fallout.
const FALLOUT_HARM: f32 = 0.025;
/// Most fallout zones that may stand at once; a new bomb past this replaces the oldest.
pub const MAX_FALLOUT: usize = 16;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Fallout {
    pub x: f32,
    pub y: f32,
    pub radius: f32,
    pub cast: u64,
    pub until: u64,
}

impl Fallout {
    /// How strong the fallout is at `tick`: 1 when fresh, falling to 0 as it settles.
    pub fn strength(&self, tick: u64) -> f32 {
        if tick >= self.until {
            return 0.0;
        }
        let span = self.until.saturating_sub(self.cast).max(1) as f32;
        (self.until - tick) as f32 / span
    }

    pub fn covers(&self, x: f32, y: f32) -> bool {
        (x - self.x).det_hypot(y - self.y) <= self.radius
    }
}

impl Simulation {
    /// Lays fallout over a disc of the land.
    pub(crate) fn lay_fallout(&mut self, x: f32, y: f32, radius: f32) {
        if self.fallout.len() >= MAX_FALLOUT {
            self.fallout.remove(0);
        }
        let now = self.tick_count;
        self.fallout.push(Fallout {
            x,
            y,
            radius,
            cast: now,
            until: now + FALLOUT_TICKS,
        });
    }

    /// The fallout's slow harm: people in it sicken, plantings in it wither, and spent zones lift.
    pub(crate) fn tick_fallout(&mut self) {
        if self.fallout.is_empty() {
            return;
        }
        let now = self.tick_count;
        self.fallout.retain(|f| now < f.until);
        if !now.is_multiple_of(FALLOUT_STEP) {
            return;
        }
        let zones = self.fallout.clone();
        for zone in &zones {
            let strength = zone.strength(now);
            if strength <= 0.0 {
                continue;
            }
            for o in self.organisms.iter_mut() {
                if !o.alive {
                    continue;
                }
                let d = (o.x - zone.x).det_hypot(o.y - zone.y);
                if d > zone.radius {
                    continue;
                }
                // Worst at the heart of the zone, milder at its rim.
                let near = 1.0 - 0.6 * (d / zone.radius.max(1.0));
                o.health -= FALLOUT_HARM * strength * near;
                o.energy = (o.energy - 0.01 * strength).max(0.02);
                o.fear_level = (o.fear_level + 0.05).min(1.0);
                o.mark_harm(Harm::Sickness, now);
                if now.is_multiple_of(FALLOUT_STEP * 20) {
                    o.think("sick from the poisoned ground", now);
                }
            }
            // The soil stays barren, and what is planted in it dies.
            let r = zone.radius.ceil() as i32;
            let (cx, cy) = (zone.x.round() as i32, zone.y.round() as i32);
            for dy in -r..=r {
                for dx in -r..=r {
                    let (nx, ny) = (cx + dx, cy + dy);
                    if !WorldGrid::in_bounds(nx, ny)
                        || ((dx * dx + dy * dy) as f32) > zone.radius * zone.radius
                    {
                        continue;
                    }
                    let i = WorldGrid::idx(nx, ny);
                    self.grid.fertility[i] = self.grid.fertility[i].min(0.1 + 0.6 * (1.0 - strength));
                }
            }
            if self.wither_plantings(cx, cy, r) > 0 {
                self.planting_revision = self.planting_revision.wrapping_add(1);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn one_person_at(sim: &mut Simulation, x: f32, y: f32) -> usize {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        let o = &mut sim.organisms[0];
        o.alive = true;
        o.x = x;
        o.y = y;
        o.health = 1.0;
        0
    }

    #[test]
    fn fallout_sickens_people_inside_it_and_spares_those_outside() {
        let mut sim = Simulation::new(3);
        let i = one_person_at(&mut sim, 100.0, 100.0);
        sim.organisms[1].alive = true;
        sim.organisms[1].x = 140.0;
        sim.organisms[1].y = 100.0;
        sim.organisms[1].health = 1.0;
        sim.tick_count = FALLOUT_STEP * 10;
        sim.lay_fallout(100.0, 100.0, 10.0);
        sim.tick_fallout();
        assert!(sim.organisms[i].health < 1.0, "the person in the fallout sickens");
        assert_eq!(sim.organisms[1].health, 1.0, "the person outside it does not");
    }

    #[test]
    fn fallout_lifts_once_its_time_is_up() {
        let mut sim = Simulation::new(3);
        sim.tick_count = 0;
        sim.lay_fallout(100.0, 100.0, 10.0);
        assert_eq!(sim.fallout[0].strength(0), 1.0);
        sim.tick_count = FALLOUT_TICKS;
        sim.tick_fallout();
        assert!(sim.fallout.is_empty());
    }

    #[test]
    fn fallout_is_saved_and_loaded() {
        let mut sim = Simulation::new(3);
        sim.tick_count = 90;
        sim.lay_fallout(12.0, 34.0, 9.0);
        let loaded = Simulation::from_save(3, sim.to_save_state());
        assert_eq!(loaded.fallout, sim.fallout);
    }
}
