use super::*;
use crate::sim::civ::civ_tick::town::Town;
use crate::sim::civ::society::nations::Nation;
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

fn world(tribes: &[(&str, usize, [i32; 2], u8)]) -> Simulation {
    let mut sim = Simulation::new(53);
    let total: usize = tribes.iter().map(|t| t.1).sum();
    sim.organisms.truncate(total);
    let mut i = 0;
    for &(lineage, n, [x, y], food) in tribes {
        for k in 0..n {
            let o = &mut sim.organisms[i];
            o.alive = true;
            o.age = o.max_age / 3;
            o.lineage_id = lineage.into();
            o.x = (x + (k % 3) as i32) as f32;
            o.y = (y + (k / 3) as i32 % 3) as f32;
            o.home_x = o.x;
            o.home_y = o.y;
            o.inv_food = food;
            o.energy = if food == 0 { 0.3 } else { 0.9 };
            o.lineage_attitudes.clear();
            i += 1;
        }
        sim.lineage_names.insert(lineage.into(), format!("{lineage}folk"));
    }
    for y in 80..=160 {
        for x in 80..=200 {
            sim.grid.set(x, y, Tile::Grass);
            sim.grid.road[WorldGrid::idx(x, y)] = crate::world::grid::ROAD_NONE;
        }
    }
    sim.towns.clear();
    sim.caravans.clear();
    sim.treaties.clear();
    sim.battles.clear();
    sim.buildings.clear();
    sim.road_net = Default::default();
    sim.diplomacy = Default::default();
    sim.land = Default::default();
    sim
}

fn nation(sim: &mut Simulation, members: &[&str]) {
    sim.diplomacy.nations.push(Nation {
        id: 1,
        name: "Ovarra".into(),
        capital: 2,
        ruler: members[0].into(),
        members: members.iter().map(|m| (*m).to_string()).collect(),
        colour: 1,
        founded_tick: 0,
        cohesion: 1.0,
    });
    sim.index_nations();
}

fn pass(sim: &mut Simulation, n: u64) {
    sim.tick_count = MIGRATION_STEP * n + MIGRATION_PHASE;
    sim.start_migrations();
}

fn arrive(sim: &mut Simulation) {
    let to = sim.land.migrations[0].to;
    let members = sim.land.migrations[0].members.clone();
    for o in sim.organisms.iter_mut().filter(|o| members.contains(&o.id)) {
        o.x = to[0] as f32;
        o.y = to[1] as f32;
    }
    sim.tick_count = sim.tick_count - sim.tick_count % MOVE_STEP + MOVE_STEP + MOVE_PHASE;
    sim.walk_migrations();
}

#[test]
fn a_starving_town_sends_a_group_down_the_road_to_a_fed_town_of_its_nation() {
    let mut sim = world(&[("hungry", 9, [100, 100], 0), ("fed", 9, [140, 100], 9)]);
    sim.towns = vec![town(1, "hungry", [100, 100]), town(2, "fed", [140, 100])];
    nation(&mut sim, &["fed", "hungry"]);
    pass(&mut sim, 2);
    assert_eq!(sim.land.migrations.len(), 1);
    let m = sim.land.migrations[0].clone();
    assert_eq!((m.cause, m.from_town, m.to_town), (MigrationCause::Famine, 1, 2));
    assert_eq!(m.members.len(), 3);
    assert_eq!(m.path.first(), Some(&[100, 100]));
    assert_eq!(m.path.last(), Some(&[140, 100]));
    for o in sim.organisms.iter().filter(|o| m.members.contains(&o.id)) {
        assert_eq!((o.home_x as i32, o.home_y as i32), (140, 100));
    }
    sim.tick_count += MOVE_STEP - sim.tick_count % MOVE_STEP + MOVE_PHASE;
    sim.walk_migrations();
    let walking = sim
        .organisms
        .iter()
        .filter(|o| m.members.contains(&o.id) && o.journey.is_some())
        .count();
    assert_eq!(walking, 3, "the group sets out together");
    pass(&mut sim, 3);
    assert_eq!(sim.land.migrations.len(), 1, "one group at a time from a town");
    arrive(&mut sim);
    assert!(sim.land.migrations.is_empty());
    let joined = sim
        .organisms
        .iter()
        .filter(|o| m.members.contains(&o.id) && o.lineage_id == "fed")
        .count();
    assert_eq!(joined, 3, "the nation takes them in");
    assert_eq!(sim.land.stats.welcomed, 1);
    assert!(sim.diplomacy.relations.standing("hungry", "fed") > 0.2);
    assert!(sim
        .events
        .iter()
        .any(|e| e.detail.contains("Famine drove 3 of the hungryfolk")));
    assert!(sim.events.iter().any(|e| e.detail.contains("took in 3 refugees")));
}

#[test]
fn a_poor_stranger_turns_refugees_away_and_they_make_camp_in_old_ruins() {
    let mut sim = world(&[("hungry", 9, [100, 100], 0), ("cold", 9, [140, 100], 4)]);
    sim.towns = vec![town(1, "hungry", [100, 100]), town(2, "cold", [140, 100])];
    sim.land.ruins.push(crate::sim::civ::land::land_memory::TownRuin {
        id: 9,
        center: [130, 120],
        ..Default::default()
    });
    pass(&mut sim, 2);
    assert_eq!(
        sim.land.migrations.len(),
        1,
        "a stranger without a grudge is worth asking"
    );
    arrive(&mut sim);
    assert_eq!(sim.land.stats.turned_away, 1);
    assert_eq!(sim.land.stats.settled, 1);
    assert!(sim.diplomacy.relations.standing("hungry", "cold") < 0.0);
    let members = sim
        .organisms
        .iter()
        .filter(|o| o.lineage_id == "hungry" && o.home_x as i32 == 130)
        .count();
    assert_eq!(members, 3, "they made camp in the ruins");
    assert!(sim
        .events
        .iter()
        .any(|e| e.detail.contains("turned away 3 refugees")));
}

#[test]
fn nobody_leaves_toward_enemies_or_a_town_out_of_reach() {
    let mut sim = world(&[
        ("hungry", 9, [100, 100], 0),
        ("foe", 9, [140, 100], 9),
        ("far", 9, [100, 300], 9),
    ]);
    sim.towns = vec![
        town(1, "hungry", [100, 100]),
        town(2, "foe", [140, 100]),
        town(3, "far", [100, 300]),
    ];
    sim.remember("hungry", "foe", MemoryKind::Raid, -0.5);
    pass(&mut sim, 2);
    assert!(sim.land.migrations.is_empty());
    assert_eq!(sim.land.stats.refugees, 0);
}
