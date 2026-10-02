//! The year has teeth. Wild food sprouts through spring and summer, thins
//! in autumn and dies back in winter; fresh food spoils in the pouch; the
//! cold drains the unsheltered; and crowded winter camps catch sickness.
//! A tribe that stores food, builds shelter and learns medicine (or has a
//! god who answers its prayers) comes through. One that doesn't, struggles.
use crate::sim::simulation::Simulation;
use crate::world::{
    grid::{HEIGHT, WIDTH},
    tiles::Tile,
};
use rand::RngExt;

/// Wild food changes in steps this many ticks apart.
pub const WILD_FOOD_STEP: u64 = 300;
/// Share of wild food that rots each step whatever the season.
const ROT: f32 = 0.02;
/// Share of wild food that withers in each winter step.
const WINTER_DIEBACK: f32 = 0.12;
/// Chance that a winter turns out hard.
pub const HARD_WINTER_CHANCE: f32 = 0.3;
/// Extra cold in a hard winter, in degrees.
const HARD_WINTER_CHILL: f32 = 8.0;

/// Carried food spoils on this cadence.
pub const SPOIL_STEP: u64 = 600;

/// Fresh food carried in a pouch goes off. Pots slow it; salt or proper
/// preservation stops it. Stored winter provisions are already preserved.
fn spoil_carried_food(organisms: &mut [crate::organism::organism::Organism]) {
    for o in organisms.iter_mut().filter(|o| o.alive && o.inv_food > 2) {
        let d = &o.discoveries;
        if d.contains("food_preservation") || d.contains("salt") || d.contains("salt_harvesting") {
            continue;
        }
        let spare = o.inv_food - 2;
        let spoiled = if d.contains("pottery") {
            spare / 8
        } else {
            spare / 4
        }
        .max(1);
        o.inv_food -= spoiled.min(spare);
    }
}

/// How readily wild food sprouts in each season.
pub(crate) fn food_season(season: &str) -> f32 {
    match season {
        "abundance" => 1.6,
        "recovery" => 1.0,
        "decline" => 0.5,
        _ => 0.0,
    }
}

/// Degrees warmer or colder than a tile's usual temperature.
pub(crate) fn season_temperature(season: &str) -> f32 {
    match season {
        "abundance" => 3.0,
        "decline" => -4.0,
        "scarcity" => -12.0,
        _ => -2.0,
    }
}

/// How much a forager finds in each season.
pub(crate) fn forage_season(season: &str) -> f32 {
    match season {
        "abundance" => 1.0,
        "recovery" => 0.8,
        "decline" => 0.5,
        _ => 0.12,
    }
}

impl Simulation {
    /// Today's temperature offset: the season, and a hard winter's bite.
    pub(crate) fn season_temperature_now(&self) -> f32 {
        season_temperature(self.season()) - if self.hard_winter { HARD_WINTER_CHILL } else { 0.0 }
    }

    /// Each winter is foretold as autumn begins, giving tribes (and their
    /// gods) a season to prepare; the hard ones arrive as winter does.
    fn tick_winter_omen(&mut self) {
        use crate::sim::config::SEASON_LENGTH;
        let into_year = self.tick_count % (SEASON_LENGTH * 4);
        if into_year == SEASON_LENGTH {
            self.hard_winter_ahead = self.rng.random::<f32>() < HARD_WINTER_CHANCE;
            if self.hard_winter_ahead {
                self.announce_winter(
                    "the elders fear a hard winter",
                    "\u{2744}\u{FE0F} The elders fear a hard winter.",
                );
            }
        } else if into_year == SEASON_LENGTH * 2 {
            self.hard_winter = self.hard_winter_ahead;
            self.hard_winter_ahead = false;
            if self.hard_winter {
                self.announce_winter(
                    "a hard winter has come",
                    "\u{2744}\u{FE0F} A hard winter has come.",
                );
            }
        } else if into_year == SEASON_LENGTH * 3 {
            self.hard_winter = false;
        }
    }

    fn announce_winter(&mut self, detail: &str, headline: &str) {
        crate::sim::world_events::push_event(&mut self.events, self.tick_count, "weather", "the sky", detail);
        self.headlines.push_back((self.tick_count, headline.to_string()));
        while self.headlines.len() > 80 {
            self.headlines.pop_front();
        }
    }

    pub(crate) fn tick_wild_food(&mut self) {
        self.tick_winter_omen();
        if self.tick_count > 0 && self.tick_count.is_multiple_of(SPOIL_STEP) {
            spoil_carried_food(&mut self.organisms);
            self.winter_sickness();
        }
        if !self.tick_count.is_multiple_of(WILD_FOOD_STEP) || self.tick_count == 0 {
            return;
        }
        let loss = match (self.season(), self.hard_winter) {
            ("scarcity", true) => WINTER_DIEBACK * 2.0,
            ("scarcity", false) => WINTER_DIEBACK,
            _ => ROT,
        };
        // A god's fields and orchards keep to their own season.
        for i in 0..WIDTH * HEIGHT {
            if self.grid.tiles[i] != Tile::Food as i8 || self.plantings.contains_key(&(i as u32)) {
                continue;
            }
            if self.rng.random::<f32>() < loss {
                self.grid.tiles[i] = Tile::Grass as i8;
            }
        }
    }

