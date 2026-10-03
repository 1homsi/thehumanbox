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
        jungle_tiles: 0,
        savanna_tiles: 0,
        taiga_tiles: 0,
        badlands_tiles: 0,
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
        jungle_tiles: 0,
        savanna_tiles: 0,
        taiga_tiles: 0,
        badlands_tiles: 0,
    };

    assert_eq!(report.verdict(), WorldVerdict::Fragmented);
}
