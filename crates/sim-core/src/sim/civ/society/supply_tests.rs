use super::*;
use crate::sim::civ::civ_tick::town::Town;
use crate::sim::civ::society::relations::MemoryKind;
use crate::sim::civ::society::town_roles::TownRole;
use crate::sim::tech::buildings::Building;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;

fn town(id: u32, lineage: &str, center: [i32; 2]) -> Town {
    Town {
        id,
        lineage: lineage.into(),
        center,
        ..Default::default()
    }
}

fn world(tribes: &[(&str, usize, [i32; 2])]) -> Simulation {
    let mut sim = Simulation::new(43);
    let total: usize = tribes.iter().map(|t| t.1).sum();
    sim.organisms.truncate(total);
    let mut i = 0;
    for &(lineage, n, [x, y]) in tribes {
        for k in 0..n {
            let o = &mut sim.organisms[i];
            o.alive = true;
            o.age = o.max_age / 3;
            o.lineage_id = lineage.into();
            o.x = (x + (k % 3) as i32) as f32;
            o.y = (y + (k / 3) as i32 % 3) as f32;
            o.home_x = o.x;
            o.home_y = o.y;
            o.inv_food = 2;
            o.inv_wood = 1;
            o.inv_stone = 1;
            i += 1;
        }
        sim.lineage_names.insert(lineage.into(), format!("{lineage}folk"));
    }
    sim.towns.clear();
    sim.caravans.clear();
    sim.treaties.clear();
    sim.battles.clear();
    sim.buildings.clear();
    sim.road_net = Default::default();
    sim.diplomacy = Default::default();
    sim
}

fn granary(sim: &mut Simulation, id: u32, lineage: &str, at: [i32; 2], town: u32, stock: u32) {
    let mut b = Building::new(id, BuildingKind::Granary, at[0], at[1], Some(lineage.into()), 0);
    b.condition = 1.0;
    b.stock = stock;
    b.town = Some(town);
    sim.buildings.push(b);
}

fn day(sim: &mut Simulation, n: u64) {
    sim.tick_count = SUPPLY_STEP * n + SUPPLY_PHASE;
    sim.tick_supply();
}

fn food_near(sim: &Simulation, at: [i32; 2]) -> u32 {
    sim.organisms
        .iter()
        .filter(|o| o.alive && (o.home_x as i32 - at[0]).abs() <= 3 && (o.home_y as i32 - at[1]).abs() <= 3)
        .map(|o| u32::from(o.inv_food))
        .sum()
}

#[test]
fn a_town_with_grain_to_spare_sends_some_to_a_hungry_town_of_its_tribe() {
    let (full, hungry) = ([100, 100], [130, 100]);
    let mut sim = world(&[("clan", 6, full), ("clan", 6, hungry)]);
    sim.towns = vec![town(1, "clan", full), town(2, "clan", hungry)];
    granary(&mut sim, 900, "clan", [104, 100], 1, 80);
    for o in sim.organisms.iter_mut().filter(|o| o.home_x as i32 >= 120) {
        o.inv_food = 0;
    }
    day(&mut sim, 3);
    let caravan = sim
        .caravans
        .iter()
        .find(|c| c.kind == CaravanKind::Supply)
        .cloned()
        .expect("a supply caravan sets out");
    assert_eq!(caravan.cargo, "food");
    assert_eq!((caravan.from, caravan.to), (full, hungry));
    assert!(caravan.amount >= MIN_LOAD);
    assert_eq!(sim.towns[1].short & 1, 1);
    assert_eq!(sim.towns[0].spare & 1, 1);
    assert_eq!(sim.diplomacy.stats.supply_within, 1);
    let before = food_near(&sim, hungry);
    sim.tick_count = caravan.arrives_tick + 200;
    let amount = caravan.amount;
    while sim.caravans.iter().any(|c| c.kind == CaravanKind::Supply)
        && sim.tick_count < caravan.arrives_tick + 2_000
    {
        crate::sim::civ::trade_routes::tick(&mut sim);
        sim.tick_count += 1;
    }
    assert!(food_near(&sim, hungry) >= before + amount.min(12));
    assert_eq!(sim.diplomacy.stats.supply_delivered, 1);
}

