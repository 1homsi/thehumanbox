//! Evening gatherings. As the light goes, about half of the fed and free
//! people of each settled tribe walk to the tribe's gathering place: its
//! tavern, inn, café or place of worship near home, or else its campfire.
//! There they stand together for the evening, and the company lifts their
//! spirits and eases loneliness. Festivals (see `festivals.rs`) remain the
//! big occasions; these gatherings happen every night.

use crate::sim::agents::age_stage::AgeStage;
use crate::sim::agents::family_outings::{chebyshev, spread};
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind as BK;
use crate::world::tiles::Tile;
use std::collections::BTreeMap;

/// The evening gathering lasts this many ticks from dusk.
pub(crate) const EVENING_TICKS: u64 = 90;
/// A gathering place must be this close to the tribe's home (in tiles).
const PLACE_REACH: i32 = 20;
/// A campfire the tribe gathers at must be this close to home.
const FIRE_REACH: i32 = 12;
/// People this close to the gathering place are in the crowd.
const CROWD: i32 = 6;
/// People farther than this from the gathering place do not walk to it.
const CALL_REACH: i32 = 14;

/// Buildings where a tribe gathers in the evening.
fn is_gathering_place(kind: BK) -> bool {
    matches!(
        kind,
        BK::Tavern
            | BK::Inn
            | BK::Cafe
            | BK::Restaurant
            | BK::Temple
            | BK::Cathedral
            | BK::Shrine
            | BK::Mosque
            | BK::Synagogue
            | BK::Pagoda
    )
}

impl Simulation {
    /// Where a tribe gathers in the evening: the nearest of its gathering buildings near home, else the nearest campfire near home.
    pub(crate) fn evening_place(&self, lineage: &str, home: (i32, i32)) -> Option<(i32, i32)> {
        let building = self
            .buildings
            .iter()
            .filter(|b| b.owner_lineage.as_deref() == Some(lineage) && b.damage < 0.5)
            .filter(|b| is_gathering_place(b.kind))
            .map(|b| (b.x, b.y))
            .filter(|&p| chebyshev(p, home) <= PLACE_REACH)
            .min_by_key(|&p| (chebyshev(p, home), p));
        if building.is_some() {
            return building;
        }
        let mut best: Option<((i32, i32), i32)> = None;
        for dx in -FIRE_REACH..=FIRE_REACH {
            for dy in -FIRE_REACH..=FIRE_REACH {
                let p = (home.0 + dx, home.1 + dy);
                if self.grid.get(p.0, p.1) != Tile::Campfire {
                    continue;
                }
                let d = chebyshev(p, home);
                if best.is_none_or(|(bp, bd)| (d, p) < (bd, bp)) {
                    best = Some((p, d));
                }
            }
        }
        best.map(|(p, _)| p)
    }

