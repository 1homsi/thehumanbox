//! Before/after for the hot-column layout.
//!
//! Times the passes that moved onto columns (spatial rebuild, a neighbour
//! scan of the same shape as sensing, and velocity smoothing) against the
//! struct walk they replaced. Positions are not saved anywhere.
//!
//! ```text
//! cargo run --release -p sim-core --example soa_columns -- 4000 40
//! ```
use sim_core::organism::columns::OrganismColumns;
use sim_core::organism::organism::Organism;
use sim_core::organism::traits::Traits;
use sim_core::sim::spatial::SpatialIndex;
use std::time::Instant;

fn crowd(n: usize) -> Vec<Organism> {
    (0..n)
        .map(|i| {
            let mut person = Organism::new(
                format!("crowd-{i}"),
                "Resident".into(),
                40.0 + (i * 17 % 400) as f32,
                40.0 + (i * 7 % 200) as f32,
                1,
                String::new(),
                format!("clan-{}", i % 20),
                100_000,
                Traits::default(),
            );
            person.age = 4_000;
            person.alive = i % 15 != 0;
            person.prev_x = person.x - 0.4;
            person.prev_y = person.y + 0.2;
            person.vx_smooth = 0.1;
            person.vy_smooth = -0.05;
            person
        })
        .collect()
}

fn neighbour_touches_structs(people: &[Organism], index: &SpatialIndex) -> u64 {
    let mut near = Vec::new();
    let mut hits = 0u64;
    for (i, person) in people.iter().enumerate() {
        if !person.alive {
            continue;
        }
        index.query_into(person.x as i32, person.y as i32, 6, &mut near);
        for &j in &near {
            let other = &people[j];
            if j == i || !other.alive {
                continue;
            }
            let dist = (other.x - person.x).abs() + (other.y - person.y).abs();
            if dist <= 5.0 && other.lineage_id == person.lineage_id {
                hits += 1;
            }
        }
    }
    hits
}

fn neighbour_touches_columns(cols: &OrganismColumns, index: &SpatialIndex) -> u64 {
    let mut near = Vec::new();
    let mut hits = 0u64;
    let hot = cols.neighbours();
    for i in 0..cols.len() {
        if !hot.alive_at(i) {
            continue;
        }
        index.query_into(hot.x[i] as i32, hot.y[i] as i32, 6, &mut near);
        for &j in &near {
            if j == i || !hot.alive_at(j) {
                continue;
            }
            let dist = (hot.x[j] - hot.x[i]).abs() + (hot.y[j] - hot.y[i]).abs();
            if dist <= 5.0 && hot.lineage[j] == hot.lineage[i] {
                hits += 1;
            }
        }
    }
    hits
}

fn aos_pass(people: &mut [Organism]) -> u64 {
    let index = SpatialIndex::build(people, 10);
    let hits = neighbour_touches_structs(people, &index);
    // The old velocity loop, kept here so the example still times it.
    const ALPHA: f32 = 0.4;
    for person in people.iter_mut() {
        if !person.alive {
            continue;
        }
        let inst_vx = person.x - person.prev_x;
        let inst_vy = person.y - person.prev_y;
        person.prev_x = person.x;
        person.prev_y = person.y;
        if inst_vx.abs() > 2.0 || inst_vy.abs() > 2.0 {
            person.vx_smooth = 0.0;
            person.vy_smooth = 0.0;
            continue;
        }
        person.vx_smooth = ALPHA * inst_vx + (1.0 - ALPHA) * person.vx_smooth;
        person.vy_smooth = ALPHA * inst_vy + (1.0 - ALPHA) * person.vy_smooth;
    }
    hits
}

fn soa_pass(people: &mut [Organism], cols: &mut OrganismColumns) -> u64 {
    cols.sync_from(people);
    let index = SpatialIndex::build_columns(cols, 10);
    let hits = neighbour_touches_columns(cols, &index);
    cols.smooth_velocity(people);
    hits
}

fn main() {
    let count: usize = std::env::args().nth(1).unwrap_or("4000".into()).parse().unwrap();
    let iters: usize = std::env::args().nth(2).unwrap_or("30".into()).parse().unwrap();
    let mut people = crowd(count);
    let mut cols = OrganismColumns::new();
    // Warm both paths, and check they count the same neighbours before velocity diverges the inputs.
    let before = aos_pass(&mut people);
    people = crowd(count);
    let after = soa_pass(&mut people, &mut cols);
    assert_eq!(
        before, after,
        "column neighbour scan drifted from the struct scan"
    );

    people = crowd(count);
    let mut aos_hits = 0u64;
    let started = Instant::now();
    for _ in 0..iters {
        aos_hits += aos_pass(&mut people);
    }
    let aos_ns = started.elapsed().as_nanos();

    people = crowd(count);
    let mut soa_hits = 0u64;
    let started = Instant::now();
    for _ in 0..iters {
        soa_hits += soa_pass(&mut people, &mut cols);
    }
    let soa_ns = started.elapsed().as_nanos();
    assert_eq!(aos_hits, soa_hits);

    let aos_us = aos_ns as f64 / iters as f64 / 1_000.0;
    let soa_us = soa_ns as f64 / iters as f64 / 1_000.0;
    println!(
        "organisms {count}  iters {iters}\n\
         struct walk: {aos_us:.1} µs/pass\n\
         hot columns: {soa_us:.1} µs/pass\n\
         ratio: {:.2}x",
        aos_us / soa_us
    );
}
