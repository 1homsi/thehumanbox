//! Faith of newcomers and floods.

use super::*;

/// Nobody migrates into a silent world, and a dwindling world is rescued
/// by newcomers only once its gods have earned the people's faith.
#[test]
fn newcomers_follow_faith_and_never_revive_a_silent_world() {
    let survivors = |sim: &Simulation| sim.organisms.iter().filter(|o| o.alive).count();
    let dwindle = |sim: &mut Simulation| {
        let keep: Vec<String> = sim
            .organisms
            .iter()
            .filter(|o| o.alive)
            .take(8)
            .map(|o| o.id.clone())
            .collect();
        sim.organisms.retain(|o| keep.contains(&o.id));
        sim.last_immigration_tick = 0;
        sim.tick_count = 1_000;
    };

    let mut silent = Simulation::new(5);
    silent.organisms.clear();
    silent.tick_count = 1_000;
    silent.tick();
    assert_eq!(survivors(&silent), 0, "nobody migrates into an empty world");

    let mut faithless = Simulation::new(5);
    dwindle(&mut faithless);
    let before = survivors(&faithless);
    faithless.tick();
    assert!(survivors(&faithless) <= before, "no rescue without faith");

    let mut faithful = Simulation::new(5);
    dwindle(&mut faithful);
    faithful.prayers.faith.insert("someone".into(), 3);
    let before = survivors(&faithful);
    faithful.tick();
    assert!(
        survivors(&faithful) > before,
        "word of answered prayers draws newcomers"
    );
}

#[test]
fn a_flood_drains_and_leaves_rich_silt() {
    use crate::world::tiles::Biome;
    let mut sim = Simulation::new(0xF100D);
    for x in 88..=112 {
        for y in 88..=112 {
            sim.grid.set(x, y, Tile::Grass);
            let i = WorldGrid::idx(x, y);
            sim.grid.biome[i] = Biome::Grassland as u8;
            sim.grid.fertility[i] = 0.4;
        }
    }
    sim.flood_tiles.clear();
    assert!(sim.apply_command(crate::sim::command::Command::Flood {
        x: 100,
        y: 100,
        radius: 6
    }));
    assert_eq!(sim.grid.get(100, 100), Tile::Water);
    assert_eq!(sim.grid.get(105, 100), Tile::Flooded);

    let start = sim.tick_count;
    let mut tick = start;
    let mut rim_dry_at = None;
    while tick < start + 6000 {
        tick += 300;
        crate::sim::world_events::tick_world_evolution(
            &mut sim.grid,
            &mut sim.organisms,
            &mut sim.flood_tiles,
            tick,
            "abundance",
            false,
            &sim.weather,
            &mut sim.events,
            &mut sim.rng,
        );
        if rim_dry_at.is_none() && sim.grid.get(105, 100) != Tile::Flooded {
            rim_dry_at = Some(tick);
            // The deep middle is still a lake when the rim has dried.
            assert_eq!(sim.grid.get(100, 100), Tile::Water);
        }
    }
    assert!(rim_dry_at.is_some(), "the flood's rim never drained");
    for (x, y) in [(100, 100), (105, 100), (100, 103)] {
        assert_eq!(sim.grid.get(x, y), Tile::Grass, "({x},{y}) is still under water");
        let fertility = sim.grid.fertility_at(x, y);
        assert!(
            fertility > Biome::Grassland.base_fertility(),
            "({x},{y}) drained without silt: {fertility}"
        );
    }
    assert!(sim.events.iter().any(|e| e.detail.contains("rich silt")));

    // The silt wears out again over the years.
    for _ in 0..400 {
        sim.grid.decay_world_layers();
    }
    let settled = sim.grid.fertility_at(100, 100);
    assert!(
        (settled - Biome::Grassland.base_fertility()).abs() < 1e-4,
        "silt never settled: {settled}"
    );
}
