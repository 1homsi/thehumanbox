#![allow(clippy::needless_range_loop, clippy::explicit_counter_loop)]
#![allow(dead_code)]

// Sim core comes from the shared `sim-core` crate now (no more #[path]
// includes that recompiled the core into this binary separately).
// Re-export at the crate root so both bare (`world::grid`) and qualified
// (`crate::world::grid`) paths in this file keep resolving.
pub use sim_core::{organism, physics, sim, world};

use serde_json::json;
use sim::simulation::Simulation;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufWriter, Write};
use world::grid::{WorldGrid, HEIGHT, WIDTH};
use world::tiles::{Biome, Tile};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let seed: u64 = args
        .iter()
        .position(|a| a == "--seed")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(42);
    let max_ticks: u64 = args
        .iter()
        .position(|a| a == "--ticks")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(60_000);
    let print_every: u64 = args
        .iter()
        .position(|a| a == "--every")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(6_000);
    let sweep_seeds: usize = args
        .iter()
        .position(|a| a == "--sweep-seeds")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let trace_out = args
        .iter()
        .position(|a| a == "--trace-out")
        .and_then(|i| args.get(i + 1))
        .cloned();
    let trace_every: u64 = args
        .iter()
        .position(|a| a == "--trace-every")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(200);
    let trace_limit: usize = args
        .iter()
        .position(|a| a == "--trace-limit")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let world_report = args.iter().any(|a| a == "--world-report");
    let world_gate = args.iter().any(|a| a == "--world-gate");
    let gate = args.iter().any(|a| a == "--gate");
    let coverage_every: u64 = args
        .iter()
        .position(|a| a == "--coverage-every")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let growth_every: u64 = args
        .iter()
        .position(|a| a == "--growth-every")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    // --profile <path>: write a CSV of per-100-tick sim performance
    // (tick, alive, ms_tick, rss_kb). Lets us A/B perf work by
    // diffing CSVs between two runs at the same seed.
    let profile_out: Option<String> = args
        .iter()
        .position(|a| a == "--profile")
        .and_then(|i| args.get(i + 1))
        .cloned();
    let profile_every: u64 = args
        .iter()
        .position(|a| a == "--profile-every")
        .and_then(|i| args.get(i + 1))
        .and_then(|s| s.parse().ok())
        .unwrap_or(100);

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
    let h = &sim.history;
    println!(
        "births:      {}  |  deaths: old={} starv={} dehy={} sick={} combat={}",
        h.births,
        h.deaths_old_age,
        h.deaths_starvation,
        h.deaths_dehydration,
        h.deaths_sickness,
        h.deaths_combat
    );
    println!(
        "alliances:   {}  challenges: {}  gifts: {}",
        h.alliances_formed, h.challenges_total, h.gifts_total
    );
    println!("droughts:    {}  outbreaks: {}", h.droughts, h.outbreaks);

    let mut freq_vec: Vec<(String, u64)> = thought_freq.into_iter().collect();
    freq_vec.sort_by(|a, b| b.1.cmp(&a.1));
    println!("\nTop behaviors (thought frequency across all organism-ticks):");
    for (thought, count) in freq_vec.iter().take(10) {
        println!("  {:>10}  {}", count, thought);
    }

    let fire_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("fire"))
        .count();
    let shelter_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("shelter"))
        .count();
    let hunt_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("hunt"))
        .count();
    let medicine_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("medicine"))
        .count();
    let barter_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("barter"))
        .count();
    let currency_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("currency"))
        .count();
    let wood_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("woodcutting"))
        .count();
    let forestry_disc = sim
        .organisms
        .iter()
        .filter(|o| o.discoveries.contains("forestry"))
        .count();
    let rich_n = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains("rich"))
        .count();
    let poor_n = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.discoveries.contains("poor"))
        .count();
    println!(
        "\nDiscoveries (ever, alive+dead):  fire={}  shelter={}  hunt={}  medicine={}  woodcutting={}  forestry={}  barter={}  currency={}",
        fire_disc, shelter_disc, hunt_disc, medicine_disc, wood_disc, forestry_disc, barter_disc, currency_disc
    );
    println!(
        "Wealth split (alive):  rich={}  poor={}  trades_log={}",
        rich_n,
        poor_n,
        sim.trades.len()
    );

    let mut goods_totals: HashMap<String, u64> = HashMap::new();
    let mut goods_holders: HashMap<String, u64> = HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        for (k, n) in &o.tools {
            if *n == 0 {
                continue;
            }
            *goods_totals.entry(k.clone()).or_insert(0) += *n as u64;
            *goods_holders.entry(k.clone()).or_insert(0) += 1;
        }
    }
    if !goods_totals.is_empty() {
        let mut goods_vec: Vec<(String, u64)> = goods_totals.into_iter().collect();
        goods_vec.sort_by(|a, b| b.1.cmp(&a.1));
        println!("\nGoods in circulation (alive holders):");
        for (good, total) in goods_vec.iter().take(20) {
            let holders = goods_holders.get(good).copied().unwrap_or(0);
            println!("  {:>4} total  {:>3} holders  {}", total, holders, good);
        }
    }
    let mut trade_goods: HashMap<String, u64> = HashMap::new();
    for t in &sim.trades {
        *trade_goods.entry(t.good.clone()).or_insert(0) += t.amount as u64;
    }
    if !trade_goods.is_empty() {
        let mut tg: Vec<(String, u64)> = trade_goods.into_iter().collect();
        tg.sort_by(|a, b| b.1.cmp(&a.1));
        println!("Trade volume by good:");
        for (g, n) in tg.iter().take(15) {
            println!("  {:>4}  {}", n, g);
        }
    }

    if !sim.action_counts.is_empty() {
        let mut rows: Vec<(&'static str, u64)> = sim.action_counts.iter().map(|(k, v)| (*k, *v)).collect();
        rows.sort_by(|a, b| b.1.cmp(&a.1));
        println!("\nRound-9 category coverage (action firings):");
        for (cat, n) in rows {
            println!("  {:>7}  {}", n, cat);
        }
    }
    if !sim.decision_counts.is_empty() {
        let total: u64 = sim.decision_counts.values().sum();
        let mut rows: Vec<(&'static str, u64)> = sim.decision_counts.iter().map(|(k, v)| (*k, *v)).collect();
        rows.sort_by(|a, b| b.1.cmp(&a.1));
        println!("\nDecision origin coverage:");
        for (origin, n) in rows {
            let pct = if total > 0 {
                (n as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            println!("  {:>7}  {:>5.1}%  {}", n, pct, origin);
        }
    }
    let mut era_counts: HashMap<String, usize> = HashMap::new();
    for (_, era) in sim.lineage_eras.iter() {
        *era_counts.entry(era.name().to_string()).or_insert(0) += 1;
    }
    let mut era_pairs: Vec<(String, usize)> = era_counts.into_iter().collect();
    era_pairs.sort_by(|a, b| b.1.cmp(&a.1));
    print!("Lineage eras:");
    for (e, c) in era_pairs.iter() {
        print!(" {}={}", e, c)
    }
    println!();
    if !sim.lineage_eras.is_empty() {
        let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::new();
        let mut lineage_pop: HashMap<String, usize> = HashMap::new();
        for org in sim.organisms.iter().filter(|o| o.alive) {
            *lineage_pop.entry(org.lineage_id.clone()).or_insert(0) += 1;
            let entry = lineage_discoveries.entry(org.lineage_id.clone()).or_default();
            for d in &org.discoveries {
                entry.insert(d.clone());
            }
        }
        let mut blockers: Vec<(String, String, usize, usize, Vec<&str>)> = sim
            .lineage_eras
            .iter()
            .filter_map(|(lid, era)| {
                let next = era.advance()?;
                let pop = *lineage_pop.get(lid).unwrap_or(&0);
                let required_pop = next.pop_threshold();
                let known = lineage_discoveries.get(lid);
                let missing: Vec<&str> = next
                    .required_discoveries()
                    .iter()
                    .copied()
                    .filter(|d| !known.is_some_and(|set| set.contains(*d)))
                    .collect();
                if missing.is_empty() && pop >= required_pop {
                    return None;
                }
                Some((lid.clone(), next.name().to_string(), pop, required_pop, missing))
            })
            .collect();
        blockers.sort_by(|a, b| b.2.cmp(&a.2).then_with(|| a.1.cmp(&b.1)));
        if !blockers.is_empty() {
            println!("Era advancement blockers:");
            for (lid, next, pop, required_pop, missing) in blockers.into_iter().take(8) {
                let name = sim
                    .lineage_names
                    .get(&lid)
                    .cloned()
                    .unwrap_or_else(|| lid.chars().take(8).collect());
                let pop_gate = if pop < required_pop {
                    format!(" pop {pop}/{required_pop}")
                } else {
                    String::new()
                };
                let missing_gate = if missing.is_empty() {
                    String::new()
                } else {
                    format!(" missing {}", missing.join(","))
                };
                println!("  {} -> {}{}{}", name, next, pop_gate, missing_gate);
            }
        }
    }

    let mut aspirations: HashMap<String, usize> = HashMap::new();
    let mut joy_count = 0usize;
    let mut grief_count = 0usize;
    let mut joy_total = 0u64;
    let mut witnessed_count = 0usize;
    let mut life_log_total = 0usize;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if !o.aspiration.is_empty() {
            *aspirations.entry(o.aspiration.clone()).or_insert(0) += 1;
        }
        if o.joy_ticks > 0 {
            joy_count += 1;
            joy_total += o.joy_ticks as u64;
        }
        if o.grief_ticks > 0 {
            grief_count += 1;
        }
        for entry in &o.life_log {
            life_log_total += 1;
            if entry.category == "witnessed" {
                witnessed_count += 1;
            }
        }
    }
    println!("\n=== ALIVE SYSTEMS ===");
    println!(
        "Aspirations assigned: {} (across {} types)",
        aspirations.values().sum::<usize>(),
        aspirations.len()
    );
    let mut asp_pairs: Vec<(String, usize)> = aspirations.into_iter().collect();
    asp_pairs.sort_by(|a, b| b.1.cmp(&a.1));
    for (asp, n) in asp_pairs.iter() {
        println!("  {:>4}  {}", n, asp);
    }
    let joy_avg = if joy_count > 0 {
        joy_total / joy_count as u64
    } else {
        0
    };
    println!(
        "Joy ticks active: {} orgs (avg {} ticks each)",
        joy_count, joy_avg
    );
    println!("Grief ticks active: {} orgs", grief_count);
    println!(
        "Witnessed life_log entries: {} (of {} total life-log)",
        witnessed_count, life_log_total
    );

    {
        let mut by_kind: HashMap<String, u64> = HashMap::new();
        let mut total_mem = 0u64;
        let mut sal_sum = 0.0f64;
        let mut alive_with_mem = 0u64;
        let mut most_recalled: Option<(String, u32, String)> = None;
        for o in sim.organisms.iter().filter(|o| o.alive) {
            if !o.memories.is_empty() {
                alive_with_mem += 1;
            }
            for m in o.memories.entries.iter() {
                *by_kind.entry(m.kind.label().to_string()).or_insert(0) += 1;
                total_mem += 1;
                sal_sum += m.salience as f64;
                if m.recall_count > 0 {
                    let take = match &most_recalled {
                        None => true,
                        Some((_, rc, _)) => m.recall_count > *rc,
                    };
                    if take {
                        most_recalled = Some((o.name.clone(), m.recall_count, m.text.clone()));
                    }
                }
            }
        }
        let avg_sal = if total_mem > 0 {
            sal_sum / total_mem as f64
        } else {
            0.0
        };
        println!(
            "\nMemory store: {} entries across {} living orgs (avg salience {:.2})",
            total_mem, alive_with_mem, avg_sal
        );
        let mut pairs: Vec<(String, u64)> = by_kind.into_iter().collect();
        pairs.sort_by(|a, b| b.1.cmp(&a.1));
        for (k, n) in pairs.iter() {
            println!("  {:>6} {}", n, k);
        }
        if let Some((name, rc, text)) = most_recalled {
            let preview = if text.len() > 64 {
                format!("{}…", &text[..64])
            } else {
                text
            };
            println!("  most-recalled: {} ({}x) — {}", name, rc, preview);
        }

        let mut deepest_grief: Option<(String, String)> = None;
        let mut greatest_joy: Option<(String, String)> = None;
        let mut deepest_grief_score: f32 = 0.0;
        let mut greatest_joy_score: f32 = 0.0;
        for o in sim.organisms.iter().filter(|o| o.alive) {
            for m in o.memories.entries.iter() {
                if m.emotion <= -2 {
                    let score = (-m.emotion as f32) * m.salience;
                    if score > deepest_grief_score {
                        deepest_grief_score = score;
                        deepest_grief = Some((o.name.clone(), m.text.clone()));
                    }
                }
                if m.emotion >= 2 {
                    let score = m.emotion as f32 * m.salience;
                    if score > greatest_joy_score {
                        greatest_joy_score = score;
                        greatest_joy = Some((o.name.clone(), m.text.clone()));
                    }
                }
            }
        }
        if let Some((name, text)) = greatest_joy {
            let preview = if text.len() > 64 {
                format!("{}…", &text[..64])
            } else {
                text
            };
            println!("  greatest joy: {} — {}", name, preview);
        }
        if let Some((name, text)) = deepest_grief {
            let preview = if text.len() > 64 {
                format!("{}…", &text[..64])
            } else {
                text
            };
            println!("  deepest grief: {} — {}", name, preview);
        }
    }

    if !sim.workshop_hits.is_empty() {
        println!("\n=== WORKSHOP BONUS ===");
        let mut rows: Vec<(&str, (u64, u64))> = sim.workshop_hits.iter().map(|(k, v)| (*k, *v)).collect();
        rows.sort_by(|a, b| (b.1 .0 + b.1 .1).cmp(&(a.1 .0 + a.1 .1)));
        let (mut h, mut m) = (0u64, 0u64);
        for (cat, (hit, miss)) in &rows {
            let total = hit + miss;
            let pct = if total > 0 {
                *hit as f64 * 100.0 / total as f64
            } else {
                0.0
            };
            println!(
                "  {:<18} {:>6} hit / {:>6} miss  ({:.1}% near workshop)",
                cat, hit, miss, pct
            );
            h += hit;
            m += miss;
        }
        let total = h + m;
        let pct = if total > 0 {
            h as f64 * 100.0 / total as f64
        } else {
            0.0
        };
        println!(
            "  {:<18} {:>6} hit / {:>6} miss  ({:.1}% overall)",
            "TOTAL", h, m, pct
        );
    }

    println!("\n=== CIVILIZATION ===");
    let total_adherents: u32 = sim.religions.iter().map(|r| r.adherents).sum();
    let milestones_hit: usize = sim
        .religions
        .iter()
        .filter(|r| r.last_milestone.is_some())
        .count();
    println!(
        "Religions: {}   total_adherents={}   milestone_crossings={}",
        sim.religions.len(),
        total_adherents,
        milestones_hit
    );
    if !sim.religions.is_empty() {
        let mut religions_sorted: Vec<_> = sim.religions.iter().collect();
        religions_sorted.sort_by(|a, b| b.adherents.cmp(&a.adherents));
        for r in religions_sorted.iter().take(5) {
            let last = r
                .last_milestone
                .map(|m| format!(" peaked@{}", m))
                .unwrap_or_default();
            println!(
                "  {:<20} kind={:<14} adherents={}{}",
                r.name,
                format!("{:?}", r.kind),
                r.adherents,
                last
            );
        }
    }

    let total_treasury: u64 = sim.governments.values().map(|g| g.treasury).sum();
    let mut gov_kinds: HashMap<String, usize> = HashMap::new();
    for g in sim.governments.values() {
        *gov_kinds.entry(g.kind.name().to_string()).or_insert(0) += 1;
    }
    println!(
        "Governments: {}   total_treasury={}",
        sim.governments.len(),
        total_treasury
    );
    if !gov_kinds.is_empty() {
        let mut gk: Vec<(String, usize)> = gov_kinds.into_iter().collect();
        gk.sort_by(|a, b| b.1.cmp(&a.1));
        print!("  kinds:");
        for (k, n) in gk.iter() {
            print!(" {}={}", k, n);
        }
        println!();
    }
    let leader_count = sim.organisms.iter().filter(|o| o.alive && o.is_leader).count();
    println!("  leaders alive: {}", leader_count);

    let mut bldg_by_kind: HashMap<String, usize> = HashMap::new();
    for b in &sim.buildings {
        *bldg_by_kind.entry(b.kind.name().to_string()).or_insert(0) += 1;
    }
    println!("Buildings: {} total", sim.buildings.len());
    let mut bbk: Vec<(String, usize)> = bldg_by_kind.into_iter().collect();
    bbk.sort_by(|a, b| b.1.cmp(&a.1));
    for (k, n) in bbk.iter().take(12) {
        println!("  {:>4}  {}", n, k);
    }

    println!(
        "Books: {}   Artworks: {}   Festivals: {}",
        sim.books.len(),
        sim.artworks.len(),
        sim.festivals.len()
    );
    if !sim.books.is_empty() {
        let total_copies: u32 = sim.books.iter().map(|b| b.copies).sum();
        println!("  total book copies: {}", total_copies);
    }

    let mut spec_counts: HashMap<String, usize> = HashMap::new();
    let mut partnered = 0usize;
    let mut total_children = 0u64;
    let mut adult_count = 0usize;
    let mut friendship_total = 0u64;
    let mut age_at_death_sum = 0u64;
    let mut age_at_death_n = 0u64;
    for o in sim.organisms.iter() {
        if !o.alive {
            if o.age > 0 {
                age_at_death_sum += o.age as u64;
                age_at_death_n += 1;
            }
            continue;
        }
        if let Some(s) = &o.specialty {
            *spec_counts.entry(s.clone()).or_insert(0) += 1;
        }
        if o.partner_id.is_some() {
            partnered += 1;
        }
        total_children += o.children_count as u64;
        if o.age > 200 {
            adult_count += 1;
        }
        friendship_total += o.friends.len() as u64;
    }
    let mut sc: Vec<(String, usize)> = spec_counts.into_iter().collect();
    sc.sort_by(|a, b| b.1.cmp(&a.1));
    println!("\nFamily / society:");
    println!("  partnerships:   {}", partnered / 2);
    println!("  total children: {}", total_children);
    let avg_children = if adult_count > 0 {
        total_children as f64 / adult_count as f64
    } else {
        0.0
    };
    println!("  avg children per adult: {:.2}", avg_children);
    println!("  friendships:    {}", friendship_total);
    if age_at_death_n > 0 {
        println!("  mean age at death: {} ticks", age_at_death_sum / age_at_death_n);
    }
    if !sc.is_empty() {
        print!("  specialties:");
        for (s, n) in sc.iter().take(10) {
            print!(" {}={}", s, n);
        }
        println!();
    }

    let n_lineages = sim.lineage_eras.len().max(1);
    let era_idx_sum: u64 = sim.lineage_eras.values().map(|e| *e as u64).sum();
    let era_idx_max: u64 = sim.lineage_eras.values().map(|e| *e as u64).max().unwrap_or(0);
    let era_idx_avg = era_idx_sum as f64 / n_lineages as f64;
    println!(
        "Civ progression: era_avg={:.2} era_max={} headlines={}",
        era_idx_avg,
        era_idx_max,
        sim.headlines.len()
    );
    {
        let mut by_kind: HashMap<String, usize> = HashMap::new();
        for a in sim.animals.iter().filter(|a| a.alive) {
            *by_kind.entry(a.kind.name().to_string()).or_insert(0) += 1;
        }
        let mut row: Vec<(String, usize)> = by_kind.into_iter().collect();
        row.sort_by(|a, b| b.1.cmp(&a.1));
        let total: usize = sim.animals.iter().filter(|a| a.alive).count();
        let parts: Vec<String> = row.iter().map(|(k, n)| format!("{}={}", k, n)).collect();
        println!("Animals alive at end: {}  ({})", total, parts.join(" "));
    }

    let mut lineage_alive: HashMap<&str, usize> = HashMap::new();
    for org in sim.organisms.iter().filter(|o| o.alive) {
        *lineage_alive.entry(&org.lineage_id).or_insert(0) += 1;
    }
    let mut alive_lineages: Vec<(&str, usize)> = lineage_alive.into_iter().collect();
    alive_lineages.sort_by(|a, b| b.1.cmp(&a.1));
    println!("\nSurviving lineages:");
    for (lid, count) in alive_lineages.iter().take(8) {
        let avg_gen = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == *lid)
            .map(|o| o.generation as f32)
            .fold((0.0, 0.0), |(s, c), g| (s + g, c + 1.0));
        let gen_avg = if avg_gen.1 > 0.0 {
            avg_gen.0 / avg_gen.1
        } else {
            0.0
        };
        println!(
            "  {}…  count={}  avg_gen={:.1}",
            &lid[..lid.len().min(8)],
            count,
            gen_avg
        );
    }

    if !tick_times_us.is_empty() {
        let mut sorted_us = tick_times_us.clone();
        sorted_us.sort_unstable();
        let n = sorted_us.len();
        let mean_us = sorted_us.iter().sum::<u64>() / n as u64;
        let p50 = sorted_us[n * 50 / 100];
        let p95 = sorted_us[n * 95 / 100];
        let p99 = sorted_us[n * 99 / 100];
        let max_us = *sorted_us.last().unwrap();
        let total_ms = tick_times_us.iter().sum::<u64>() / 1000;
        println!("\n=== TICK TIMING ({} ticks) ===", n);
        println!(
            "  mean={:>6}µs  p50={:>6}µs  p95={:>6}µs  p99={:>6}µs  max={:>7}µs",
            mean_us, p50, p95, p99, max_us
        );
        println!(
            "  total wall: {}ms  ({:.0} ticks/s)",
            total_ms,
            n as f64 / (total_ms as f64 / 1000.0)
        );
    }
    if !json_sizes_bytes.is_empty() {
        let avg_kb = json_sizes_bytes.iter().sum::<usize>() / json_sizes_bytes.len() / 1024;
        let max_kb = json_sizes_bytes.iter().max().copied().unwrap_or(0) / 1024;
        println!("\n=== WS PAYLOAD ESTIMATE ===");
        println!(
            "  avg={} KB   max={} KB   samples={}",
            avg_kb,
            max_kb,
            json_sizes_bytes.len()
        );
        println!("  at 10 tps: ~{} KB/s per client", avg_kb * 10);
    }
    if let Some(writer) = trace_writer.as_mut() {
        writer.flush().ok();
    }
}

/// Read process RSS in KB on Linux (returns 0 on other platforms or
/// if /proc isn't readable). Cheap — single fs read per call.
#[cfg(target_os = "linux")]
fn read_self_rss_kb() -> u64 {
    let Ok(s) = std::fs::read_to_string("/proc/self/status") else {
        return 0;
    };
    for line in s.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            return rest
                .split_whitespace()
                .next()
                .and_then(|n| n.parse().ok())
                .unwrap_or(0);
        }
    }
    0
}
#[cfg(target_os = "macos")]
fn read_self_rss_kb() -> u64 {
    #[repr(C)]
    struct MachTaskBasicInfo {
        virtual_size: u64,
        resident_size: u64,
        resident_size_max: u64,
        user_time: [i32; 2],
        system_time: [i32; 2],
        policy: i32,
        suspend_count: i32,
    }
    extern "C" {
        fn mach_task_self() -> u32;
        fn task_info(task: u32, flavor: u32, info: *mut MachTaskBasicInfo, count: *mut u32) -> i32;
    }
    const MACH_TASK_BASIC_INFO: u32 = 20;
    let mut info = MachTaskBasicInfo {
        virtual_size: 0,
        resident_size: 0,
        resident_size_max: 0,
        user_time: [0; 2],
        system_time: [0; 2],
        policy: 0,
        suspend_count: 0,
    };
    let mut count = (std::mem::size_of::<MachTaskBasicInfo>() / std::mem::size_of::<u32>()) as u32;
    let ok = unsafe { task_info(mach_task_self(), MACH_TASK_BASIC_INFO, &mut info, &mut count) };
    if ok == 0 {
        info.resident_size / 1024
    } else {
        0
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_self_rss_kb() -> u64 {
    0
}

fn infer_event_type(org: &organism::organism::Organism) -> &'static str {
    let thought = org.thought.to_lowercase();
    let last_log = org
        .life_log
        .back()
        .map(|e| e.text.to_lowercase())
        .unwrap_or_default();
    let text = if !last_log.is_empty() {
        last_log.as_str()
    } else {
        thought.as_str()
    };

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

fn print_growth_row(tick: u64, sim: &Simulation) {
    let alive = sim.organisms.iter().filter(|o| o.alive).count();
    let lineages: std::collections::HashSet<&str> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect();
    let religions = sim.religions.len();
    let adherents: u32 = sim.religions.iter().map(|r| r.adherents).sum();
    let governments = sim.governments.len();
    let buildings = sim.buildings.len();
    let books = sim.books.len();
    let artworks = sim.artworks.len();
    let trades = sim.trades.len();
    let era_max = sim.lineage_eras.values().map(|e| *e as u32).max().unwrap_or(0);
    let round9: u64 = sim.action_counts.values().sum();
    let r9_cats = sim.action_counts.iter().filter(|(_, n)| **n > 0).count();
    if tick == 0 {
        println!(
            "{:<7} {:>5} {:>4} {:>4} {:>4} {:>4} {:>5} {:>5} {:>4} {:>4} {:>4} {:>4} {:>6}",
            "tick", "alive", "lin", "rel", "ad", "gov", "bldgs", "trds", "bks", "art", "era", "r9c", "r9k"
        );
    }
    println!(
        "{:<7} {:>5} {:>4} {:>4} {:>4} {:>4} {:>5} {:>5} {:>4} {:>4} {:>4} {:>4} {:>6}",
        tick,
        alive,
        lineages.len(),
        religions,
        adherents,
        governments,
        buildings,
        trades,
        books,
        artworks,
        era_max,
        r9_cats,
        round9 / 1000,
    );
}

fn print_coverage_row(tick: u64, sim: &Simulation) {
    use crate::world::grid::{HEIGHT, WIDTH};
    let alive: Vec<&_> = sim.organisms.iter().filter(|o| o.alive).collect();
    if alive.is_empty() {
        println!("coverage  tick={:<6} alive=0", tick);
        return;
    }
    let n = alive.len() as f32;
    let mx = alive.iter().map(|o| o.x).sum::<f32>() / n;
    let my = alive.iter().map(|o| o.y).sum::<f32>() / n;
    let varx = alive.iter().map(|o| (o.x - mx).powi(2)).sum::<f32>() / n;
    let vary = alive.iter().map(|o| (o.y - my).powi(2)).sum::<f32>() / n;
    let stdx = varx.sqrt();
    let stdy = vary.sqrt();

    const CELL: i32 = 50;
    let mut cells: std::collections::HashSet<(i32, i32)> = std::collections::HashSet::new();
    for o in &alive {
        cells.insert((o.x as i32 / CELL, o.y as i32 / CELL));
    }
    let cell_count = cells.len();

    let half_w = WIDTH as f32 / 2.0;
    let half_h = HEIGHT as f32 / 2.0;
    let mut q_tl = 0;
    let mut q_tr = 0;
    let mut q_bl = 0;
    let mut q_br = 0;
    for o in &alive {
        match (o.x < half_w, o.y < half_h) {
            (true, true) => q_tl += 1,
            (false, true) => q_tr += 1,
            (true, false) => q_bl += 1,
            (false, false) => q_br += 1,
        }
    }
    let pct = |x: usize| (x as f32 * 100.0 / n).round() as i32;

    let mut buckets: std::collections::HashMap<(i32, i32), u32> = std::collections::HashMap::new();
    for o in &alive {
        let k = (o.x as i32 / 30, o.y as i32 / 30);
        *buckets.entry(k).or_insert(0) += 1;
    }
    let dense = buckets.values().copied().max().unwrap_or(0);

    println!(
        "coverage  tick={:<6} alive={:<4} cx={:>5.0} cy={:>5.0} stdx={:>5.0} stdy={:>4.0} cells={:>3}/72 q_tl={:>3}% q_tr={:>3}% q_bl={:>3}% q_br={:>3}% dense={}",
        tick, alive.len(), mx, my, stdx, stdy, cell_count,
        pct(q_tl), pct(q_tr), pct(q_bl), pct(q_br), dense
    );
}

fn write_trace_rows(sim: &Simulation, writer: &mut BufWriter<File>, trace_limit: usize) {
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
            "context_text": org.life_log.back().map(|e| e.text.clone()).unwrap_or_default(),
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
    alive_samples: Vec<usize>,
    lineage_samples: Vec<usize>,
    ticks_run: u64,
    verdict: Verdict,
    religions: usize,
    adherents: u32,
    governments: usize,
    leaders: usize,
    buildings: usize,
    books: usize,
    artworks: usize,
    trades: usize,
    era_max: u32,
    era_avg: f32,
    partnerships: usize,
    total_children: u64,
    round9_total: u64,
    round9_active: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Verdict {
    Healthy,
    Extinct,
    Runaway,
    Stagnant,
    Homogenized,
}

impl Verdict {
    fn label(self) -> &'static str {
        match self {
            Verdict::Healthy => "HEALTHY",
            Verdict::Extinct => "EXTINCT",
            Verdict::Runaway => "RUNAWAY",
            Verdict::Stagnant => "STAGNANT",
            Verdict::Homogenized => "HOMOGEN",
        }
    }
    fn is_unhealthy(self) -> bool {
        self != Verdict::Healthy
    }
}

fn classify(
    extinction_tick: Option<u64>,
    alive_samples: &[usize],
    lineage_samples: &[usize],
    ticks_run: u64,
    surviving_lineages: usize,
) -> Verdict {
    const MAX_POP: usize = 300;
    if extinction_tick.is_some() {
        return Verdict::Extinct;
    }
    if alive_samples.is_empty() {
        return Verdict::Healthy;
    }

    let cap_count = alive_samples.iter().filter(|&&a| a >= MAX_POP).count();
    if cap_count * 100 / alive_samples.len().max(1) > 60 {
        return Verdict::Runaway;
    }

    let peak = *alive_samples.iter().max().unwrap_or(&0);
    let half = alive_samples.len() / 2;
    let second_half_mean = if alive_samples.len() > half {
        alive_samples[half..].iter().sum::<usize>() / (alive_samples.len() - half).max(1)
    } else {
        0
    };
    if peak < 30 || second_half_mean < 15 {
        return Verdict::Stagnant;
    }

    if ticks_run >= 30_000 && surviving_lineages < 3 {
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
    let mut alive_samples = Vec::new();
    let mut lineage_samples = Vec::new();

    while sim.tick_count < max_ticks {
        sim.tick();
        let alive = sim.organisms.iter().filter(|o| o.alive).count();
        peak_pop = peak_pop.max(alive);

        if sim.tick_count.is_multiple_of(1000) {
            alive_samples.push(alive);
            let lineages = sim
                .organisms
                .iter()
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
    let surviving_lineages = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect::<std::collections::HashSet<_>>()
        .len();
    let h = &sim.history;
    let ticks_run = sim.tick_count;
    let verdict = classify(
        extinction_tick,
        &alive_samples,
        &lineage_samples,
        ticks_run,
        surviving_lineages,
    );

    let adherents_total: u32 = sim.religions.iter().map(|r| r.adherents).sum();
    let era_idx_max = sim.lineage_eras.values().map(|e| *e as u32).max().unwrap_or(0);
    let era_idx_sum: u32 = sim.lineage_eras.values().map(|e| *e as u32).sum();
    let n_lin = sim.lineage_eras.len().max(1);
    let era_idx_avg = era_idx_sum as f32 / n_lin as f32;
    let partner_pairs = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.partner_id.is_some())
        .count()
        / 2;
    let total_kids: u64 = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.children_count as u64)
        .sum();
    let leaders_n = sim.organisms.iter().filter(|o| o.alive && o.is_leader).count();
    let round9_total: u64 = sim.action_counts.values().sum();
    let round9_active = sim.action_counts.iter().filter(|(_, n)| **n > 0).count();
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
        religions: sim.religions.len(),
        adherents: adherents_total,
        governments: sim.governments.len(),
        leaders: leaders_n,
        buildings: sim.buildings.len(),
        books: sim.books.len(),
        artworks: sim.artworks.len(),
        trades: sim.trades.len(),
        era_max: era_idx_max,
        era_avg: era_idx_avg,
        partnerships: partner_pairs,
        total_children: total_kids,
        round9_total,
        round9_active,
        alive_samples,
        lineage_samples,
        ticks_run,
        verdict,
    }
}

fn run_seed_sweep(start_seed: u64, sweep_seeds: usize, max_ticks: u64) -> usize {
    println!(
        "seed_sweep  start_seed={}  seeds={}  max_ticks={}",
        start_seed, sweep_seeds, max_ticks
    );
    println!(
        "{:<6} {:<8} {:>5} {:>5} {:>6} {:>4} {:>4} {:>4} {:>4} {:>4} {:>4} {:>4} {:>6} {:>4} {:>5} {:>5} {:>4}",
        "seed","verdict","alive","peak","births","lin","rel","gov","bld","bks","art","trd","ad","era","r9k","prtn","kid"
    );
    println!("{}", "-".repeat(108));

    let mut results = Vec::with_capacity(sweep_seeds);
    for offset in 0..sweep_seeds {
        let seed = start_seed + offset as u64;
        let r = run_one_seed(seed, max_ticks);
        println!(
            "{:<6} {:<8} {:>5} {:>5} {:>6} {:>4} {:>4} {:>4} {:>4} {:>4} {:>4} {:>4} {:>6} {:>4} {:>5} {:>5} {:>4}",
            r.seed,
            r.verdict.label(),
            r.final_alive,
            r.peak_pop,
            r.births,
            r.surviving_lineages,
            r.religions,
            r.governments,
            r.buildings,
            r.books,
            r.artworks,
            r.trades,
            r.adherents,
            r.era_max,
            r.round9_total / 1000,
            r.partnerships,
            r.total_children,
        );
        results.push(r);
    }

    let extinct = results.iter().filter(|r| r.extinction_tick.is_some()).count();
    let unhealthy = results.iter().filter(|r| r.verdict.is_unhealthy()).count();
    let avg_final = results.iter().map(|r| r.final_alive as f64).sum::<f64>() / results.len().max(1) as f64;
    let avg_peak = results.iter().map(|r| r.peak_pop as f64).sum::<f64>() / results.len().max(1) as f64;
    println!("\n=== SWEEP SUMMARY ===");
    println!("verdict counts:");
    for v in &[
        Verdict::Healthy,
        Verdict::Extinct,
        Verdict::Runaway,
        Verdict::Stagnant,
        Verdict::Homogenized,
    ] {
        let n = results.iter().filter(|r| r.verdict == *v).count();
        if n > 0 {
            println!("  {:<10} {} / {}", v.label(), n, results.len());
        }
    }
    println!("extinctions:     {} / {}", extinct, results.len());
    println!("unhealthy:       {} / {}", unhealthy, results.len());
    println!("avg final alive: {:.1}", avg_final);
    println!("avg peak pop:    {:.1}", avg_peak);

    let n = results.len().max(1) as f64;
    let avg_rel: f64 = results.iter().map(|r| r.religions as f64).sum::<f64>() / n;
    let avg_gov: f64 = results.iter().map(|r| r.governments as f64).sum::<f64>() / n;
    let avg_bld: f64 = results.iter().map(|r| r.buildings as f64).sum::<f64>() / n;
    let avg_bks: f64 = results.iter().map(|r| r.books as f64).sum::<f64>() / n;
    let avg_art: f64 = results.iter().map(|r| r.artworks as f64).sum::<f64>() / n;
    let avg_trd: f64 = results.iter().map(|r| r.trades as f64).sum::<f64>() / n;
    let avg_ad: f64 = results.iter().map(|r| r.adherents as f64).sum::<f64>() / n;
    let avg_eramax: f64 = results.iter().map(|r| r.era_max as f64).sum::<f64>() / n;
    let avg_eravg: f64 = results.iter().map(|r| r.era_avg as f64).sum::<f64>() / n;
    let avg_r9k: f64 = results.iter().map(|r| r.round9_total as f64).sum::<f64>() / n;
    let avg_r9active: f64 = results.iter().map(|r| r.round9_active as f64).sum::<f64>() / n;
    let avg_prtn: f64 = results.iter().map(|r| r.partnerships as f64).sum::<f64>() / n;
    let avg_kid: f64 = results.iter().map(|r| r.total_children as f64).sum::<f64>() / n;
    let avg_leaders: f64 = results.iter().map(|r| r.leaders as f64).sum::<f64>() / n;
    let any_books = results.iter().filter(|r| r.books > 0).count();
    let any_religions = results.iter().filter(|r| r.religions > 0).count();
    let any_gov = results.iter().filter(|r| r.governments > 0).count();
    let any_round9 = results.iter().filter(|r| r.round9_total > 0).count();

    println!("\n=== GROWTH SIGNALS (averages) ===");
    println!(
        "  religions: {:.1} ({}/{} seeds had any)  adherents: {:.1}",
        avg_rel,
        any_religions,
        results.len(),
        avg_ad
    );
    println!(
        "  governments: {:.1} ({}/{} seeds)  leaders alive: {:.1}",
        avg_gov,
        any_gov,
        results.len(),
        avg_leaders
    );
    println!("  buildings: {:.1}", avg_bld);
    println!(
        "  books: {:.1} ({}/{} seeds)  artworks: {:.1}",
        avg_bks,
        any_books,
        results.len(),
        avg_art
    );
    println!("  trades log: {:.1}", avg_trd);
    println!("  era_max avg: {:.2}   era_avg avg: {:.2}", avg_eramax, avg_eravg);
    println!(
        "  round9 firings: {:.0}  ({:.1} of 10 categories used, {}/{} seeds fired any)",
        avg_r9k,
        avg_r9active,
        any_round9,
        results.len()
    );
    println!("  partnerships: {:.1}  children: {:.1}", avg_prtn, avg_kid);
    unhealthy
}

#[derive(Debug)]
struct WorldReport {
    land_tiles: usize,
    livable_tiles: usize,
    harsh_tiles: usize,
    water_tiles: usize,
    coastline_tiles: usize,
    land_components: usize,
    largest_land_component: usize,
    grassland_tiles: usize,
    forest_tiles: usize,
    wetland_tiles: usize,
    desert_tiles: usize,
    tundra_tiles: usize,
    volcanic_tiles: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorldVerdict {
    Healthy,
    Harsh,
    Fragmented,
}

impl WorldVerdict {
    fn label(self) -> &'static str {
        match self {
            WorldVerdict::Healthy => "HEALTHY",
            WorldVerdict::Harsh => "HARSH",
            WorldVerdict::Fragmented => "FRAGMENT",
        }
    }

    fn is_unhealthy(self) -> bool {
        self != WorldVerdict::Healthy
    }
}

impl WorldReport {
    fn habitability_ratio(&self) -> f32 {
        if self.land_tiles == 0 {
            0.0
        } else {
            self.livable_tiles as f32 / self.land_tiles as f32
        }
    }

    fn coastline_ratio(&self) -> f32 {
        if self.land_tiles == 0 {
            0.0
        } else {
            self.coastline_tiles as f32 / self.land_tiles as f32
        }
    }

    fn largest_component_ratio(&self) -> f32 {
        if self.land_tiles == 0 {
            0.0
        } else {
            self.largest_land_component as f32 / self.land_tiles as f32
        }
    }

    fn quality_score(&self) -> f32 {
        let habitability = self.habitability_ratio();
        let coastline = self.coastline_ratio();
        let fragmentation_penalty = if self.land_components > 8 {
            ((self.land_components - 8) as f32 * 0.02).min(0.20)
        } else {
            0.0
        };
        let harsh_penalty = if self.land_tiles == 0 {
            0.0
        } else {
            self.harsh_tiles as f32 / self.land_tiles as f32 * 0.35
        };
        (habitability * 0.60 + coastline.min(0.45) * 0.25 + self.largest_component_ratio() * 0.15
            - fragmentation_penalty
            - harsh_penalty)
            .max(0.0)
    }

    fn verdict(&self) -> WorldVerdict {
        if self.habitability_ratio() < 0.70 || self.harsh_tiles > self.livable_tiles {
            WorldVerdict::Harsh
        } else if self.largest_component_ratio() < 0.58 || self.land_components > 55 {
            WorldVerdict::Fragmented
        } else {
            WorldVerdict::Healthy
        }
    }
}

fn build_world_report(seed: u64) -> WorldReport {
    let grid = WorldGrid::new(seed);
    let mut land_tiles = 0usize;
    let mut livable_tiles = 0usize;
    let mut harsh_tiles = 0usize;
    let mut water_tiles = 0usize;
    let mut coastline_tiles = 0usize;
    let mut grassland_tiles = 0usize;
    let mut forest_tiles = 0usize;
    let mut wetland_tiles = 0usize;
    let mut desert_tiles = 0usize;
    let mut tundra_tiles = 0usize;
    let mut volcanic_tiles = 0usize;

    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            let tile = grid.get(x, y);
            let biome = grid.biome_at(x, y);
            match tile {
                Tile::Water | Tile::Void => {
                    water_tiles += 1;
                }
                Tile::Grass | Tile::Food | Tile::Ash => {
                    land_tiles += 1;
                    livable_tiles += 1;
                }
                Tile::Rock | Tile::Snow | Tile::Sand | Tile::Fire | Tile::Scorched | Tile::Mineral => {
                    land_tiles += 1;
                    harsh_tiles += 1;
                }
                Tile::Campfire | Tile::Hut | Tile::Flooded => {
                    land_tiles += 1;
                }
            }

            if !matches!(tile, Tile::Water | Tile::Void) {
                let coastal = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| {
                    WorldGrid::in_bounds(x + dx, y + dy) && grid.get(x + dx, y + dy) == Tile::Water
                });
                if coastal {
                    coastline_tiles += 1;
                }
            }

            match biome {
                Biome::Grassland => grassland_tiles += 1,
                Biome::Forest => forest_tiles += 1,
                Biome::Wetland => wetland_tiles += 1,
                Biome::Desert => desert_tiles += 1,
                Biome::Tundra => tundra_tiles += 1,
                Biome::Volcanic => volcanic_tiles += 1,
            }
        }
    }

    let (land_components, largest_land_component) = land_component_stats(&grid);

    WorldReport {
        land_tiles,
        livable_tiles,
        harsh_tiles,
        water_tiles,
        coastline_tiles,
        land_components,
        largest_land_component,
        grassland_tiles,
        forest_tiles,
        wetland_tiles,
        desert_tiles,
        tundra_tiles,
        volcanic_tiles,
    }
}

