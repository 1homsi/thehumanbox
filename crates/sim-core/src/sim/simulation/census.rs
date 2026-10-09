//! The animal census: every 300 ticks the wild stock of each common kind is
//! counted, and the chronicle records when a kind is thinning, has died out,
//! or comes back. Recovery itself is the population floor in `tick_animals`.

use super::*;

/// Ticks between two censuses.
pub(super) const CENSUS_EVERY: u64 = 300;

/// The kinds that are counted: the wild and farm animals people share the land with.
const CENSUSED: [AnimalKind; 13] = [
    AnimalKind::Rabbit,
    AnimalKind::Deer,
    AnimalKind::Boar,
    AnimalKind::Bird,
    AnimalKind::Fish,
    AnimalKind::Wolf,
    AnimalKind::Bear,
    AnimalKind::Sheep,
    AnimalKind::Cow,
    AnimalKind::Horse,
    AnimalKind::Chicken,
    AnimalKind::Fox,
    AnimalKind::Cat,
];

/// Below this many, a kind is reported as nearly gone.
const FEW_LEFT: u32 = 3;

fn plural(kind: AnimalKind) -> &'static str {
    match kind {
        AnimalKind::Sheep => "sheep",
        AnimalKind::Deer => "deer",
        AnimalKind::Fish => "fish",
        AnimalKind::Wolf => "wolves",
        AnimalKind::Fox => "foxes",
        AnimalKind::Chicken => "chickens",
        AnimalKind::Rabbit => "rabbits",
        AnimalKind::Boar => "boars",
        AnimalKind::Bird => "birds",
        AnimalKind::Bear => "bears",
        AnimalKind::Cow => "cows",
        AnimalKind::Horse => "horses",
        AnimalKind::Cat => "cats",
        other => other.name(),
    }
}

impl Simulation {
    pub(super) fn tick_animal_census(&mut self) {
        if self.tick_count == 0 || !self.tick_count.is_multiple_of(CENSUS_EVERY) {
            return;
        }
        let mut counts = vec![0u32; CENSUSED.len()];
        for a in self.animals.iter().filter(|a| a.alive && a.bonded_org.is_none()) {
            if let Some(i) = CENSUSED.iter().position(|&k| k == a.kind) {
                counts[i] += 1;
            }
        }
        let prev = std::mem::take(&mut self.animal_census);
        if prev.len() == counts.len() {
            for (i, &kind) in CENSUSED.iter().enumerate() {
                let (was, now) = (prev[i], counts[i]);
                let name = plural(kind);
                if was > 0 && now == 0 {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "danger",
                        "world",
                        &format!("the last {} has died out", kind.name()),
                    );
                } else if was > FEW_LEFT && (1..=FEW_LEFT).contains(&now) {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "danger",
                        "world",
                        &format!("only {now} {name} are left in the land"),
                    );
                } else if was == 0 && now >= FEW_LEFT {
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "milestone",
                        "world",
                        &format!("{name} return to the land"),
                    );
                }
            }
        }
        self.animal_census = counts;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_kind_dying_out_and_coming_back_is_chronicled_once_each() {
        let mut sim = Simulation::new(0xCE15);
        sim.animals.clear();
        for i in 0..6usize {
            sim.animals
                .push(Animal::new(i + 1, 20.0 + i as f32, 20.0, AnimalKind::Rabbit));
        }
        sim.tick_count = 300;
        sim.tick_animal_census();
        assert!(
            sim.events.iter().all(|e| !e.detail.contains("rabbit")),
            "the first census only counts"
        );

        for a in sim.animals.iter_mut() {
            a.alive = false;
        }
        sim.tick_count = 600;
        sim.tick_animal_census();
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == "the last rabbit has died out"));

        sim.tick_count = 900;
        sim.tick_animal_census();
        assert_eq!(
            sim.events.iter().filter(|e| e.detail.contains("rabbit")).count(),
            1,
            "no repeat while it stays gone"
        );

        for i in 0..4usize {
            sim.animals
                .push(Animal::new(100 + i, 30.0, 30.0 + i as f32, AnimalKind::Rabbit));
        }
        sim.tick_count = 1200;
        sim.tick_animal_census();
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == "rabbits return to the land"));
    }
}
