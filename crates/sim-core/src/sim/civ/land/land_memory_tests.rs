use super::*;
use crate::sim::tech::buildings::{Building, BuildingKind};

fn world(people: usize, at: [i32; 2]) -> Simulation {
    let mut sim = Simulation::new(51);
    sim.organisms.truncate(people);
    for (k, o) in sim.organisms.iter_mut().enumerate() {
        o.alive = true;
        o.age = o.max_age / 3;
        o.lineage_id = "clan".into();
        o.x = (at[0] + (k % 3) as i32) as f32;
        o.y = (at[1] + (k / 3) as i32) as f32;
        o.home_x = o.x;
        o.home_y = o.y;
    }
    sim.lineage_names.insert("clan".into(), "Clanfolk".into());
    sim.towns.clear();
    sim.buildings.clear();
    sim.farms.clear();
    sim.land = Default::default();
    for y in at[1] - 25..=at[1] + 25 {
        for x in at[0] - 25..=at[0] + 25 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.road[WorldGrid::idx(x, y)] = ROAD_NONE;
            sim.grid.biome[WorldGrid::idx(x, y)] = Biome::Forest as u8;
        }
    }
    sim
}

fn town(id: u32, center: [i32; 2], planned: bool) -> Town {
    Town {
        id,
        lineage: "clan".into(),
        center,
        planned,
        ..Default::default()
    }
}

#[test]
fn a_town_thins_the_forest_round_it_and_the_trees_come_back_once_it_is_gone() {
    let at = [100, 100];
    let mut sim = world(8, at);
    sim.towns = vec![town(1, at, true)];
    for _ in 0..40 {
        tick_forests(&mut sim);
    }
    let cleared = sim.land.cleared.len();
    assert!(cleared >= 10, "cleared {cleared}");
    assert!(sim
        .land
        .cleared
        .iter()
        .all(|c| chebyshev(c.at, at) <= CLEAR_REACH));
    assert!(sim
        .land
        .cleared
        .iter()
        .all(|c| sim.grid.biome_at(c.at[0], c.at[1]) == Biome::Grassland));
    sim.tick_count = REGROW_TICKS + LAND_PHASE + 10 * LAND_STEP;
    sim.tick_land_memory();
    assert_eq!(
        sim.land.cleared.len(),
        cleared,
        "a living town keeps its clearings"
    );
    sim.towns.clear();
    sim.tick_land_memory();
    assert!(sim.land.cleared.is_empty());
    assert_eq!(sim.land.stats.forest_regrown as usize, cleared);
    assert_eq!(sim.grid.biome_at(at[0] + 1, at[1]), Biome::Forest);
}

#[test]
fn an_empty_town_falls_to_ruin_by_stages_and_grass_covers_it() {
    let at = [100, 100];
    let mut sim = world(1, at);
    sim.organisms[0].alive = false;
    sim.tick_count = 5 * DAY_LENGTH;
    sim.note_abandoned_towns(&[town(7, at, true), town(8, [140, 100], false)]);
    assert_eq!(sim.land.ruins.len(), 1, "only a planned town leaves a ruin");
    let ruin = sim.land.ruins[0].clone();
    assert_eq!(ruin.stage(sim.tick_count), 0);
    assert_eq!(ruin.stage(sim.tick_count + 6 * DAY_LENGTH), 1);
    assert_eq!(ruin.stage(sim.tick_count + 21 * DAY_LENGTH), 2);
    assert_eq!(ruin.stage(sim.tick_count + 41 * DAY_LENGTH), 3);
    let mut hall = Building::new(5, BuildingKind::Hut, at[0] + 3, at[1], Some("clan".into()), 0);
    hall.condition = 1.0;
    hall.damage = 1.0;
    hall.ruined_at_tick = Some(sim.tick_count);
    sim.buildings.push(hall);
    let start = sim.tick_count;
    sim.tick_count = start + 30 * DAY_LENGTH - start % DAY_LENGTH + LAND_PHASE;
    sim.tick_land_memory();
    assert_eq!(sim.land.ruins.len(), 1);
    sim.tick_count += 15 * DAY_LENGTH;
    sim.tick_land_memory();
    assert!(sim.land.ruins.is_empty());
    assert!(sim.buildings.is_empty(), "the fallen hut is gone under the grass");
    assert_eq!(sim.land.stats.ruins_overgrown, 1);
    assert!(sim.events.iter().any(|e| e.detail.contains("stands empty")));
    assert!(sim
        .events
        .iter()
        .any(|e| e.detail.contains("Grass has grown over")));
}

#[test]
fn a_new_town_near_a_ruin_is_built_in_it() {
    let at = [100, 100];
    let mut sim = world(4, at);
    sim.lineage_names.insert("old".into(), "Oldfolk".into());
    sim.land.ruins.push(TownRuin {
        id: 3,
        lineage: "old".into(),
        name: "Oldfolk".into(),
        center: [108, 104],
        abandoned_tick: 0,
        role: TownRole::Mining,
    });
    assert_eq!(sim.resettle_ruin("clan", [140, 140]), None);
    assert_eq!(sim.resettle_ruin("clan", at), Some([108, 104]));
    assert!(sim.land.ruins.is_empty());
    assert_eq!(sim.land.stats.ruins_resettled, 1);
    assert!(sim.events.iter().any(|e| e
        .detail
        .contains("settled in the ruins of an old town of the Oldfolk")));
    sim.land.ruins.push(TownRuin {
        id: 4,
        lineage: "old".into(),
        name: "Oldfolk".into(),
        center: [60, 60],
        abandoned_tick: 0,
        role: TownRole::Farming,
    });
    sim.towns = vec![town(5, [64, 58], true)];
    sim.tick_count = LAND_STEP + LAND_PHASE;
    sim.tick_land_memory();
    assert!(
        sim.land.ruins.is_empty(),
        "a town standing on a ruin has taken it over"
    );
    assert_eq!(sim.land.stats.ruins_resettled, 2);
}

#[test]
fn what_the_land_remembers_is_saved_and_moves_with_the_map() {
    let mut land = LandMemory::default();
    assert!(land.is_empty());
    land.cleared.push(ClearedForest {
        at: [4, 5],
        biome: Biome::Taiga as u8,
        tick: 9,
    });
    land.ruins.push(TownRuin {
        id: 2,
        center: [10, 10],
        ..Default::default()
    });
    let back: LandMemory = serde_json::from_str(&serde_json::to_string(&land).unwrap()).unwrap();
    assert_eq!(back, land);
    land.shift(3, -2);
    assert_eq!(land.cleared[0].at, [7, 3]);
    assert_eq!(land.ruins[0].center, [13, 8]);
    let old: LandMemory = serde_json::from_str("{}").unwrap();
    assert!(old.is_empty());
}
