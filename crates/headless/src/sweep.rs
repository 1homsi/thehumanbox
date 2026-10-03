use super::*;

pub(super) struct SweepResult {
    pub(super) seed: u64,
    pub(super) final_alive: usize,
    pub(super) peak_pop: usize,
    pub(super) extinction_tick: Option<u64>,
    pub(super) births: u64,
    pub(super) surviving_lineages: usize,
    pub(super) verdict: Verdict,
    pub(super) religions: usize,
    pub(super) adherents: u32,
    pub(super) governments: usize,
    pub(super) leaders: usize,
    pub(super) buildings: usize,
    pub(super) books: usize,
    pub(super) artworks: usize,
    pub(super) trades: usize,
    pub(super) era_max: u32,
    pub(super) era_avg: f32,
    pub(super) partnerships: usize,
    pub(super) total_children: u64,
    pub(super) round9_total: u64,
    pub(super) round9_active: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Verdict {
    Healthy,
    Extinct,
    Runaway,
    Stagnant,
    Homogenized,
}

impl Verdict {
    pub(super) fn label(self) -> &'static str {
        match self {
            Verdict::Healthy => "HEALTHY",
            Verdict::Extinct => "EXTINCT",
            Verdict::Runaway => "RUNAWAY",
            Verdict::Stagnant => "STAGNANT",
            Verdict::Homogenized => "HOMOGEN",
        }
    }
    pub(super) fn is_unhealthy(self) -> bool {
        self != Verdict::Healthy
    }
}

pub(super) fn classify(
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

pub(super) fn run_one_seed(seed: u64, max_ticks: u64) -> SweepResult {
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
        verdict,
    }
}

pub(super) fn run_seed_sweep(start_seed: u64, sweep_seeds: usize, max_ticks: u64) -> usize {
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
