//! Tribes hold festivals as the year turns. At the start of each season a
//! settled tribe gathers its people at its centre for a few hundred ticks:
//! a feast at harvest, at midwinter, in spring and at midsummer. Those who
//! come are cheered and less lonely, and the tribe comes together at the
//! very times of year it is hardest to feel together.

use crate::sim::civ::culture::{Festival, FestivalKind};
use crate::sim::config::SEASON_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// Ticks between festival passes.
pub(crate) const FESTIVAL_STEP: u64 = 120;
/// Ticks a festival lasts.
pub const FESTIVAL_TICKS: u32 = 600;
/// Smallest tribe that holds one.
const MIN_PEOPLE: usize = 8;
/// How far from the centre people come to a festival, in tiles.
const REACH: f32 = 30.0;
/// Cheer, per pass, for each person at the festival.
const JOY: u32 = 50;
const LONELINESS_RELIEF: f32 = 0.03;
const FEAR_RELIEF: f32 = 0.02;

/// What a season's turning is celebrated as, by season index (the sim's
/// order: abundance, decline, scarcity, recovery).
pub(crate) fn festival_for_season(season: usize) -> (FestivalKind, &'static str) {
    match season % 4 {
        0 => (FestivalKind::Carnival, "Midsummer Fair"),
        1 => (FestivalKind::Harvest, "Harvest Feast"),
        2 => (FestivalKind::Solstice, "Midwinter Feast"),
        _ => (FestivalKind::Spring, "Spring Festival"),
    }
}

