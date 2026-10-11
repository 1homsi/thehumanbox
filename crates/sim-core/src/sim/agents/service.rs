//! The weekly service. Every seventh day, at midday, a tribe that has a temple
//! gathers there. Its priest walks to the temple and leads the service, and
//! half of its fit adults (the ones whose index is even) walk over to join in.
//! Those who set out for the service are thought to be "going to the service",
//! and the chronicle records when a priest leads one. A tribe with no temple
//! or shrine near home keeps its day as it always was.
//!
//! Each person looks once a minute, at their own minute of the hour, so the
//! walks set out in a trickle, as in `working_day`.

use super::age_stage::AgeStage;
use super::family_outings::{chebyshev, spread};
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind as BK;

/// Every seventh day is the day of service.
const WEEK_DAYS: u64 = 7;
const SERVICE_DAY: u64 = 6;
/// The service runs from this fraction of the day to the second.
const SERVICE_HOURS: (f32, f32) = (0.45, 0.55);
/// A temple must be this close to a tribe's home (in tiles) for the tribe to worship there.
const TEMPLE_REACH: i32 = 24;
/// People this close to the temple are in the congregation.
const CONGREGATION: i32 = 6;

/// Buildings where a tribe holds its weekly service.
fn is_temple(kind: BK) -> bool {
    matches!(
        kind,
        BK::Temple | BK::Cathedral | BK::Shrine | BK::Mosque | BK::Synagogue | BK::Pagoda
    )
}

impl Simulation {
    /// The centre of the nearest temple or shrine that `lineage` built, within `TEMPLE_REACH` of `home`. Shrines are
    /// decorative in this world (grave shrines, props), so this takes any finished building of the tribe, not only
    /// the operational ones: a tribe with no temple worships at its own shrine.
    fn temple_for(&self, lineage: &str, home: (i32, i32)) -> Option<(i32, i32)> {
        self.buildings
            .iter()
            .filter(|b| b.owner_lineage.as_deref() == Some(lineage) && b.is_complete() && !b.is_ruined())
            .filter(|b| b.damage < 0.5 && is_temple(b.kind))
            .map(|b| {
                let (fw, fh) = b.kind.footprint();
                (b.x + fw as i32 / 2, b.y + fh as i32 / 2)
            })
            .filter(|&p| chebyshev(p, home) <= TEMPLE_REACH)
            .min_by_key(|&p| (chebyshev(p, home), p))
    }

    /// On the day of service, at midday: the priest leads, and half the fit adults walk to the temple to join.
    pub(crate) fn assign_service(&mut self, idx: usize) {
        let tick = self.tick_count;
        if tick % 60 != idx as u64 % 60 || (tick / DAY_LENGTH) % WEEK_DAYS != SERVICE_DAY {
            return;
        }
        let phase = (tick % DAY_LENGTH) as f32 / DAY_LENGTH as f32;
        if !(SERVICE_HOURS.0..SERVICE_HOURS.1).contains(&phase) {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < 0.35
                || o.hydration < 0.35
                || o.fear_level > 0.5
                || matches!(o.age_stage(), AgeStage::Infant | AgeStage::Child)
            {
                return;
            }
        }
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let home = (
            self.organisms[idx].home_x as i32,
            self.organisms[idx].home_y as i32,
        );
        let lineage = self.organisms[idx].lineage_id.clone();
        let priest = self.organisms[idx].specialty.as_deref() == Some("priest");
        if !priest && !idx.is_multiple_of(2) {
            return;
        }
        let Some(temple) = self.temple_for(&lineage, home) else {
            return;
        };
        if chebyshev(here, temple) <= CONGREGATION {
            if !priest {
                self.organisms[idx].think("at the service", tick);
            }
            return;
        }
        let target = (
            temple.0 + spread(idx, tick, 9, 2),
            temple.1 + spread(idx, tick, 10, 2),
        );
        let thought = if priest {
            "leading the service"
        } else {
            "going to the service"
        };
        if self.set_outing_target(idx, target) {
            self.organisms[idx].think(thought, tick);
            if priest {
                let name = self
                    .lineage_names
                    .get(&lineage)
                    .cloned()
                    .unwrap_or_else(|| "A tribe".to_string());
                crate::sim::world_events::push_event(
                    &mut self.events,
                    tick,
                    "service",
                    &name,
                    "the priest leads the weekly service at the temple",
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::tech::buildings::{Building, BuildingKind};
    use crate::world::tiles::Tile;

    /// Four adults of one tribe on open grass at (100, 100), a temple at (110, 100), person 0 a priest.
    fn temple_town() -> Simulation {
        let mut sim = Simulation::new(93);
        sim.organisms.truncate(4);
        for x in 85..=125 {
            for y in 85..=115 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.lineage_homes.insert("clan".into(), [100, 100, 0]);
        for o in sim.organisms.iter_mut() {
            o.alive = true;
            o.lineage_id = "clan".into();
            o.energy = 0.9;
            o.hydration = 0.9;
            o.health = 0.9;
            o.age = 2000;
            o.max_age = 4000;
            o.journey = None;
            o.wander_target = None;
            o.home_x = 100.0;
            o.home_y = 100.0;
            o.x = 100.0;
            o.y = 100.0;
            o.specialty = None;
        }
        sim.organisms[0].specialty = Some("priest".into());
        let mut temple = Building::new(901, BuildingKind::Temple, 110, 100, Some("clan".into()), 0);
        temple.condition = 1.0;
        sim.buildings.push(temple);
        sim
    }

    /// A midday tick on the day of service whose minute matches person `idx`.
    fn service_tick(idx: usize) -> u64 {
        let base = 6 * DAY_LENGTH + (DAY_LENGTH as f32 * SERVICE_HOURS.0) as u64;
        base + (idx as u64 + 60 - base % 60) % 60
    }

    #[test]
    fn the_priest_walks_to_the_temple_on_the_day_of_service() {
        let mut sim = temple_town();
        sim.tick_count = service_tick(0);
        sim.assign_service(0);
        let target = sim.organisms[0].wander_target.expect("the priest sets out");
        assert!(chebyshev(target, (110, 100)) <= 3, "target {target:?}");
    }

    #[test]
    fn only_even_adults_join_the_service_and_others_keep_their_day() {
        let mut sim = temple_town();
        sim.tick_count = service_tick(2);
        sim.assign_service(2);
        assert!(sim.organisms[2].wander_target.is_some(), "an even adult joins");
        sim.tick_count = service_tick(1);
        sim.assign_service(1);
        assert!(sim.organisms[1].wander_target.is_none(), "an odd adult stays");
    }

    #[test]
    fn no_service_on_other_days() {
        let mut sim = temple_town();
        // The sixth day (index 5) is an ordinary day: the same midday hour sets nobody out.
        let other = 5 * DAY_LENGTH + (DAY_LENGTH as f32 * SERVICE_HOURS.0) as u64;
        sim.tick_count = other + (60 - other % 60) % 60;
        sim.assign_service(0);
        assert!(sim.organisms[0].wander_target.is_none());
    }
}
