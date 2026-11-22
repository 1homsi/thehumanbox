//! An optional year-one world where language has already started to drift.
//!
//! A few hundred simulated years would be millions of ticks before the
//! player sees anything. Instead the tribes share one parent language, then
//! each one changes the words that match the land it lives on. The people
//! the player meets say the new words; their parents, still remembered, say
//! the old ones. A normal world never comes through here.

use std::collections::BTreeMap;

use crate::math::DetMath;
use crate::organism::family_words::FAMILY_WORD_CONCEPTS;
use crate::organism::organism::{generate_name, Organism, Sex};
use crate::organism::vocabulary::Vocabulary;
use crate::sim::cosmos::YEAR_LENGTH_TICKS;
use crate::sim::simulation::Simulation;
use crate::world::tiles::Biome;

use super::spawn::seeded_id;

/// How many years older a remembered parent is than their child.
const PARENT_YEARS: u32 = 25;

struct Tribe {
    members: Vec<usize>,
    x: f32,
    y: f32,
    biome: Biome,
}

impl Simulation {
    pub(crate) fn plant_language_head_start(&mut self) {
        let tribes = self.head_start_tribes();
        if tribes.len() < 2 {
            return;
        }
        let proto = Vocabulary::generate(&mut self.rng);
        let mut spoken = drifted_vocabularies(&proto, &tribes, &mut self.rng);
        let (left, right) = neighbour_pair(&tribes);
        separate_neighbours(&mut spoken, left, right, &mut self.rng);
        self.assign_tribal_words(&tribes, &spoken);
        self.remember_parents(&tribes, &proto);
    }

    fn head_start_tribes(&self) -> Vec<Tribe> {
        let mut members: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (index, person) in self.organisms.iter().enumerate() {
            if person.alive {
                members
                    .entry(person.lineage_id.to_string())
                    .or_default()
                    .push(index);
            }
        }
        members
            .into_values()
            .filter_map(|indexes| self.tribe_from_members(indexes))
            .collect()
    }

    fn tribe_from_members(&self, members: Vec<usize>) -> Option<Tribe> {
        let first = *members.first()?;
        let person = &self.organisms[first];
        let x = person.home_x;
        let y = person.home_y;
        Some(Tribe {
            members,
            x,
            y,
            biome: self.grid.biome_at(x as i32, y as i32),
        })
    }

    fn assign_tribal_words(&mut self, tribes: &[Tribe], spoken: &[Vocabulary]) {
        for (tribe, words) in tribes.iter().zip(spoken) {
            for &index in &tribe.members {
                let person = &mut self.organisms[index];
                person.vocabulary = words.clone();
                if person.generation == 0 {
                    person.generation = 1;
                }
            }
        }
    }

    fn remember_parents(&mut self, tribes: &[Tribe], proto: &Vocabulary) {
        let children: Vec<usize> = tribes
            .iter()
            .flat_map(|tribe| tribe.members.iter().copied())
            .collect();
        for child in children {
            self.attach_remembered_parent(child, proto);
        }
    }

    fn attach_remembered_parent(&mut self, child: usize, proto: &Vocabulary) {
        let person = &self.organisms[child];
        let (x, y, home_x, home_y) = (person.x, person.y, person.home_x, person.home_y);
        let lineage = person.lineage_id;
        let age = person.age;
        let max_age = person.max_age;
        let traits = person.traits.clone();
        let years = YEAR_LENGTH_TICKS as u32;
        let id = seeded_id(&mut self.rng, 8);
        let name = generate_name(&mut self.rng, Sex::Female);
        let mut mother = Organism::new(
            id,
            name,
            x,
            y,
            0,
            String::new(),
            lineage,
            max_age.saturating_add(years.saturating_mul(PARENT_YEARS + 15)),
            traits,
        );
        mother.age = age.saturating_add(years.saturating_mul(PARENT_YEARS));
        mother.alive = false;
        mother.health = 0.0;
        mother.sex = Sex::Female;
        mother.home_x = home_x;
        mother.home_y = home_y;
        mother.vocabulary = proto.clone();
        mother.remember_speech = true;
        let mother_id = mother.id.to_string();
        self.organisms.push(mother);
        self.organisms[child].parent_id = mother_id;
    }
}

/// One shared language, then each tribe changes the words for the land it
/// stands on, plus one more so two tribes on the same land still differ.
fn drifted_vocabularies(proto: &Vocabulary, tribes: &[Tribe], rng: &mut impl rand::Rng) -> Vec<Vocabulary> {
    tribes
        .iter()
        .enumerate()
        .map(|(index, tribe)| {
            let mut words = proto.clone();
            for concept in drift_concepts(tribe.biome, index) {
                words.drift_concept(concept, rng);
            }
            words
        })
        .collect()
}

