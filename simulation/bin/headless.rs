#[path = "../world/mod.rs"]    mod world;
#[path = "../organism/mod.rs"] mod organism;
#[path = "../physics/mod.rs"]  mod physics;
#[path = "../sim/mod.rs"]      mod sim;

use sim::simulation::Simulation;
use serde_json::json;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufWriter, Write};

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
    let trace_out = args.iter()
        .position(|a| a == "--trace-out").and_then(|i| args.get(i+1))
        .cloned();
    let trace_every: u64 = args.iter()
        .position(|a| a == "--trace-every").and_then(|i| args.get(i+1))
        .and_then(|s| s.parse().ok()).unwrap_or(200);
    let trace_limit: usize = args.iter()
        .position(|a| a == "--trace-limit").and_then(|i| args.get(i+1))
        .and_then(|s| s.parse().ok()).unwrap_or(0);
    // --gate: exit non-zero if any seed's verdict is not Healthy. For CI use.
    let gate = args.iter().any(|a| a == "--gate");

    if sweep_seeds > 0 {
        let unhealthy = run_seed_sweep(seed, sweep_seeds, max_ticks);
        if gate && unhealthy > 0 {
            eprintln!("\nVIABILITY GATE FAILED: {} unhealthy seed(s)", unhealthy);
            std::process::exit(1);
        }
        return;
    }

    println!("headless  seed={}  max_ticks={}  print_every={}", seed, max_ticks, print_every);
    println!("{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6}",
        "tick", "alive", "births", "animals", "fire", "shelter", "lineages", "starv", "dehy", "sick");
    println!("{}", "-".repeat(80));

    let mut sim = Simulation::new(seed);
    let mut peak_pop = 0usize;
    let mut thought_freq: HashMap<String, u64> = HashMap::new();
    let mut trace_writer = trace_out.as_ref().map(|path| {
        let file = File::create(path).unwrap_or_else(|err| {
            panic!("failed to create trace file {}: {}", path, err);
        });
        BufWriter::new(file)
    });

    let mut tick_times_us: Vec<u64> = Vec::new();
    let mut json_sizes_bytes: Vec<usize> = Vec::new();

    while sim.tick_count < max_ticks {
        let t0 = std::time::Instant::now();
        sim.tick();
        tick_times_us.push(t0.elapsed().as_micros() as u64);
        let t = sim.tick_count;

        let alive = sim.organisms.iter().filter(|o| o.alive).count();
        if alive > peak_pop { peak_pop = alive; }

        if let Some(writer) = trace_writer.as_mut() {
            if trace_every > 0 && t % trace_every == 0 {
                write_trace_rows(&sim, writer, trace_limit);
            }
        }

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
    if let Some(writer) = trace_writer.as_mut() {
        writer.flush().ok();
    }
}

fn infer_event_type(org: &organism::organism::Organism) -> &'static str {
    let thought = org.thought.to_lowercase();
    let last_log = org.life_log.back().map(|s| s.to_lowercase()).unwrap_or_default();
    let text = if !last_log.is_empty() { last_log.as_str() } else { thought.as_str() };

    if text.contains("danger") || text.contains("fire") || text.contains("struggling") {
        "danger"
    } else if text.contains("migrat") || text.contains("distant land") || text.contains("wandering") {
        "migration"
    } else if text.contains("teach") || text.contains("bond") || text.contains("fed by kin") {
        "social"
    } else if text.contains("remember") || text.contains("mourn") {
        "memory"
    } else if text.contains("drink") || text.contains("water") {
        "water"
    } else if text.contains("eat") || text.contains("food") || text.contains("hunt") {
        "food"
    } else {
        "thought"
    }
}

