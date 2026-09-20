//! Isolated native simulation benchmark; never loads or modifies a saved world.
use sim_core::organism::{organism::Organism, traits::Traits};
use sim_core::sim::simulation::Simulation;
use std::time::Instant;
fn main() {
    let count: usize = std::env::args().nth(1).unwrap_or("5000".into()).parse().unwrap();
    let mut sim = Simulation::new(42);
    sim.set_population_limit(count);
    sim.organisms.clear();
    for i in 0..count {
        let mut person = Organism::new(
            format!("crowd-{i}"),
            "Resident".into(),
            0.0,
            0.0,
            1,
            String::new(),
            format!("clan-{}", i % 20),
            100_000,
            Traits::default(),
        );
        person.age = 40_000;
        person.id = format!("crowd-{i}");
        person.x = 40.0 + (i * 17 % 400) as f32;
        person.y = 40.0 + (i * 7 % 200) as f32;
        sim.organisms.push(person);
    }
    let start = Instant::now();
    for _ in 0..30 {
        sim.tick();
    }
    println!(
        "{count} people: mean tick {:.2} ms",
        start.elapsed().as_secs_f64() * 1000.0 / 30.0
    );
    let start = Instant::now();
    let json = sim.state_json_incremental().to_string();
    println!(
        "incremental frame {:.2} ms, {} bytes",
        start.elapsed().as_secs_f64() * 1000.0,
        json.len()
    );
}