fn drift_concepts(biome: Biome, salt: usize) -> Vec<&'static str> {
    let mut concepts = biome_words(biome);
    let extra = FAMILY_WORD_CONCEPTS[salt % FAMILY_WORD_CONCEPTS.len()];
    if !concepts.contains(&extra) {
        concepts.push(extra);
    } else {
        let next = FAMILY_WORD_CONCEPTS[(salt + 3) % FAMILY_WORD_CONCEPTS.len()];
        if !concepts.contains(&next) {
            concepts.push(next);
        }
    }
    concepts
}

/// The words a tribe is likely to reshape because of where it lives.
fn biome_words(biome: Biome) -> Vec<&'static str> {
    match biome {
        Biome::Wetland => vec!["water", "river"],
        Biome::Desert | Biome::Badlands => vec!["fire", "sun"],
        Biome::Tundra | Biome::Taiga => vec!["fire", "home"],
        Biome::Forest | Biome::Jungle => vec!["home", "friend"],
        Biome::Volcanic => vec!["fire", "danger"],
        Biome::Grassland | Biome::Savanna => vec!["food", "home"],
    }
}

/// The closest camps, preferring two that live on different land when one
/// such pair sits near that closest distance.
fn neighbour_pair(tribes: &[Tribe]) -> (usize, usize) {
    let mut pairs = Vec::new();
    for left in 0..tribes.len() {
        for right in (left + 1)..tribes.len() {
            let distance = (tribes[left].x - tribes[right].x).det_hypot(tribes[left].y - tribes[right].y);
            let different_land = tribes[left].biome != tribes[right].biome;
            pairs.push((left, right, distance, different_land));
        }
    }
    pairs.sort_by(|a, b| a.2.total_cmp(&b.2).then(a.0.cmp(&b.0)).then(a.1.cmp(&b.1)));
    let closest = pairs[0].2;
    let nearby = closest * 1.35 + 8.0;
    pairs
        .iter()
        .filter(|pair| pair.3 && pair.2 <= nearby)
        .min_by(|a, b| a.2.total_cmp(&b.2).then(a.0.cmp(&b.0)).then(a.1.cmp(&b.1)))
        .map(|pair| (pair.0, pair.1))
        .unwrap_or((pairs[0].0, pairs[0].1))
}

fn separate_neighbours(spoken: &mut [Vocabulary], left: usize, right: usize, rng: &mut impl rand::Rng) {
    if family_words_differ(&spoken[left], &spoken[right]) {
        return;
    }
    for _ in 0..8 {
        spoken[right].drift_concept("food", rng);
        if spoken[left].word("food") != spoken[right].word("food") {
            return;
        }
    }
}