fn land_component_stats(grid: &WorldGrid) -> (usize, usize) {
    let mut visited = vec![false; WIDTH * HEIGHT];
    let mut components = 0usize;
    let mut largest = 0usize;

    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            let idx = WorldGrid::idx(x, y);
            if visited[idx] || matches!(grid.get(x, y), Tile::Water | Tile::Void) {
                continue;
            }
            components += 1;
            let mut stack = vec![(x, y)];
            visited[idx] = true;
            let mut size = 0usize;
            while let Some((cx, cy)) = stack.pop() {
                size += 1;
                for (nx, ny) in WorldGrid::neighbors(cx, cy) {
                    let ni = WorldGrid::idx(nx, ny);
                    if visited[ni] || matches!(grid.get(nx, ny), Tile::Water | Tile::Void) {
                        continue;
                    }
                    visited[ni] = true;
                    stack.push((nx, ny));
                }
            }
            largest = largest.max(size);
        }
    }

    (components, largest)
}

fn print_world_report(seed: u64) {
    let report = build_world_report(seed);
    println!("world_report seed={}", seed);
    println!(
        " land={} livable={} harsh={} water={} habitability={:.1}%",
        report.land_tiles,
        report.livable_tiles,
        report.harsh_tiles,
        report.water_tiles,
        report.habitability_ratio() * 100.0,
    );
    println!(
        " coastline={} land_components={} largest_component={} largest_component_ratio={:.1}%",
        report.coastline_tiles,
        report.land_components,
        report.largest_land_component,
        report.largest_component_ratio() * 100.0,
    );
    println!(
        " biomes grass={} forest={} wetland={} desert={} tundra={} volcanic={}",
        report.grassland_tiles,
        report.forest_tiles,
        report.wetland_tiles,
        report.desert_tiles,
        report.tundra_tiles,
        report.volcanic_tiles,
    );
    println!(
        " quality_score={:.3} verdict={}",
        report.quality_score(),
        report.verdict().label(),
    );
}