fn write_trace_rows(
    sim: &Simulation,
    writer: &mut BufWriter<File>,
    trace_limit: usize,
) {
    let season = sim.season().to_string();
    let weather = sim.weather.kind;
    let mut written = 0usize;

    for org in sim.organisms.iter().filter(|o| o.alive) {
        if trace_limit > 0 && written >= trace_limit {
            break;
        }
        let row = json!({
            "tick": sim.tick_count,
            "organism_id": org.id,
            "organism_name": org.name,
            "lineage_id": org.lineage_id,
            "generation": org.generation,
            "event_type": infer_event_type(org),
            "text": org.thought,
            "context_text": org.life_log.back().cloned().unwrap_or_default(),
            "position": {
                "x": org.x,
                "y": org.y,
            },
            "state": {
                "energy": org.energy,
                "hydration": org.hydration,
                "health": org.health,
                "fear": org.fear_level,
                "curiosity": org.traits.curiosity,
                "comfort": org.comfort,
                "loneliness": org.loneliness,
            },
            "world": {
                "season": season,
                "weather": weather,
                "era": sim.current_era,
            },
            "discoveries": org.discoveries.iter().cloned().collect::<Vec<_>>(),
        });
        serde_json::to_writer(&mut *writer, &row).expect("failed to write trace row");
        writer.write_all(b"\n").expect("failed to write trace newline");
        written += 1;
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
    /// Sample of alive count every 1000 ticks. Used by the viability gate.
    alive_samples: Vec<usize>,
    /// Sample of distinct alive lineages every 1000 ticks.
    lineage_samples: Vec<usize>,
    ticks_run: u64,
    verdict: Verdict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verdict {
    Healthy,
    Extinct,        // hit zero alive
    Runaway,        // sat at MAX_POPULATION for too long - indicates unbounded growth being clamped
    Stagnant,       // population never recovered to a viable level
    Homogenized,    // diversity collapsed - survivors all from one or two lineages
}

impl Verdict {
    fn label(self) -> &'static str {
        match self {
            Verdict::Healthy     => "HEALTHY",
            Verdict::Extinct     => "EXTINCT",
            Verdict::Runaway     => "RUNAWAY",
            Verdict::Stagnant    => "STAGNANT",
            Verdict::Homogenized => "HOMOGEN",
        }
    }
    fn is_unhealthy(self) -> bool { self != Verdict::Healthy }
}

/// Classify a finished run.
///
/// Rules (first match wins):
///   1. Extinct: any sample reached 0 - already captured by extinction_tick.
///   2. Runaway: more than 60% of samples were at MAX_POPULATION (= 200). The cap
///      is hiding what would otherwise be exponential growth - symptom of broken
///      mortality or food economy.
///   3. Stagnant: peak across all samples never reached 30, OR mean alive across
///      the second half of the run was < 15. The world settled at a non-viable
///      ebb that recovery_mode can't lift.
///   4. Homogenized: ran for at least 30k ticks AND fewer than 3 lineages survived
///      at the end (started with 12 founding tribes). Cultural-genetic collapse.
///   5. Otherwise: Healthy.
fn classify(
    extinction_tick: Option<u64>,
    alive_samples: &[usize],
    lineage_samples: &[usize],
    ticks_run: u64,
    surviving_lineages: usize,
) -> Verdict {
    const MAX_POP: usize = 300; // matches sim::config::MAX_POPULATION
    if extinction_tick.is_some() { return Verdict::Extinct; }
    if alive_samples.is_empty()  { return Verdict::Healthy; }

    let cap_count = alive_samples.iter().filter(|&&a| a >= MAX_POP).count();
    if cap_count * 100 / alive_samples.len().max(1) > 60 {
        return Verdict::Runaway;
    }

    let peak = *alive_samples.iter().max().unwrap_or(&0);
    let half = alive_samples.len() / 2;
    let second_half_mean = if alive_samples.len() > half {
        alive_samples[half..].iter().sum::<usize>() / (alive_samples.len() - half).max(1)
    } else { 0 };
    if peak < 30 || second_half_mean < 15 {
        return Verdict::Stagnant;
    }

    // Lineage homogenization only meaningful in long runs - early sweeps are noisy.
    if ticks_run >= 30_000 && surviving_lineages < 3 {
        // Suppress the verdict if even the latest snapshot showed > 3 lineages -
        // a single late-game collapse is not "homogenized".
        let last_lineage = lineage_samples.last().copied().unwrap_or(0);
        if last_lineage < 3 {
            return Verdict::Homogenized;
        }
    }

    Verdict::Healthy
}

fn run_one_seed(seed: u64, max_ticks: u64) -> SweepResult {
    let mut sim = Simulation::new(seed);
    let mut peak_pop = 0usize;
    let mut extinction_tick = None;
    let mut alive_samples   = Vec::new();
    let mut lineage_samples = Vec::new();

    while sim.tick_count < max_ticks {
        sim.tick();
        let alive = sim.organisms.iter().filter(|o| o.alive).count();
        peak_pop = peak_pop.max(alive);

        // Sample every 1000 ticks for viability classification.
        if sim.tick_count % 1000 == 0 {
            alive_samples.push(alive);
            let lineages = sim.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| o.lineage_id.as_str())
                .collect::<std::collections::HashSet<_>>()
                .len();
            lineage_samples.push(lineages);
        }

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
    let ticks_run = sim.tick_count;
    let verdict = classify(
        extinction_tick, &alive_samples, &lineage_samples, ticks_run, surviving_lineages,
    );

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
        alive_samples,
        lineage_samples,
        ticks_run,
        verdict,
    }
}