fn family_words_differ(left: &Vocabulary, right: &Vocabulary) -> bool {
    FAMILY_WORD_CONCEPTS
        .iter()
        .any(|concept| left.word(concept) != right.word(concept))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::family_words::family_words;
    use std::collections::BTreeMap;

    fn camps(sim: &Simulation) -> BTreeMap<String, Vec<usize>> {
        let mut members: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (index, person) in sim.organisms.iter().enumerate() {
            if person.alive {
                members
                    .entry(person.lineage_id.to_string())
                    .or_default()
                    .push(index);
            }
        }
        members
    }

    fn camp_home(sim: &Simulation, members: &[usize]) -> (f32, f32) {
        let person = &sim.organisms[members[0]];
        (person.home_x, person.home_y)
    }

    fn majority_word(sim: &Simulation, members: &[usize], concept: &str) -> Option<String> {
        let mut counts: BTreeMap<&str, (usize, usize)> = BTreeMap::new();
        for (order, &index) in members.iter().enumerate() {
            if let Some(word) = sim.organisms[index].vocabulary.known_word(concept) {
                let entry = counts.entry(word).or_insert((0, order));
                entry.0 += 1;
                entry.1 = entry.1.min(order);
            }
        }
        counts
            .into_iter()
            .max_by(|a, b| a.1 .0.cmp(&b.1 .0).then(b.1 .1.cmp(&a.1 .1)))
            .map(|(word, _)| word.to_string())
    }

    fn closest_camps(sim: &Simulation) -> (Vec<usize>, Vec<usize>) {
        let camps = camps(sim);
        let names: Vec<&String> = camps.keys().collect();
        let mut best: Option<(usize, usize)> = None;
        for left in 0..names.len() {
            for right in (left + 1)..names.len() {
                let closer = match best {
                    Some((a, b)) => {
                        let (ax, ay) = camp_home(sim, &camps[names[a]]);
                        let (bx, by) = camp_home(sim, &camps[names[b]]);
                        let (cx, cy) = camp_home(sim, &camps[names[left]]);
                        let (dx, dy) = camp_home(sim, &camps[names[right]]);
                        let have = (ax - bx).det_hypot(ay - by);
                        let next = (cx - dx).det_hypot(cy - dy);
                        next.total_cmp(&have).is_lt()
                    }
                    None => true,
                };
                if closer {
                    best = Some((left, right));
                }
            }
        }
        let (left, right) = best.expect("two tribes");
        (camps[names[left]].clone(), camps[names[right]].clone())
    }

    fn shows_drift(sim: &Simulation, index: usize) -> bool {
        let person = &sim.organisms[index];
        let rows = family_words(person, &sim.organisms);
        let Some(mother) = rows.iter().find(|row| row.relation == "mother" && row.remembered) else {
            return false;
        };
        FAMILY_WORD_CONCEPTS.iter().any(|concept| {
            let own = person.vocabulary.known_word(concept);
            let theirs = mother.vocabulary.get(*concept).map(String::as_str);
            matches!((own, theirs), (Some(child), Some(parent)) if child != parent)
        })
    }

    #[test]
    fn a_plain_world_still_starts_at_year_one_with_no_remembered_parents() {
        for seed in [1_u64, 42, 99] {
            let sim = Simulation::new(seed);
            assert_eq!(sim.tick_count, 0, "seed {seed}");
            assert!(
                sim.organisms
                    .iter()
                    .all(|person| person.alive && person.parent_id.is_empty()),
                "seed {seed} changed the year-one start"
            );
        }
    }

    #[test]
    fn a_head_start_keeps_the_same_people_and_moves_their_language_forward() {
        for seed in [1_u64, 42, 99, 2_026] {
            let plain = Simulation::new(seed);
            let head = Simulation::new_head_start(seed);
            assert_eq!(head.tick_count, 0, "seed {seed} left year one");
            let living: Vec<_> = head.organisms.iter().filter(|person| person.alive).collect();
            assert_eq!(living.len(), plain.organisms.len(), "seed {seed}");
            for (before, after) in plain.organisms.iter().zip(living) {
                assert_eq!(before.id, after.id, "seed {seed}");
                assert_eq!((before.x, before.y), (after.x, after.y), "seed {seed}");
                assert_eq!(before.lineage_id, after.lineage_id, "seed {seed}");
            }
            assert!(head.organisms.len() > plain.organisms.len(), "seed {seed}");

            let (left_members, right_members) = closest_camps(&head);
            let mut shared = 0;
            let mut apart = 0;
            for concept in FAMILY_WORD_CONCEPTS {
                let left = majority_word(&head, &left_members, concept);
                let right = majority_word(&head, &right_members, concept);
                if left.is_some() && left == right {
                    shared += 1;
                } else if left.is_some() && right.is_some() {
                    apart += 1;
                }
            }
            assert!(
                apart >= 1,
                "seed {seed}: neighbouring tribes still say every word the same"
            );
            assert!(shared >= 1, "seed {seed}: neighbouring tribes share no word");
            assert!(
                left_members
                    .iter()
                    .chain(right_members.iter())
                    .all(|&index| shows_drift(&head, index)),
                "seed {seed}: word history does not show the drift"
            );
        }
    }

    #[test]
    fn the_same_seed_plants_the_same_head_start_and_a_save_keeps_it() {
        let once = Simulation::new_head_start(42);
        let twice = Simulation::new_head_start(42);
        let words = |sim: &Simulation| {
            sim.organisms
                .iter()
                .map(|person| {
                    (
                        person.id.to_string(),
                        person.alive,
                        person.parent_id.clone(),
                        FAMILY_WORD_CONCEPTS
                            .iter()
                            .map(|concept| person.vocabulary.word(concept).unwrap_or("").to_string())
                            .collect::<Vec<_>>(),
                    )
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(words(&once), words(&twice));

        let restored = Simulation::from_save(once.world_seed, once.to_save_state());
        assert_eq!(words(&once), words(&restored));
        let child = restored
            .organisms
            .iter()
            .position(|person| person.alive && !person.parent_id.is_empty())
            .expect("a child");
        assert!(shows_drift(&restored, child));
    }
}
