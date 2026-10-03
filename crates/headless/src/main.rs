#![allow(clippy::needless_range_loop, clippy::explicit_counter_loop)]

// Sim core comes from the shared `sim-core` crate now (no more #[path]
// includes that recompiled the core into this binary separately).
// Re-export at the crate root so both bare (`world::grid`) and qualified
// (`crate::world::grid`) paths in this file keep resolving.
pub use sim_core::{organism, physics, sim, world};

use serde_json::json;
use sim::simulation::Simulation;
// Ordered maps: the report sorts by count, and ties then list by name
// instead of hash order, so two runs of one seed print identically.
use std::collections::{BTreeMap as HashMap, BTreeSet as HashSet};
use std::fs::File;
use std::io::{BufWriter, Write};
use world::grid::{WorldGrid, HEIGHT, WIDTH};
use world::tiles::{Biome, Tile};

mod args;
mod report;
mod rows;
mod rss;
mod sweep;
#[cfg(test)]
mod tests;
mod trace;
mod world_report;

use args::Args;
use report::*;
use rows::*;
use rss::*;
use sweep::*;
use trace::*;
use world_report::*;

fn main() {
    let Args {
        seed,
        max_ticks,
        print_every,
        sweep_seeds,
        trace_out,
        trace_every,
        trace_limit,
        world_report,
        world_gate,
        gate,
        coverage_every,
        growth_every,
        profile_out,
        profile_every,
    } = args::parse();

    if world_report {
        if sweep_seeds > 0 {
            let unhealthy = run_world_report_sweep(seed, sweep_seeds);
            if world_gate && unhealthy > 0 {
                eprintln!("\nWORLD GATE FAILED: {} low-quality seed(s)", unhealthy);
                std::process::exit(1);
            }
        } else {
            print_world_report(seed);
        }
        return;
    }

    if sweep_seeds > 0 {
        let unhealthy = run_seed_sweep(seed, sweep_seeds, max_ticks);
        if gate && unhealthy > 0 {
            eprintln!("\nVIABILITY GATE FAILED: {} unhealthy seed(s)", unhealthy);
            std::process::exit(1);
        }
        return;
    }

    println!(
        "headless  seed={}  max_ticks={}  print_every={}",
        seed, max_ticks, print_every
    );
    println!(
        "{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6}",
        "tick", "alive", "births", "animals", "fire", "shelter", "lineages", "starv", "dehy", "sick"
    );
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
    let mut profile_writer = profile_out.as_ref().map(|path| {
        let mut w = BufWriter::new(File::create(path).unwrap_or_else(|err| {
            panic!("failed to create profile file {}: {}", path, err);
        }));
        use std::io::Write as _;
        writeln!(w, "tick,alive,ms_tick,rss_kb").ok();
        w
    });

    while sim.tick_count < max_ticks {
        let t0 = std::time::Instant::now();
        sim.tick();
        let tick_us = t0.elapsed().as_micros() as u64;
        tick_times_us.push(tick_us);
        let t = sim.tick_count;

        let alive = sim.organisms.iter().filter(|o| o.alive).count();
        if alive > peak_pop {
            peak_pop = alive;
        }

        // Profile CSV: every `profile_every` ticks. Reads RSS via
        // /proc/self/status on Linux; falls back to 0 elsewhere.
        if let Some(w) = profile_writer.as_mut() {
            if profile_every > 0 && t.is_multiple_of(profile_every) {
                use std::io::Write as _;
                let rss_kb = read_self_rss_kb();
                let _ = writeln!(w, "{},{},{},{}", t, alive, tick_us as f64 / 1000.0, rss_kb,);
            }
        }

        if let Some(writer) = trace_writer.as_mut() {
            if trace_every > 0 && t.is_multiple_of(trace_every) {
                write_trace_rows(&sim, writer, trace_limit);
            }
        }

        if coverage_every > 0 && t.is_multiple_of(coverage_every) {
            print_coverage_row(t, &sim);
        }

        if growth_every > 0 && t.is_multiple_of(growth_every) {
            print_growth_row(t, &sim);
        }

        for org in sim.organisms.iter().filter(|o| o.alive) {
            *thought_freq.entry(org.thought.clone()).or_insert(0) += 1;
        }

        if t.is_multiple_of(print_every) {
            let fire_count = sim
                .organisms
                .iter()
                .filter(|o| o.alive && o.discoveries.contains("fire"))
                .count();
            let shelter_count = sim
                .organisms
                .iter()
                .filter(|o| o.alive && o.discoveries.contains("shelter"))
                .count();
            let animal_count = sim.animals.iter().filter(|a| a.alive).count();
            let lineage_count: std::collections::HashSet<&str> = sim
                .organisms
                .iter()
                .filter(|o| o.alive)
                .map(|o| o.lineage_id.as_str())
                .collect();
            let h = &sim.history;
            println!(
                "{:<10} {:>5} {:>7} {:>7} {:>7} {:>7} {:>7} {:>6} {:>6} {:>6}",
                t,
                alive,
                h.births,
                animal_count,
                fire_count,
                shelter_count,
                lineage_count.len(),
                h.deaths_starvation,
                h.deaths_dehydration,
                h.deaths_sickness,
            );

            let json_bytes = sim.state_json().to_string().len();
            json_sizes_bytes.push(json_bytes);
        }
    }

    println!("\n=== SUMMARY ===");
    println!("ticks run:   {}", sim.tick_count);
    println!("peak pop:    {}", peak_pop);
    println!(
        "final alive: {}",
        sim.organisms.iter().filter(|o| o.alive).count()
    );
    print_history(&sim, thought_freq);
    print_economy(&sim);
    print_coverage(&sim);
    print_mood(&sim);
    print_institutions(&sim);
    print_society(&sim);
    print_progress(&sim);
    print_performance(tick_times_us, json_sizes_bytes);
    if let Some(writer) = trace_writer.as_mut() {
        writer.flush().ok();
    }
}
