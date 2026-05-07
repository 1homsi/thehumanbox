#[path = "../world/mod.rs"]    mod world;
#[path = "../organism/mod.rs"] mod organism;
#[path = "../physics/mod.rs"]  mod physics;
#[path = "../sim/mod.rs"]      mod sim;

use sim::simulation::Simulation;
use std::collections::HashMap;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seed: u64 = args.iter()
        .position(|a| a == "--seed").and_then(|i| args.get(i+1))
        .and_then(|s| s.parse().ok()).unwrap_or(42);
    let max_ticks: u64 = args.iter()
        .position(|a| a == "--ticks").and_then(|i| args.get(i+1))
        .and_then(|s| s.parse().ok()).unwrap_or(60_000);
    let print_every: u64 = args.iter()
        .position(|a| a == "--every").and_then(|i| args.get(i+1))
        .and_then(|s| s.parse().ok()).unwrap_or(6_000);  // default 1 in-world day

    println!("headless  seed={}  max_ticks={}  print_every={}", seed, max_ticks, print_every);
    println!("{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6} {:>8}",
        "tick", "alive", "births", "fire", "shelter", "lineages", "starv", "dehy", "sick", "events");
    println!("{}", "-".repeat(80));

    let mut sim = Simulation::new(seed);
    let mut peak_pop = 0usize;
    let mut thought_freq: HashMap<String, u64> = HashMap::new();

    while sim.tick_count < max_ticks {
        sim.tick();
        let t = sim.tick_count;

        let alive = sim.organisms.iter().filter(|o| o.alive).count();
        if alive > peak_pop { peak_pop = alive; }

        // Tally thoughts
        for org in sim.organisms.iter().filter(|o| o.alive) {
            *thought_freq.entry(org.thought.clone()).or_insert(0) += 1;
        }

        if t % print_every == 0 {
            let fire_count    = sim.organisms.iter().filter(|o| o.alive && o.discoveries.contains(&"fire".to_string())).count();
            let shelter_count = sim.organisms.iter().filter(|o| o.alive && o.discoveries.contains(&"shelter".to_string())).count();
            let lineage_count: std::collections::HashSet<&str> = sim.organisms.iter()
                .filter(|o| o.alive).map(|o| o.lineage_id.as_str()).collect();
            let h = &sim.history;
            println!("{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6} {:>8}",
                t, alive, h.births,
                fire_count, shelter_count, lineage_count.len(),
                h.deaths_starvation, h.deaths_dehydration, h.deaths_sickness,
                sim.events.len(),
            );
        }
    }

    // Final summary
    println!("\n=== SUMMARY ===");
    println!("ticks run:   {}", sim.tick_count);
    println!("peak pop:    {}", peak_pop);
    println!("final alive: {}", sim.organisms.iter().filter(|o| o.alive).count());
    let h = &sim.history;
    println!("births:      {}  |  deaths: old={} starv={} dehy={} sick={} combat={}",
        h.births, h.deaths_old_age, h.deaths_starvation, h.deaths_dehydration,
        h.deaths_sickness, h.deaths_combat);
    println!("alliances:   {}  challenges: {}  gifts: {}",
        h.alliances_formed, h.challenges_total, h.gifts_total);
    println!("droughts:    {}  outbreaks: {}", h.droughts, h.outbreaks);

    // Top thoughts (behavior fingerprint)
    let mut freq_vec: Vec<(String, u64)> = thought_freq.into_iter().collect();
    freq_vec.sort_by(|a, b| b.1.cmp(&a.1));
    println!("\nTop behaviors (thought frequency across all organism-ticks):");
    for (thought, count) in freq_vec.iter().take(10) {
        println!("  {:>10}  {}", count, thought);
    }

    // Fire/shelter discoveries
    let fire_disc    = sim.organisms.iter().filter(|o| o.discoveries.contains(&"fire".to_string())).count();
    let shelter_disc = sim.organisms.iter().filter(|o| o.discoveries.contains(&"shelter".to_string())).count();
    println!("\nDiscoveries (ever, alive+dead):  fire={}  shelter={}", fire_disc, shelter_disc);

    // Lineage survival
    let mut lineage_alive: HashMap<&str, usize> = HashMap::new();
    for org in sim.organisms.iter().filter(|o| o.alive) {
        *lineage_alive.entry(&org.lineage_id).or_insert(0) += 1;
    }
    let mut alive_lineages: Vec<(&str, usize)> = lineage_alive.into_iter().collect();
    alive_lineages.sort_by(|a, b| b.1.cmp(&a.1));
    println!("\nSurviving lineages:");
    for (lid, count) in alive_lineages.iter().take(8) {
        let avg_gen = sim.organisms.iter()
            .filter(|o| o.alive && o.lineage_id == *lid)
            .map(|o| o.generation as f32)
            .fold((0.0, 0.0), |(s, c), g| (s + g, c + 1.0));
        let gen_avg = if avg_gen.1 > 0.0 { avg_gen.0 / avg_gen.1 } else { 0.0 };
        println!("  {}…  count={}  avg_gen={:.1}", &lid[..lid.len().min(8)], count, gen_avg);
    }
}
