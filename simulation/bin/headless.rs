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
    let sweep_seeds: usize = args.iter()
        .position(|a| a == "--sweep-seeds").and_then(|i| args.get(i+1))
        .and_then(|s| s.parse().ok()).unwrap_or(0);

    if sweep_seeds > 0 {
        run_seed_sweep(seed, sweep_seeds, max_ticks);
        return;
    }

    println!("headless  seed={}  max_ticks={}  print_every={}", seed, max_ticks, print_every);
    println!("{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6}",
        "tick", "alive", "births", "animals", "fire", "shelter", "lineages", "starv", "dehy", "sick");
    println!("{}", "-".repeat(80));

    let mut sim = Simulation::new(seed);
    let mut peak_pop = 0usize;
    let mut thought_freq: HashMap<String, u64> = HashMap::new();

    let mut tick_times_us: Vec<u64> = Vec::new();
    let mut json_sizes_bytes: Vec<usize> = Vec::new();

    while sim.tick_count < max_ticks {
        let t0 = std::time::Instant::now();
        sim.tick();
        tick_times_us.push(t0.elapsed().as_micros() as u64);
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
            let animal_count  = sim.animals.iter().filter(|a| a.alive).count();
            let lineage_count: std::collections::HashSet<&str> = sim.organisms.iter()
                .filter(|o| o.alive).map(|o| o.lineage_id.as_str()).collect();
            let h = &sim.history;
            println!("{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6}",
                t, alive, h.births, animal_count,
                fire_count, shelter_count, lineage_count.len(),
                h.deaths_starvation, h.deaths_dehydration, h.deaths_sickness,
            );

            let json_bytes = sim.state_json().to_string().len();
            json_sizes_bytes.push(json_bytes);
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

    // Fire/shelter/hunt discoveries
    let fire_disc    = sim.organisms.iter().filter(|o| o.discoveries.contains(&"fire".to_string())).count();
    let shelter_disc = sim.organisms.iter().filter(|o| o.discoveries.contains(&"shelter".to_string())).count();
    let hunt_disc    = sim.organisms.iter().filter(|o| o.discoveries.contains(&"hunt".to_string())).count();
    let medicine_disc = sim.organisms.iter().filter(|o| o.discoveries.contains(&"medicine".to_string())).count();
    println!("\nDiscoveries (ever, alive+dead):  fire={}  shelter={}  hunt={}  medicine={}",
        fire_disc, shelter_disc, hunt_disc, medicine_disc);
    println!("Animals alive at end: {}", sim.animals.iter().filter(|a| a.alive).count());

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

    // Performance report
    if !tick_times_us.is_empty() {
        let mut sorted_us = tick_times_us.clone();
        sorted_us.sort_unstable();
        let n = sorted_us.len();
        let mean_us  = sorted_us.iter().sum::<u64>() / n as u64;
        let p50      = sorted_us[n * 50 / 100];
        let p95      = sorted_us[n * 95 / 100];
        let p99      = sorted_us[n * 99 / 100];
        let max_us   = *sorted_us.last().unwrap();
        let total_ms = tick_times_us.iter().sum::<u64>() / 1000;
        println!("\n=== TICK TIMING ({} ticks) ===", n);
        println!("  mean={:>6}µs  p50={:>6}µs  p95={:>6}µs  p99={:>6}µs  max={:>7}µs",
            mean_us, p50, p95, p99, max_us);
        println!("  total wall: {}ms  ({:.0} ticks/s)",
            total_ms, n as f64 / (total_ms as f64 / 1000.0));
    }
    if !json_sizes_bytes.is_empty() {
        let avg_kb = json_sizes_bytes.iter().sum::<usize>() / json_sizes_bytes.len() / 1024;
        let max_kb = json_sizes_bytes.iter().max().copied().unwrap_or(0) / 1024;
        println!("\n=== WS PAYLOAD ESTIMATE ===");
        println!("  avg={} KB   max={} KB   samples={}", avg_kb, max_kb, json_sizes_bytes.len());
        println!("  at 10 tps: ~{} KB/s per client", avg_kb * 10);
    }
}