    /// Runs each evening: the tribe gathers, and those in the crowd feel the company.
    pub(crate) fn tick_evening_gatherings(&mut self) {
        let tick = self.tick_count;
        let phase = tick % DAY_LENGTH;
        let dusk = DAY_LENGTH * 7 / 10;
        if phase < dusk || phase >= dusk + EVENING_TICKS {
            return;
        }
        // Each tribe's place is worked out once, at dusk (or on the first evening tick after a load).
        if phase == dusk || self.evening_places.is_empty() {
            let homes: Vec<(String, (i32, i32))> = {
                let mut v: Vec<(String, (i32, i32))> = self
                    .lineage_homes
                    .iter()
                    .map(|(l, h)| (l.clone(), (h[0], h[1])))
                    .collect();
                v.sort();
                v
            };
            let mut places: BTreeMap<String, (i32, i32)> = BTreeMap::new();
            for (lineage, home) in homes {
                if let Some(place) = self.evening_place(&lineage, home) {
                    places.insert(lineage, place);
                }
            }
            self.evening_places = places;
        }
        if self.evening_places.is_empty() {
            return;
        }
        let places = std::mem::take(&mut self.evening_places);
        let day = tick / DAY_LENGTH;
        for idx in 0..self.organisms.len() {
            let o = &self.organisms[idx];
            if !o.alive {
                continue;
            }
            let Some(&center) = places.get(&o.lineage_id) else {
                continue;
            };
            let here = (o.x as i32, o.y as i32);
            if chebyshev(here, center) <= CROWD {
                let o = &mut self.organisms[idx];
                o.joy_ticks = (o.joy_ticks + 3).min(1200);
                o.loneliness = (o.loneliness - 0.002).max(0.0);
                o.comfort = (o.comfort + 0.001).min(1.0);
                continue;
            }
            let fit = o.energy > 0.6 && o.hydration > 0.5 && o.health > 0.5;
            let free = o.journey.is_none() && o.wander_target.is_none();
            let grown = AgeStage::from_age(o.age, o.max_age) != AgeStage::Infant
                && AgeStage::from_age(o.age, o.max_age) != AgeStage::Child;
            if !fit || !free || !grown || chebyshev(here, center) > CALL_REACH {
                continue;
            }
            // Half the tribe goes out on a given evening; the rest stay at their own fires.
            if !(day + idx as u64).is_multiple_of(2) {
                continue;
            }
            let target = (
                center.0 + spread(idx, tick, 3, 3),
                center.1 + spread(idx, tick, 4, 3),
            );
            if self.set_outing_target(idx, target) {
                self.organisms[idx].think("heading to the gathering", tick);
            }
        }
        self.evening_places = places;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::world::tiles::Tile;

    /// A tribe of the first four people, living at (100, 100) on open grass with a campfire at (106, 100).
    fn tribe() -> Simulation {
        let mut sim = Simulation::new(81);
        sim.organisms.truncate(4);
        for x in 85..=120 {
            for y in 85..=115 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.grid.set(106, 100, Tile::Campfire);
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
        }
        sim
    }

    /// The first tick of an evening, on day three.
    fn dusk_tick() -> u64 {
        3 * DAY_LENGTH + DAY_LENGTH * 7 / 10
    }

    #[test]
    fn the_evening_place_is_the_campfire_when_there_is_no_tavern() {
        let sim = tribe();
        assert_eq!(sim.evening_place("clan", (100, 100)), Some((106, 100)));
        assert_eq!(sim.evening_place("clan", (60, 100)), None);
    }

    #[test]
    fn half_the_fed_and_free_walk_to_the_fire_at_dusk() {
        let mut sim = tribe();
        for o in sim.organisms.iter_mut() {
            o.x = 94.0;
            o.y = 100.0;
        }
        // On day three the odd-indexed people go out, so two of the four walk.
        sim.tick_count = dusk_tick();
        sim.tick_evening_gatherings();
        let walking = sim.organisms.iter().filter(|o| o.wander_target.is_some()).count();
        assert!(walking > 0 && walking < 4, "walking: {walking}");
        for o in sim.organisms.iter().filter(|o| o.wander_target.is_some()) {
            let t = o.wander_target.unwrap();
            assert!(chebyshev(t, (106, 100)) <= 3, "target {t:?} is not at the fire");
        }
    }

    #[test]
    fn the_crowd_at_the_fire_feels_the_company() {
        let mut sim = tribe();
        sim.organisms[0].x = 106.0;
        sim.organisms[0].y = 100.0;
        sim.organisms[0].loneliness = 0.5;
        let joy_before = sim.organisms[0].joy_ticks;
        sim.tick_count = dusk_tick();
        sim.tick_evening_gatherings();
        assert!(sim.organisms[0].joy_ticks > joy_before);
        assert!(sim.organisms[0].loneliness < 0.5);
    }

    #[test]
    fn nothing_happens_during_the_day() {
        let mut sim = tribe();
        for o in sim.organisms.iter_mut() {
            o.x = 100.0;
            o.y = 100.0;
        }
        sim.tick_count = 3 * DAY_LENGTH + 10;
        sim.tick_evening_gatherings();
        assert!(sim.organisms.iter().all(|o| o.wander_target.is_none()));
    }
}