fn run_seed_sweep(start_seed: u64, sweep_seeds: usize, max_ticks: u64) -> usize {
    println!("seed_sweep  start_seed={}  seeds={}  max_ticks={}", start_seed, sweep_seeds, max_ticks);
    println!("{:<8} {:<10} {:>7} {:>7} {:>10} {:>8} {:>7} {:>6} {:>6} {:>6} {:>6} {:>8}",
        "seed", "verdict", "alive", "peak", "extinct_at", "births", "old", "starv", "dehy", "sick", "combat", "lineages");
    println!("{}", "-".repeat(108));

    let mut results = Vec::with_capacity(sweep_seeds);
    for offset in 0..sweep_seeds {
        let seed = start_seed + offset as u64;
        let r = run_one_seed(seed, max_ticks);
        println!("{:<8} {:<10} {:>7} {:>7} {:>10} {:>8} {:>7} {:>6} {:>6} {:>6} {:>6} {:>8}",
            r.seed,
            r.verdict.label(),
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
    let unhealthy = results.iter().filter(|r| r.verdict.is_unhealthy()).count();
    let avg_final = results.iter().map(|r| r.final_alive as f64).sum::<f64>() / results.len().max(1) as f64;
    let avg_peak = results.iter().map(|r| r.peak_pop as f64).sum::<f64>() / results.len().max(1) as f64;
    println!("\n=== SWEEP SUMMARY ===");
    println!("verdict counts:");
    for v in &[Verdict::Healthy, Verdict::Extinct, Verdict::Runaway, Verdict::Stagnant, Verdict::Homogenized] {
        let n = results.iter().filter(|r| r.verdict == *v).count();
        if n > 0 {
            println!("  {:<10} {} / {}", v.label(), n, results.len());
        }
    }
    println!("extinctions:     {} / {}", extinct, results.len());
    println!("unhealthy:       {} / {}", unhealthy, results.len());
    println!("avg final alive: {:.1}", avg_final);
    println!("avg peak pop:    {:.1}", avg_peak);
    unhealthy
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

    #[test]
    fn classify_extinct_when_extinction_tick_set() {
        let v = classify(Some(5_000), &[100, 80, 50, 0], &[12, 10, 8, 0], 5_000, 0);
        assert_eq!(v, Verdict::Extinct);
    }

    #[test]
    fn classify_runaway_when_capped_at_max_pop_majority_of_run() {
        // 300 = MAX_POPULATION; 8 of 10 samples capped → 80% > 60% threshold
        let samples = vec![250, 300, 300, 300, 300, 300, 300, 300, 300, 280];
        let v = classify(None, &samples, &[12; 10], 60_000, 8);
        assert_eq!(v, Verdict::Runaway);
    }

    #[test]
    fn classify_stagnant_when_peak_under_30() {
        let samples = vec![25, 22, 20, 18, 15, 12, 10, 9];
        let v = classify(None, &samples, &[6; 8], 60_000, 4);
        assert_eq!(v, Verdict::Stagnant);
    }

    #[test]
    fn classify_stagnant_when_second_half_collapses() {
        // First half healthy, second half barely surviving
        let samples = vec![80, 90, 85, 70, 14, 12, 10, 11];
        let v = classify(None, &samples, &[8; 8], 60_000, 5);
        assert_eq!(v, Verdict::Stagnant);
    }

    #[test]
    fn classify_homogenized_when_lineages_collapse_in_long_run() {
        let samples = vec![80, 85, 90, 95, 100, 105];
        let lineages = vec![12, 10, 8, 5, 3, 2]; // collapses to 2 lineages
        let v = classify(None, &samples, &lineages, 60_000, 2);
        assert_eq!(v, Verdict::Homogenized);
    }

    #[test]
    fn classify_homogenized_only_after_long_run() {
        // Same lineage collapse but only ran 10k ticks - early sweeps are noisy
        let samples = vec![80, 85];
        let lineages = vec![12, 2];
        let v = classify(None, &samples, &lineages, 10_000, 2);
        assert_eq!(v, Verdict::Healthy, "short run shouldn't trigger homogenization verdict");
    }

    #[test]
    fn classify_healthy_when_population_is_stable() {
        let samples = vec![80, 90, 100, 110, 120, 115, 105, 100];
        let v = classify(None, &samples, &[10; 8], 60_000, 8);
        assert_eq!(v, Verdict::Healthy);
    }
}
