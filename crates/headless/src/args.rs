//! Command-line options.

pub(super) struct Args {
    pub(super) seed: u64,
    pub(super) max_ticks: u64,
    pub(super) print_every: u64,
    pub(super) sweep_seeds: usize,
    pub(super) trace_out: Option<String>,
    pub(super) trace_every: u64,
    pub(super) trace_limit: usize,
    pub(super) world_report: bool,
    pub(super) world_gate: bool,
    pub(super) gate: bool,
    pub(super) coverage_every: u64,
    pub(super) growth_every: u64,
    pub(super) profile_out: Option<String>,
    pub(super) profile_every: u64,
}

pub(super) fn parse() -> Args {
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
    Args {
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
    }
}