fn run_world_report_sweep(start_seed: u64, sweep_seeds: usize) -> usize {
    println!(
        "{:<8} {:<9} {:>7} {:>7} {:>7} {:>8} {:>8} {:>8} {:>8}",
        "seed", "verdict", "land", "live", "harsh", "habit%", "coast%", "pieces", "score"
    );
    println!("{}", "-".repeat(90));
    let mut reports = Vec::new();
    for offset in 0..sweep_seeds {
        let seed = start_seed + offset as u64;
        let report = build_world_report(seed);
        println!(
            "{:<8} {:<9} {:>7} {:>7} {:>7} {:>7.1} {:>8.1} {:>8} {:>8.3}",
            seed,
            report.verdict().label(),
            report.land_tiles,
            report.livable_tiles,
            report.harsh_tiles,
            report.habitability_ratio() * 100.0,
            report.coastline_ratio() * 100.0,
            report.land_components,
            report.quality_score(),
        );
        reports.push(report);
    }

    let avg_habitability =
        reports.iter().map(|r| r.habitability_ratio()).sum::<f32>() / reports.len().max(1) as f32;
    let avg_score = reports.iter().map(|r| r.quality_score()).sum::<f32>() / reports.len().max(1) as f32;
    let unhealthy = reports.iter().filter(|r| r.verdict().is_unhealthy()).count();
    println!("\nworld_report summary");
    println!(" avg_habitability={:.1}%", avg_habitability * 100.0);
    println!(" avg_quality_score={:.3}", avg_score);
    println!(" unhealthy_worlds={} / {}", unhealthy, reports.len());
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
        let samples = vec![80, 90, 85, 70, 14, 12, 10, 11];
        let v = classify(None, &samples, &[8; 8], 60_000, 5);
        assert_eq!(v, Verdict::Stagnant);
    }

    #[test]
    fn classify_homogenized_when_lineages_collapse_in_long_run() {
        let samples = vec![80, 85, 90, 95, 100, 105];
        let lineages = vec![12, 10, 8, 5, 3, 2];
        let v = classify(None, &samples, &lineages, 60_000, 2);
        assert_eq!(v, Verdict::Homogenized);
    }

    #[test]
    fn classify_homogenized_only_after_long_run() {
        let samples = vec![80, 85];
        let lineages = vec![12, 2];
        let v = classify(None, &samples, &lineages, 10_000, 2);
        assert_eq!(
            v,
            Verdict::Healthy,
            "short run shouldn't trigger homogenization verdict"
        );
    }

    #[test]
    fn classify_healthy_when_population_is_stable() {
        let samples = vec![80, 90, 100, 110, 120, 115, 105, 100];
        let v = classify(None, &samples, &[10; 8], 60_000, 8);
        assert_eq!(v, Verdict::Healthy);
    }

    #[test]
    fn world_report_verdict_marks_harsh_worlds() {
        let report = WorldReport {
            land_tiles: 10_000,
            livable_tiles: 4_000,
            harsh_tiles: 6_000,
            water_tiles: 20_000,
            coastline_tiles: 900,
            land_components: 12,
            largest_land_component: 7_000,
            grassland_tiles: 4_000,
            forest_tiles: 0,
            wetland_tiles: 0,
            desert_tiles: 4_000,
            tundra_tiles: 2_000,
            volcanic_tiles: 0,
        };

        assert_eq!(report.verdict(), WorldVerdict::Harsh);
    }

    #[test]
    fn world_report_verdict_marks_fragmented_worlds() {
        let report = WorldReport {
            land_tiles: 10_000,
            livable_tiles: 8_000,
            harsh_tiles: 2_000,
            water_tiles: 20_000,
            coastline_tiles: 1_100,
            land_components: 72,
            largest_land_component: 4_000,
            grassland_tiles: 6_000,
            forest_tiles: 2_000,
            wetland_tiles: 0,
            desert_tiles: 1_500,
            tundra_tiles: 500,
            volcanic_tiles: 0,
        };

        assert_eq!(report.verdict(), WorldVerdict::Fragmented);
    }
}
