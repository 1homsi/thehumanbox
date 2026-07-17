/// Conservative ceiling used by the hosted world and browser/WASM builds.
/// The downloadable desktop runtime can opt into a larger world through
/// `Simulation::set_population_limit` without making the low-cost hosted
/// service carry that workload.
pub const DEFAULT_MAX_POPULATION: usize = 350;
pub const MIN_POPULATION_LIMIT: usize = 120;
pub const MAX_POPULATION_LIMIT: usize = 5_000;

/// Prevent one lineage from erasing every other culture while still making
/// the late-game era thresholds reachable in large desktop worlds. Keep the
/// original hosted-world behaviour at the conservative default.
pub fn natural_lineage_limit(population_limit: usize) -> usize {
    if population_limit <= DEFAULT_MAX_POPULATION {
        60
    } else {
        population_limit.saturating_mul(2).div_ceil(3).max(60)
    }
}

pub fn lineage_overcrowding_threshold(population_limit: usize) -> usize {
    if population_limit <= DEFAULT_MAX_POPULATION {
        45
    } else {
        natural_lineage_limit(population_limit).saturating_mul(9) / 10
    }
}
pub const DAY_LENGTH: u64 = 600;
pub const SEASON_LENGTH: u64 = 3000;

pub const SEASONS: [&str; 4] = ["abundance", "decline", "scarcity", "recovery"];

pub fn season_growth(season: &str) -> f32 {
    match season {
        "abundance" => 2.0,
        "decline" => 1.0,
        "scarcity" => 0.55,
        "recovery" => 0.85,
        _ => 1.0,
    }
}

pub const DROUGHT_DURATION: u64 = 1500;
pub const DROUGHT_BASE_PROB: f32 = 0.00004;
pub const OUTBREAK_BASE_PROB: f32 = 0.000025;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downloadable_world_scale_can_reach_every_declared_era() {
        assert_eq!(natural_lineage_limit(DEFAULT_MAX_POPULATION), 60);
        assert_eq!(lineage_overcrowding_threshold(DEFAULT_MAX_POPULATION), 45);
        assert!(lineage_overcrowding_threshold(500) >= 300);
        assert!(natural_lineage_limit(MAX_POPULATION_LIMIT) >= 1_260);
    }
}