impl Simulation {
    pub(crate) fn tick_festivals(&mut self) {
        let now = self.tick_count;
        self.festivals
            .retain(|f| now < f.start_tick + u64::from(f.duration_ticks));
        let into_season = now % SEASON_LENGTH;
        let season = ((now / SEASON_LENGTH) % 4) as usize;

        // A new season has just begun: settled tribes call a festival.
        if into_season < FESTIVAL_STEP * 2 {
            let (kind, name) = festival_for_season(season);
            let mut tribes: Vec<(String, usize)> = {
                let mut counts: std::collections::BTreeMap<String, usize> = Default::default();
                for o in self.organisms.iter().filter(|o| o.alive) {
                    *counts.entry(o.lineage_id.clone()).or_insert(0) += 1;
                }
                counts.into_iter().collect()
            };
            tribes.retain(|(l, n)| *n >= MIN_PEOPLE && self.lineage_homes.contains_key(l));
            for (lineage, _) in tribes {
                let held_lately = self
                    .festival_last
                    .get(&lineage)
                    .is_some_and(|&t| now.saturating_sub(t) < SEASON_LENGTH / 2);
                if held_lately || self.festivals.iter().any(|f| f.lineage_id == lineage) {
                    continue;
                }
                let home = self.lineage_homes[&lineage];
                let id = self.next_festival_id;
                self.next_festival_id += 1;
                self.festivals.push(Festival {
                    id,
                    lineage_id: lineage.clone(),
                    name: name.to_string(),
                    kind,
                    start_tick: now,
                    duration_ticks: FESTIVAL_TICKS,
                    center: [home[0], home[1]],
                });
                self.festival_last.insert(lineage.clone(), now);
                let tribe = self
                    .lineage_names
                    .get(&lineage)
                    .cloned()
                    .unwrap_or_else(|| "a tribe".to_string());
                push_event(
                    &mut self.events,
                    now,
                    "life",
                    &tribe,
                    &format!("hold their {name}"),
                );
            }
        }

        // Everyone near a festival is drawn to it and cheered by it.
        let active: Vec<(String, [i32; 2])> = self
            .festivals
            .iter()
            .map(|f| (f.lineage_id.clone(), f.center))
            .collect();
        for (lineage, c) in active {
            let (cx, cy) = (c[0] as f32, c[1] as f32);
            for i in 0..self.organisms.len() {
                let o = &self.organisms[i];
                if !o.alive || o.lineage_id != lineage {
                    continue;
                }
                let dist = (o.x - cx).hypot(o.y - cy);
                if dist > REACH {
                    continue;
                }
                let o = &mut self.organisms[i];
                // Only the well fed and watered leave their work for a feast.
                let fit = o.energy > 0.6 && o.hydration > 0.6 && o.health > 0.5;
                if dist > 6.0 && fit && o.journey.is_none() && (o.age % 5) < 2 {
                    o.begin_journey((c[0], c[1]), "going to the festival", now);
                }
                if dist <= 8.0 {
                    o.joy_ticks = (o.joy_ticks + JOY).min(1200);
                    o.loneliness = (o.loneliness - LONELINESS_RELIEF).max(0.0);
                    o.fear_level = (o.fear_level - FEAR_RELIEF).max(0.0);
                    o.think("at the festival", now);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;

    fn world(people: usize) -> Simulation {
        let mut sim = Simulation::new(77);
        sim.organisms.clear();
        sim.festivals.clear();
        sim.events.clear();
        sim.lineage_homes.insert("clan".into(), [100, 100, 0]);
        sim.lineage_names.insert("clan".into(), "Ashfolk".into());
        for i in 0..people {
            let mut o = Organism::new(
                format!("p{i}"),
                format!("p{i}"),
                98.0 + (i % 5) as f32,
                100.0,
                0,
                String::new(),
                "clan".into(),
                20_000,
                Default::default(),
            );
            o.alive = true;
            o.age = 9_000;
            o.loneliness = 0.8;
            sim.organisms.push(o);
        }
        sim
    }

    #[test]
    fn a_settled_tribe_holds_a_festival_when_the_season_turns_and_is_cheered_by_it() {
        let mut sim = world(10);
        // The start of autumn: the harvest.
        sim.tick_count = SEASON_LENGTH + 60;
        sim.tick_festivals();
        assert_eq!(sim.festivals.len(), 1);
        assert_eq!(sim.festivals[0].name, "Harvest Feast");
        assert!(sim.events.iter().any(|e| e.detail == "hold their Harvest Feast"));
        assert!(sim
            .organisms
            .iter()
            .all(|o| o.joy_ticks > 0 && o.loneliness < 0.8));
        // Not a second one in the same window.
        sim.tick_count += FESTIVAL_STEP;
        sim.tick_festivals();
        assert_eq!(sim.festivals.len(), 1);
    }

    #[test]
    fn small_or_homeless_tribes_hold_none_and_festivals_end() {
        let mut sim = world(3);
        sim.tick_count = SEASON_LENGTH + 60;
        sim.tick_festivals();
        assert!(sim.festivals.is_empty(), "a hamlet held a festival");

        let mut sim = world(10);
        sim.lineage_homes.clear();
        sim.tick_count = SEASON_LENGTH + 60;
        sim.tick_festivals();
        assert!(sim.festivals.is_empty());

        let mut sim = world(10);
        sim.tick_count = SEASON_LENGTH + 60;
        sim.tick_festivals();
        assert_eq!(sim.festivals.len(), 1);
        sim.tick_count += u64::from(FESTIVAL_TICKS) + 1;
        sim.tick_festivals();
        assert!(sim.festivals.is_empty(), "the festival never ended");
    }

    #[test]
    fn every_season_has_its_own_celebration() {
        let names: Vec<&str> = (0..4).map(|s| festival_for_season(s).1).collect();
        assert_eq!(
            names,
            vec![
                "Midsummer Fair",
                "Harvest Feast",
                "Midwinter Feast",
                "Spring Festival"
            ]
        );
    }

    #[test]
    fn festivals_are_sent_to_the_client_while_they_last() {
        let mut sim = world(10);
        sim.tick_count = SEASON_LENGTH + 60;
        sim.tick_festivals();
        let payload = sim.state_json();
        let f = &payload["festivals"][0];
        assert_eq!(f["name"], "Harvest Feast");
        assert_eq!(f["x"], 100);
        assert_eq!(f["lineage_id"], "clan");
    }
}
