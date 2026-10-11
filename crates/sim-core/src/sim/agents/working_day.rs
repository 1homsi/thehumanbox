//! The working day. An adult with a trade walks to the workplace of that trade
//! in the morning: the nearest working workshop of the tribe that pulls that
//! trade (a forge for a smith, a bakery for a baker, a ranch for a farmer, see
//! `workshop_pull`). At midday a worker who is away from home walks back to
//! eat, and at dusk the evening gatherings and the walk home take over.
//!
//! Each person looks once a minute, at their own minute of the hour, so a
//! tribe sets out in a trickle over the morning instead of all at once. The
//! walks are wander targets, the same hint every other walk uses, and only a
//! person who is free and fit is given one.

use super::age_stage::AgeStage;
use super::family_outings::{chebyshev, spread};
use crate::sim::civ_tick::workshop_pull;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;

/// The morning walk to work starts at this fraction of the day and ends at the second.
const MORNING: (f32, f32) = (0.10, 0.25);
/// The midday walk home to eat falls between these fractions of the day.
const MIDDAY: (f32, f32) = (0.45, 0.55);
/// A workplace must be this close to home (in tiles) for the tribe's people to walk to it.
const WORK_REACH: i32 = 24;
/// Within this many tiles of home a person counts as being at home.
const HOME_REACH: i32 = 6;
/// A worker already this close to the workplace does not set out for it.
const AT_WORK: i32 = 2;
/// Children are at school from the first fraction of the day to the second.
const SCHOOL_HOURS: (f32, f32) = (0.10, 0.60);
/// A school must be this close to a tribe's home (in tiles) for its children to attend.
const SCHOOL_REACH: i32 = 24;

impl Simulation {
    /// Each tribe's school for the school hours: the nearest working school of the tribe within `SCHOOL_REACH`
    /// of its home. Empty outside school hours. Runs every tick, so the children's walks read the same places.
    pub(crate) fn tick_school_places(&mut self) {
        self.school_places.clear();
        let phase = (self.tick_count % DAY_LENGTH) as f32 / DAY_LENGTH as f32;
        if !(SCHOOL_HOURS.0..SCHOOL_HOURS.1).contains(&phase) {
            return;
        }
        for b in self.buildings.iter() {
            if b.kind != BuildingKind::School || !b.is_operational() || b.damage >= 0.5 {
                continue;
            }
            let Some(lineage) = b.owner_lineage.as_deref() else {
                continue;
            };
            let Some(h) = self.lineage_homes.get(lineage) else {
                continue;
            };
            let home = (h[0], h[1]);
            let (fw, fh) = b.kind.footprint();
            let p = (b.x + fw as i32 / 2, b.y + fh as i32 / 2);
            if chebyshev(p, home) > SCHOOL_REACH {
                continue;
            }
            let best = self.school_places.get(lineage).copied();
            if best.is_none_or(|q| (chebyshev(p, home), p) < (chebyshev(q, home), q)) {
                self.school_places.insert(lineage.to_string(), p);
            }
        }
    }

    /// The centre of the nearest working workshop of `lineage` that pulls `trade`, within `WORK_REACH` of `home`.
    fn workplace_for(&self, lineage: &str, trade: &str, home: (i32, i32)) -> Option<(i32, i32)> {
        self.buildings
            .iter()
            .filter(|b| b.owner_lineage.as_deref() == Some(lineage) && b.is_operational() && b.damage < 0.5)
            .filter(|b| workshop_pull(b.kind).is_some_and(|s| s.name() == trade))
            .map(|b| {
                let (fw, fh) = b.kind.footprint();
                (b.x + fw as i32 / 2, b.y + fh as i32 / 2)
            })
            .filter(|&p| chebyshev(p, home) <= WORK_REACH)
            .min_by_key(|&p| (chebyshev(p, home), p))
    }

    /// Sends an idle, fit adult to work in the morning, or home to eat at midday, depending on the hour.
    pub(crate) fn assign_working_day(&mut self, idx: usize) {
        let tick = self.tick_count;
        if tick % 60 != idx as u64 % 60 {
            return;
        }
        let phase = (tick % DAY_LENGTH) as f32 / DAY_LENGTH as f32;
        let in_morning = (MORNING.0..MORNING.1).contains(&phase);
        let at_midday = (MIDDAY.0..MIDDAY.1).contains(&phase);
        if !in_morning && !at_midday {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
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
        let Some(trade) = self.organisms[idx].specialty.clone() else {
            return;
        };
        if in_morning {
            // Only someone fed and watered goes to work; a hungry or thirsty person looks for food first.
            if self.organisms[idx].energy < 0.6 || self.organisms[idx].hydration < 0.6 {
                return;
            }
            let lineage = self.organisms[idx].lineage_id.clone();
            let Some(place) = self.workplace_for(&lineage, &trade, home) else {
                return;
            };
            if chebyshev(here, place) <= AT_WORK {
                return;
            }
            let target = (
                place.0 + spread(idx, tick, 5, 1),
                place.1 + spread(idx, tick, 6, 1),
            );
            if self.set_outing_target(idx, target) {
                self.organisms[idx].think("going to work", tick);
            }
        } else if self.organisms[idx].energy < 0.5 && chebyshev(here, home) > HOME_REACH {
            // At midday only the hungry walk home to eat; the fed stay where they are.
            let target = (home.0 + spread(idx, tick, 7, 2), home.1 + spread(idx, tick, 8, 2));
            if self.set_outing_target(idx, target) {
                self.organisms[idx].think("going home to eat", tick);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::tech::buildings::{Building, BuildingKind};
    use crate::world::tiles::Tile;

    /// Four adults of one tribe on open grass at (100, 100), the first of them a smith with a forge at (110, 100).
    fn smith_town() -> Simulation {
        let mut sim = Simulation::new(91);
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
        sim.organisms[0].specialty = Some("smith".into());
        sim
    }

    /// A tick in the morning window whose minute matches person `idx`.
    fn morning_tick(idx: usize) -> u64 {
        let base = 3 * DAY_LENGTH + (DAY_LENGTH as f32 * MORNING.0) as u64;
        base + (idx as u64 + 60 - base % 60) % 60
    }

    #[test]
    fn a_smith_walks_to_the_forge_in_the_morning_and_others_stay() {
        let mut sim = smith_town();
        let mut forge = Building::new(900, BuildingKind::Forge, 110, 100, Some("clan".into()), 0);
        forge.condition = 1.0;
        sim.buildings.push(forge);
        sim.tick_count = morning_tick(0);
        sim.assign_working_day(0);
        let target = sim.organisms[0].wander_target.expect("the smith sets out");
        assert!(chebyshev(target, (110, 100)) <= 2, "target {target:?}");
        sim.tick_count = morning_tick(1);
        sim.assign_working_day(1);
        assert!(
            sim.organisms[1].wander_target.is_none(),
            "a person with no trade stays put"
        );
    }

    #[test]
    fn at_midday_a_worker_away_from_home_walks_back() {
        let mut sim = smith_town();
        sim.organisms[0].x = 120.0;
        sim.organisms[0].energy = 0.3;
        let base = 3 * DAY_LENGTH + (DAY_LENGTH as f32 * MIDDAY.0) as u64;
        sim.tick_count = base + (60 - base % 60) % 60;
        sim.assign_working_day(0);
        let target = sim.organisms[0]
            .wander_target
            .expect("the smith walks home to eat");
        assert!(chebyshev(target, (100, 100)) <= HOME_REACH);
    }
}
