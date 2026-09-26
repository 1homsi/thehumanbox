//! Isolated reproduction-phase benchmark; never loads or changes a saved world.
use rand::{rngs::StdRng, SeedableRng};
use sim_core::organism::{
    organism::{Organism, Sex},
    traits::Traits,
};
use sim_core::sim::{agents::growth, config::MAX_POPULATION_LIMIT};
use sim_core::world::{
    grid::WorldGrid,
    tiles::{Biome, Tile},
};
use std::{
    collections::VecDeque,
    hash::{DefaultHasher, Hash, Hasher},
    time::Instant,
};

fn main() {
    let count: usize = std::env::args().nth(1).unwrap_or("4000".into()).parse().unwrap();
    let rounds: usize = std::env::args().nth(2).unwrap_or("30".into()).parse().unwrap();
    assert!((80..MAX_POPULATION_LIMIT).contains(&count) && count.is_multiple_of(2));
    assert!(rounds > 0);
    let couples = count / 2;
    let mut grid = WorldGrid::new(42);
    grid.tiles.fill(Tile::Grass as i8);
    grid.biome.fill(Biome::Grassland as u8);
    grid.fertility.fill(0.75);
    let mut organisms = Vec::with_capacity(MAX_POPULATION_LIMIT);
    // Fathers follow all mothers in storage. One quarter of couples are nearby;
    // the others are separated, so failed distance checks must also stay cheap.
    for i in 0..count {
        let couple = i % couples;
        let female = i < couples;
        let mut person = Organism::new(
            format!("resident-{i}"),
            format!("Resident {i}"),
            50.0 + (couple % 100) as f32,
            if female {
                50.0
            } else if couple.is_multiple_of(4) {
                55.0
            } else {
                150.0
            },
            1,
            String::new(),
            format!("clan-{}", couple % 20),
            100_000,
            Traits::default(),
        );
        person.age = 4_000;
        person.sex = if female { Sex::Female } else { Sex::Male };
        person.partner_id = Some(format!("resident-{}", (i + couples) % count));
        organisms.push(person);
    }
    let initial_lineages = growth::lineage_population_slots(&organisms);
    // The main simulation already builds this once before resident decisions.
    let org_idx_by_id = organisms
        .iter()
        .enumerate()
        .map(|(i, o)| (o.id.clone(), i))
        .collect();
    let mut events = VecDeque::new();
    let mut times = Vec::with_capacity(rounds);
    let mut pregnancies = 0;
    let mut outcomes = DefaultHasher::new();
    for round in 0..rounds {
        organisms.truncate(count);
        for person in &mut organisms[..couples] {
            person.energy = 1.0;
            person.hydration = 1.0;
            person.last_reproduced = 0;
            person.pregnant = false;
            person.joy_ticks = 0;
        }
        events.clear();
        let mut lineage_counts = initial_lineages.clone();
        let mut rng = StdRng::seed_from_u64(42 + round as u64);
        let start = Instant::now();
        for i in 0..count {
            let previous_len = organisms.len();
            growth::try_reproduce(
                i,
                &mut organisms,
                &grid,
                4_000,
                &mut events,
                &mut rng,
                growth::ReproductionPopulation {
                    slots_used: previous_len,
                    limit: MAX_POPULATION_LIMIT,
                    lineage_counts: &lineage_counts,
                    org_idx_by_id: &org_idx_by_id,
                },
            );
            if organisms.len() > previous_len {
                *lineage_counts.entry(organisms[i].lineage_id.clone()).or_default() += 1;
            }
        }
        times.push(start.elapsed().as_secs_f64() * 1000.0);
        pregnancies += organisms.len() - count;
        // Exclude random UUIDs and unordered sets. Compare outcomes between
        // baseline and changed binaries without timing serialization work.
        for child in &organisms[count..] {
            let mut attributes: Vec<_> = child.attributes.iter().collect();
            attributes.sort();
            serde_json::json!({
                "mother": child.parent_id,
                "father": child.father_id,
                "name": child.name,
                "sex": child.sex,
                "traits": child.traits,
                "attributes": attributes,
                "max_age": child.max_age,
                "position": [child.x, child.y],
            })
            .to_string()
            .hash(&mut outcomes);
        }
    }
    let mean = times.iter().sum::<f64>() / rounds as f64;
    times.sort_by(f64::total_cmp);
    println!(
        "{count} people, {rounds} rounds: reproduction mean {mean:.3} ms, median {:.3} ms",
        times[rounds / 2]
    );
    println!(
        "{pregnancies} pregnancies, outcome fingerprint {:016x}",
        outcomes.finish()
    );
}
