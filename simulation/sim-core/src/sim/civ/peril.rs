//! A tribe on the brink is announced while it can still be saved, with what
//! is killing it, so its god has time to act. Before this the world only
//! spoke up once a dynasty had already died out.

use crate::organism::organism::Sex;
use crate::sim::agents::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rustc_hash::FxHashMap;

/// Smallest peak a tribe must have reached for its decline to be news.
const PERIL_MIN_PEAK: u32 = 8;
/// Ticks between checks.
pub(crate) const PERIL_STEP: u64 = 300;

/// What a tribe on the brink is dying of, as the player reads it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PerilCause {
    Sickness,
    Hunger,
    Thirst,
    NoChildren,
    OldAge,
    Dwindling,
}

impl PerilCause {
    pub fn name(self) -> &'static str {
        match self {
            PerilCause::Sickness => "sickness",
            PerilCause::Hunger => "hunger",
            PerilCause::Thirst => "thirst",
            PerilCause::NoChildren => "no_children",
            PerilCause::OldAge => "old_age",
            PerilCause::Dwindling => "dwindling",
        }
    }

    pub fn phrase(self) -> &'static str {
        match self {
            PerilCause::Sickness => "sickness is taking them",
            PerilCause::Hunger => "they are starving",
            PerilCause::Thirst => "they have no water",
            PerilCause::NoChildren => "no one is left to raise children",
            PerilCause::OldAge => "they are growing old",
            PerilCause::Dwindling => "their numbers keep falling",
        }
    }
}

/// A tribe the world has warned about.
#[derive(Clone, Debug)]
pub struct Peril {
    pub population: u32,
    pub peak: u32,
    pub cause: PerilCause,
    pub since: u64,
}

/// On the brink: down to a quarter of its peak, or three people.
pub(crate) fn in_peril(population: u32, peak: u32) -> bool {
    peak >= PERIL_MIN_PEAK && population > 0 && population <= (peak / 4).max(3)
}

/// Out of danger again: back to half its peak, or six people.
pub(crate) fn recovered(population: u32, peak: u32) -> bool {
    population >= (peak / 2).max(6)
}

#[derive(Default)]
struct Census {
    population: u32,
    sick: u32,
    hungry: u32,
    thirsty: u32,
    elders: u32,
    fertile_women: u32,
    fertile_men: u32,
}

impl Census {
    fn cause(&self) -> PerilCause {
        let third = self.population.div_ceil(3);
        if self.sick >= third {
            PerilCause::Sickness
        } else if self.thirsty >= third {
            PerilCause::Thirst
        } else if self.hungry >= third {
            PerilCause::Hunger
        } else if self.fertile_women == 0 || self.fertile_men == 0 {
            if self.elders * 2 >= self.population {
                PerilCause::OldAge
            } else {
                PerilCause::NoChildren
            }
        } else {
            PerilCause::Dwindling
        }
    }
}