#[test]
fn nothing_goes_to_a_tribe_with_a_grudge_or_further_than_a_cart_goes_off_the_roads() {
    let mut sim = world(&[
        ("east", 6, [100, 100]),
        ("west", 6, [130, 100]),
        ("far", 6, [100, 180]),
    ]);
    sim.towns = vec![
        town(1, "east", [100, 100]),
        town(2, "west", [130, 100]),
        town(3, "far", [100, 180]),
    ];
    granary(&mut sim, 900, "east", [104, 100], 1, 80);
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id != "east") {
        o.inv_food = 0;
    }
    sim.remember("east", "west", MemoryKind::Raid, -0.6);
    day(&mut sim, 3);
    assert!(sim.caravans.iter().all(|c| c.kind != CaravanKind::Supply));
    sim.diplomacy = Default::default();
    for other in ["west", "far"] {
        sim.treaties.push(crate::sim::civ::warfare::Treaty {
            lineage_a: "east".into(),
            lineage_b: other.into(),
            kind: crate::sim::civ::warfare::TreatyKind::Trade,
            signed_tick: 0,
            expires_tick: 1_000_000,
        });
    }
    day(&mut sim, 4);
    let sent: Vec<&str> = sim
        .caravans
        .iter()
        .filter(|c| c.kind == CaravanKind::Supply)
        .map(|c| c.receiver_lineage.as_str())
        .collect();
    assert_eq!(sent, vec!["west"]);
}

#[test]
fn the_land_round_a_town_gives_it_its_role_and_its_buildings() {
    let mut sim = world(&[("clan", 9, [100, 100])]);
    sim.towns = vec![town(1, "clan", [100, 100])];
    for y in 86..=114 {
        for x in 86..=114 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.fertility[WorldGrid::idx(x, y)] = 0.0;
            sim.grid.biome[WorldGrid::idx(x, y)] = crate::world::tiles::Biome::Grassland as u8;
        }
    }
    for y in 106..=114 {
        for x in 86..=114 {
            sim.grid.set(x, y, Tile::Rock);
        }
    }
    sim.tick_count = 100;
    sim.score_town_roles();
    assert_eq!(sim.towns[0].role, TownRole::Mining);
    assert_eq!(sim.home_town_role(0), TownRole::Mining);
    assert_eq!(
        TownRole::Mining.skill(),
        Some(crate::organism::skills::Skill::Quarrying)
    );
    for y in 86..=114 {
        for x in 86..=114 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.fertility[WorldGrid::idx(x, y)] = 0.8;
        }
    }
    sim.tick_count = 100 + 5 * DAY_LENGTH;
    sim.score_town_roles();
    assert_eq!(sim.towns[0].role, TownRole::Farming);
    assert_eq!(sim.diplomacy.stats.role_changes, 1);
    assert!(sim
        .events
        .iter()
        .any(|e| e.detail.contains("became a farming town")));
}

#[test]
fn a_town_role_is_saved_and_an_old_town_reads_as_mixed() {
    let mut t = town(4, "clan", [10, 10]);
    t.role = TownRole::Harbour;
    t.role_tick = 900;
    t.short = 0b101;
    let back: Town = serde_json::from_str(&serde_json::to_string(&t).unwrap()).unwrap();
    assert_eq!(back, t);
    let old: Town = serde_json::from_str(r#"{"id":4,"lineage":"clan","center":[10,10]}"#).unwrap();
    assert_eq!(old.role, TownRole::Mixed);
    assert_eq!((old.role_tick, old.short, old.spare), (0, 0, 0));
}