struct SweepResult {
    seed: u64,
    final_alive: usize,
    peak_pop: usize,
    extinction_tick: Option<u64>,
    births: u64,
    deaths_old_age: u64,
    deaths_starvation: u64,
    deaths_dehydration: u64,
    deaths_sickness: u64,
    deaths_combat: u64,
    surviving_lineages: usize,
}

fn run_one_seed(seed: u64, max_ticks: u64) -> SweepResult {
    let mut sim = Simulation::new(seed);
    let mut peak_pop = 0usize;
    let mut extinction_tick = None;

    while sim.tick_count < max_ticks {
        sim.tick();
        let alive = sim.organisms.iter().filter(|o| o.alive).count();
        peak_pop = peak_pop.max(alive);
        if alive == 0 {
            extinction_tick = Some(sim.tick_count);
            break;
        }
    }

    let final_alive = sim.organisms.iter().filter(|o| o.alive).count();
    let surviving_lineages = sim.organisms.iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect::<std::collections::HashSet<_>>()
        .len();
    let h = &sim.history;

    SweepResult {
        seed,
        final_alive,
        peak_pop,
        extinction_tick,
        births: h.births,
        deaths_old_age: h.deaths_old_age,
        deaths_starvation: h.deaths_starvation,
        deaths_dehydration: h.deaths_dehydration,
        deaths_sickness: h.deaths_sickness,
        deaths_combat: h.deaths_combat,
        surviving_lineages,
    }
}

fn run_seed_sweep(start_seed: u64, sweep_seeds: usize, max_ticks: u64) {
    println!("seed_sweep  start_seed={}  seeds={}  max_ticks={}", start_seed, sweep_seeds, max_ticks);
    println!("{:<12} {:>7} {:>7} {:>10} {:>8} {:>7} {:>6} {:>6} {:>6} {:>6} {:>8}",
        "seed", "alive", "peak", "extinct_at", "births", "old", "starv", "dehy", "sick", "combat", "lineages");
    println!("{}", "-".repeat(96));

    let mut results = Vec::with_capacity(sweep_seeds);
    for offset in 0..sweep_seeds {
        let seed = start_seed + offset as u64;
        let r = run_one_seed(seed, max_ticks);
        println!("{:<12} {:>7} {:>7} {:>10} {:>8} {:>7} {:>6} {:>6} {:>6} {:>6} {:>8}",
            r.seed,
            r.final_alive,
            r.peak_pop,
            r.extinction_tick.map(|t| t.to_string()).unwrap_or_else(|| "-".to_string()),
            r.births,
            r.deaths_old_age,
            r.deaths_starvation,
            r.deaths_dehydration,
            r.deaths_sickness,
            r.deaths_combat,
            r.surviving_lineages,
        );
        results.push(r);
    }

    let extinct = results.iter().filter(|r| r.extinction_tick.is_some()).count();
    let avg_final = results.iter().map(|r| r.final_alive as f64).sum::<f64>() / results.len().max(1) as f64;
    let avg_peak = results.iter().map(|r| r.peak_pop as f64).sum::<f64>() / results.len().max(1) as f64;
    println!("\n=== SWEEP SUMMARY ===");
    println!("extinctions: {} / {}", extinct, results.len());
    println!("avg final alive: {:.1}", avg_final);
    println!("avg peak pop:    {:.1}", avg_peak);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_seed_sweep_reports_initial_population_without_advancing() {
        let r = run_one_seed(42, 0);

        assert_eq!(r.seed, 42);
        assert!(r.final_alive > 0);
        assert_eq!(r.extinction_tick, None);
        assert_eq!(r.peak_pop, 0);
    }
}