    /// Crowded camps catch sickness in the cold months. Tribes that know
    /// medicine catch it less often.
    fn winter_sickness(&mut self) {
        let chance = match self.season() {
            "scarcity" if self.hard_winter => 0.35,
            "scarcity" => 0.22,
            "decline" => 0.06,
            _ => return,
        };
        let mut tribes: std::collections::BTreeMap<String, Vec<usize>> = Default::default();
        for (i, o) in self.organisms.iter().enumerate() {
            if o.alive && !o.lineage_id.is_empty() {
                tribes.entry(o.lineage_id.clone()).or_default().push(i);
            }
        }
        for (lineage, members) in tribes {
            if members.len() < 12 {
                continue;
            }
            let healers = members
                .iter()
                .filter(|&&i| self.organisms[i].discoveries.contains("medicine"))
                .count() as f32
                / members.len() as f32;
            if self.rng.random::<f32>() >= chance * (1.0 - healers * 0.6) {
                continue;
            }
            // The illness of the age: fever early on, flu once people
            // crowd into towns, influenza in the modern world.
            use crate::sim::civ::era::Era;
            let era = self.era(&lineage);
            let illness = if era >= Era::Modern {
                "influenza"
            } else if era >= Era::Bronze {
                "flu"
            } else {
                "fever"
            };
            let sick = (members.len() / 10).clamp(1, 4);
            let tick = self.tick_count;
            for k in 0..sick {
                let i = members[(k * 7 + tick as usize) % members.len()];
                let o = &mut self.organisms[i];
                let immune = o.disease_immunity.get(illness).is_some_and(|&until| until > tick);
                if !immune && !o.diseases.iter().any(|(d, _)| d == illness) {
                    o.diseases.push((illness.to_string(), tick));
                }
                o.infection = o.infection.max(0.4);
                o.think("a fever came with the cold", tick);
            }
            let name = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".into());
            crate::sim::world_events::push_event(
                &mut self.events,
                self.tick_count,
                "outbreak",
                &name,
                "fell sick in the cold",
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::config::SEASON_LENGTH;
    use crate::world::grid::WorldGrid;

    #[test]
    fn carried_food_spoils_unless_the_tribe_can_preserve_it() {
        let mut sim = Simulation::new(4);
        sim.organisms.truncate(3);
        for o in sim.organisms.iter_mut() {
            o.inv_food = 10;
        }
        sim.organisms[1].discoveries.insert("pottery".into());
        sim.organisms[2].discoveries.insert("food_preservation".into());
        spoil_carried_food(&mut sim.organisms);
        assert_eq!(sim.organisms[0].inv_food, 8);
        assert_eq!(sim.organisms[1].inv_food, 9);
        assert_eq!(sim.organisms[2].inv_food, 10);
    }

    #[test]
    fn winter_withers_wild_food_but_spares_the_gods_fields() {
        let mut sim = Simulation::new(4);
        let planted = WorldGrid::idx(100, 100) as u32;
        sim.grid.set(100, 100, Tile::Food);
        sim.plantings.insert(
            planted,
            crate::sim::tech::plantings::Planting::new(crate::sim::tech::plantings::PlantKind::Crop),
        );
        let wild_before = sim.grid.tiles.iter().filter(|&&t| t == Tile::Food as i8).count();
        // Step through a whole winter.
        sim.tick_count = SEASON_LENGTH * 2;
        assert_eq!(sim.season(), "scarcity");
        for _ in 0..(SEASON_LENGTH / WILD_FOOD_STEP) {
            sim.tick_count += WILD_FOOD_STEP;
            if sim.season() != "scarcity" {
                break;
            }
            sim.tick_wild_food();
        }
        let wild_after = sim.grid.tiles.iter().filter(|&&t| t == Tile::Food as i8).count();
        assert!(
            wild_after * 2 < wild_before,
            "{wild_after} of {wild_before} wild food survived winter"
        );
        assert_eq!(sim.grid.get(100, 100), Tile::Food, "the planted crop survives");
    }

    #[test]
    fn the_seasons_set_growth_foraging_and_cold() {
        assert_eq!(food_season("scarcity"), 0.0);
        assert!(food_season("abundance") > food_season("decline"));
        assert!(forage_season("scarcity") < forage_season("recovery"));
        assert!(season_temperature("scarcity") < season_temperature("abundance"));
    }

    #[test]
    fn crowded_winter_camps_catch_fevers() {
        let mut sim = Simulation::new(4);
        let lineage = sim.organisms[0].lineage_id.clone();
        for o in sim.organisms.iter_mut() {
            o.lineage_id = lineage.clone();
            o.infection = 0.0;
            o.discoveries.remove("medicine");
        }
        sim.tick_count = SEASON_LENGTH * 2;
        let mut fevers = 0;
        for _ in 0..40 {
            sim.winter_sickness();
            fevers = sim.organisms.iter().filter(|o| !o.diseases.is_empty()).count();
            if fevers > 0 {
                break;
            }
        }
        assert!(fevers > 0);
    }

    #[test]
    fn some_winters_are_hard_and_end_with_spring() {
        let mut sim = Simulation::new(4);
        let mut hard = 0;
        for year in 0..40u64 {
            sim.tick_count = year * SEASON_LENGTH * 4 + SEASON_LENGTH;
            sim.tick_winter_omen();
            let foretold = sim.hard_winter_ahead;
            sim.tick_count += SEASON_LENGTH;
            sim.tick_winter_omen();
            assert_eq!(sim.hard_winter, foretold, "the omen comes true");
            assert!(!sim.hard_winter_ahead);
            if sim.hard_winter {
                hard += 1;
                assert!(sim.season_temperature_now() < season_temperature("scarcity"));
            }
            sim.tick_count += SEASON_LENGTH;
            sim.tick_winter_omen();
            assert!(!sim.hard_winter, "spring ends a hard winter");
        }
        assert!((4..=24).contains(&hard), "{hard} hard winters in 40");
    }
}