impl Simulation {
    fn census(&self) -> FxHashMap<String, Census> {
        let mut census: FxHashMap<String, Census> = FxHashMap::default();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let c = census.entry(o.lineage_id.clone()).or_default();
            c.population += 1;
            c.sick += u32::from(o.infection > 0.3 || !o.diseases.is_empty());
            c.hungry += u32::from(o.energy < 0.45);
            c.thirsty += u32::from(o.hydration < 0.35);
            let stage = AgeStage::from_age(o.age, o.max_age);
            c.elders += u32::from(stage == AgeStage::Elder);
            if stage.can_reproduce() {
                match o.sex {
                    Sex::Female => c.fertile_women += 1,
                    Sex::Male => c.fertile_men += 1,
                }
            }
        }
        census
    }

    /// Warn when a tribe falls to the brink, and again when it recovers.
    pub(crate) fn tick_tribe_peril(&mut self) {
        let now = self.tick_count;
        let census = self.census();
        let mut lineages: Vec<&String> = census.keys().collect();
        lineages.sort();
        let mut news: Vec<(&'static str, String, String, String)> = Vec::new();
        for lineage in lineages {
            let c = &census[lineage];
            let peak = self
                .lineage_peak_pop
                .get(lineage)
                .copied()
                .unwrap_or(0)
                .max(c.population);
            let name = self
                .lineage_names
                .get(lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            match self.tribe_peril.get_mut(lineage) {
                Some(_) if recovered(c.population, peak) => {
                    news.push((
                        "milestone",
                        name.clone(),
                        format!("are recovering, {} strong again", c.population),
                        format!(
                            "\u{1F331} The {name} are recovering: {} strong again.",
                            c.population
                        ),
                    ));
                    self.tribe_peril.remove(lineage);
                }
                Some(peril) => {
                    peril.population = c.population;
                    peril.peak = peak;
                    peril.cause = c.cause();
                }
                None if in_peril(c.population, peak) => {
                    let cause = c.cause();
                    let remain = if c.population == 1 {
                        "only one remains".to_string()
                    } else {
                        format!("only {} remain", c.population)
                    };
                    news.push((
                        "danger",
                        name.clone(),
                        format!("are dwindling: {remain}, and {}", cause.phrase()),
                        format!(
                            "\u{26A0}\u{FE0F} The {name} are dwindling: {remain}, and {}.",
                            cause.phrase()
                        ),
                    ));
                    self.tribe_peril.insert(
                        lineage.clone(),
                        Peril {
                            population: c.population,
                            peak,
                            cause,
                            since: now,
                        },
                    );
                }
                None => {}
            }
        }
        // Tribes that are gone are mourned by the dynasty watch instead.
        self.tribe_peril.retain(|lineage, _| census.contains_key(lineage));
        for (kind, actor, detail, headline) in news {
            push_event(&mut self.events, now, kind, &actor, &detail);
            self.headlines.push_back((now, headline));
        }
        while self.headlines.len() > 80 {
            self.headlines.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;

    fn person(id: usize, lineage: &str, sex: Sex) -> Organism {
        let mut o = Organism::new(
            format!("p{id}"),
            format!("p{id}"),
            50.0,
            50.0,
            0,
            String::new(),
            lineage.to_string(),
            20_000,
            Default::default(),
        );
        o.alive = true;
        o.max_age = 20_000;
        o.age = 10_000;
        o.energy = 0.9;
        o.hydration = 0.9;
        o.sex = sex;
        o
    }

    fn world(people: Vec<Organism>, peak: u32) -> Simulation {
        let mut sim = Simulation::new(91);
        sim.organisms = people;
        sim.lineage_names.insert("clan".into(), "Ashfolk".into());
        sim.lineage_peak_pop.insert("clan".into(), peak);
        sim.events.clear();
        sim.headlines.clear();
        sim
    }

    #[test]
    fn a_dwindling_tribe_is_named_with_what_is_killing_it_and_its_recovery_too() {
        let mut people: Vec<Organism> = (0..3).map(|i| person(i, "clan", Sex::Female)).collect();
        people[0].sex = Sex::Male;
        for p in &mut people[..2] {
            p.infection = 0.8;
        }
        let mut sim = world(people, 20);
        sim.tick_tribe_peril();
        let peril = &sim.tribe_peril["clan"];
        assert_eq!(peril.cause, PerilCause::Sickness);
        assert_eq!(peril.population, 3);
        assert!(sim.events.iter().any(|e| e.etype == "danger"
            && e.actor == "Ashfolk"
            && e.detail == "are dwindling: only 3 remain, and sickness is taking them"));
        assert!(sim
            .headlines
            .iter()
            .any(|(_, h)| h.contains("The Ashfolk are dwindling")));

        // Warned once, not every check.
        sim.tick_tribe_peril();
        assert_eq!(sim.events.iter().filter(|e| e.etype == "danger").count(), 1);

        for i in 3..10 {
            sim.organisms.push(person(i, "clan", Sex::Female));
        }
        sim.tick_tribe_peril();
        assert!(!sim.tribe_peril.contains_key("clan"));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == "are recovering, 10 strong again"));
    }

    #[test]
    fn a_tribe_without_mothers_is_told_it_has_no_one_to_raise_children() {
        let people: Vec<Organism> = (0..3).map(|i| person(i, "clan", Sex::Male)).collect();
        let mut sim = world(people, 12);
        sim.tick_tribe_peril();
        assert_eq!(sim.tribe_peril["clan"].cause, PerilCause::NoChildren);

        let mut elders: Vec<Organism> = (0..3).map(|i| person(i, "clan", Sex::Male)).collect();
        for e in &mut elders {
            e.age = 18_000;
        }
        let mut sim = world(elders, 12);
        sim.tick_tribe_peril();
        assert_eq!(sim.tribe_peril["clan"].cause, PerilCause::OldAge);
    }

    #[test]
    fn small_tribes_and_healthy_ones_are_not_news() {
        assert!(!in_peril(3, 6), "a tribe that never grew is not dwindling");
        assert!(!in_peril(8, 20));
        assert!(in_peril(5, 20));
        assert!(in_peril(3, 8));
        assert!(!in_peril(0, 20), "the dead are mourned, not warned");
        let people: Vec<Organism> = (0..12).map(|i| person(i, "clan", Sex::Female)).collect();
        let mut sim = world(people, 14);
        sim.tick_tribe_peril();
        assert!(sim.tribe_peril.is_empty());
    }
}
