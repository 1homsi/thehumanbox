use crate::math::DetMath;
use crate::sim::simulation::Simulation;

struct ZeroRng;

impl rand::TryRng for ZeroRng {
    type Error = core::convert::Infallible;

    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        Ok(0)
    }

    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        Ok(0)
    }

    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
        dst.fill(0);
        Ok(())
    }
}

fn alive(sim: &Simulation) -> usize {
    sim.organisms.iter().filter(|o| o.alive).count()
}

#[test]
fn spawn_adds_organisms() {
    let mut sim = Simulation::new(1);
    let before = alive(&sim);
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":3}"#));
    assert_eq!(alive(&sim), before + 3);
}

#[test]
fn spawned_tribe_shares_one_generated_lineage() {
    let mut sim = Simulation::new(1);
    let before = sim.organisms.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":5}"#));

    let lineages: crate::hashing::FxHashSet<&str> = sim.organisms[before..]
        .iter()
        .map(|organism| organism.lineage_id.as_str())
        .collect();
    assert_eq!(lineages.len(), 1);
}

#[test]
fn sandbox_spawn_cannot_consume_a_pending_birth_slot() {
    let mut sim = Simulation::new(4);
    sim.set_population_limit(120);
    let mother_id = sim.organisms[1].id.clone();
    sim.organisms[1].pregnant = true;
    sim.organisms[0].alive = false;
    sim.organisms[0].age = 0;
    sim.organisms[0].parent_id = mother_id;
    sim.organisms[0].father_id = Some("father".to_string());
    let alive_before = alive(&sim);

    assert_eq!(crate::sim::growth::population_slots_used(&sim.organisms), 120);
    // Players can keep adding people past the natural limit, and the
    // pending birth keeps its slot.
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":1}"#));
    assert_eq!(alive(&sim), alive_before + 1);
    assert!(sim.organisms[1].pregnant, "the pending birth is untouched");
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":50}"#));
    assert_eq!(crate::sim::growth::population_slots_used(&sim.organisms), 171);
}

#[test]
fn smite_and_heal_report_whether_anyone_was_in_range() {
    let mut sim = Simulation::new(1);
    let target = sim.organisms.iter().position(|o| o.alive).unwrap();
    let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
    for (i, o) in sim.organisms.iter_mut().enumerate() {
        if i != target {
            o.alive = false;
        }
    }

    let far = format!(
        r#"{{"cmd":"heal","x":{},"y":{},"radius":2.0}}"#,
        x + 50.0,
        y + 50.0
    );
    assert!(!sim.apply_command_json(&far));
    let near = format!(r#"{{"cmd":"heal","x":{x},"y":{y},"radius":2.0}}"#);
    assert!(sim.apply_command_json(&near));

    let miss = format!(
        r#"{{"cmd":"smite","x":{},"y":{},"radius":2.0}}"#,
        x + 50.0,
        y + 50.0
    );
    assert!(!sim.apply_command_json(&miss));
    assert!(sim.organisms[target].alive);
    let hit = format!(r#"{{"cmd":"smite","x":{x},"y":{y},"radius":2.0}}"#);
    assert!(sim.apply_command_json(&hit));
    assert!(sim.organisms[target].health < 0.0);
    let (deaths, combat) = (sim.history.deaths_disaster, sim.history.deaths_combat);
    sim.tick();
    assert!(!sim.organisms[target].alive, "dies through the normal death path");
    assert_eq!(
        sim.history.deaths_disaster,
        deaths + 1,
        "and is counted as the gods' lightning"
    );
    assert_eq!(sim.history.deaths_combat, combat, "not as combat");
}

#[test]
fn poison_infects_only_people_in_range() {
    let mut sim = Simulation::new(1);
    let target = sim.organisms.iter().position(|o| o.alive).unwrap();
    let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
    sim.organisms[target].infection = 0.0;

    let miss = format!(
        r#"{{"cmd":"poison","x":{},"y":{},"radius":0.5}}"#,
        x + 90.0,
        y + 90.0
    );
    let reached_far = sim
        .organisms
        .iter()
        .any(|o| o.alive && (o.x - x - 90.0).det_hypot(o.y - y - 90.0) <= 0.5);
    assert_eq!(sim.apply_command_json(&miss), reached_far);

    let hit = format!(r#"{{"cmd":"poison","x":{x},"y":{y},"radius":0.5}}"#);
    assert!(sim.apply_command_json(&hit));
    assert!(sim.organisms[target].infection >= 0.85);
}

#[test]
fn meteor_kills_in_range_and_leaves_a_burning_crater() {
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(1);
    let (cx, cy) = (100, 100);
    for dx in -8..=8 {
        for dy in -8..=8 {
            sim.grid.set(cx + dx, cy + dy, Tile::Grass);
        }
    }
    let target = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[target].x = cx as f32 + 1.0;
    sim.organisms[target].y = cy as f32;
    assert!(sim.apply_command_json(&format!(r#"{{"cmd":"meteor","x":{cx},"y":{cy},"radius":4}}"#)));
    assert!(sim.organisms[target].health < 0.0);
    assert_eq!(sim.grid.get(cx, cy), Tile::Rock);
    assert_eq!(sim.grid.get(cx + 3, cy), Tile::Ash);
    assert_eq!(sim.grid.get(cx + 5, cy), Tile::Fire);
    assert_eq!(sim.grid.get(cx + 8, cy), Tile::Grass);
    assert!(!sim.apply_command_json(r#"{"cmd":"meteor","x":-50,"y":-50,"radius":4}"#));
}

#[test]
fn guiding_a_lineage_to_explore_sends_adults_on_one_shared_journey() {
    let mut sim = Simulation::new(3);
    let lineage = sim
        .organisms
        .iter()
        .find(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .expect("a living lineage");
    for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == lineage) {
        o.age = 1000;
    }
    let cmd =
        format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"explore","duration_ticks":1200}}"#);
    assert!(sim.apply_command_json(&cmd));
    let targets: crate::hashing::FxHashSet<(i32, i32)> = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lineage && o.age >= 700)
        .filter_map(|o| o.journey.as_ref().map(|j| j.target))
        .collect();
    let travellers = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lineage && o.journey.is_some())
        .count();
    assert!(travellers > 0, "someone set out");
    assert_eq!(targets.len(), 1, "adults share one destination");
}

#[test]
fn smite_strikes_the_nearest_animal_when_no_one_is_closer() {
    let mut sim = Simulation::new(1);
    for o in sim.organisms.iter_mut() {
        o.x = 10.0;
        o.y = 10.0;
    }
    assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":150.0,"y":150.0,"kind":"deer"}"#));
    let deer = sim.animals.len() - 1;
    sim.animals[deer].x = 150.0;
    sim.animals[deer].y = 150.0;
    assert!(sim.apply_command_json(r#"{"cmd":"smite","x":150.0,"y":150.0,"radius":3.0}"#));
    assert!(!sim.animals[deer].alive);
}

#[test]
fn a_spawned_tribe_gets_a_name() {
    let mut sim = Simulation::new(1);
    let before = sim.organisms.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":300.0,"y":200.0,"count":5}"#));
    let lid = sim.organisms[before].lineage_id.clone();
    assert!(sim.lineage_names.get(&lid).is_some_and(|n| !n.is_empty()));
}

#[test]
fn one_new_person_joins_the_nearest_tribe() {
    let mut sim = Simulation::new(1);
    let host = sim.organisms.iter().position(|o| o.alive).unwrap();
    let (x, y) = (sim.organisms[host].x, sim.organisms[host].y);
    let lineage = sim.organisms[host].lineage_id.clone();
    let before = sim.organisms.len();
    let cmd = format!(r#"{{"cmd":"spawn","x":{x},"y":{y},"count":1}}"#);
    assert!(sim.apply_command_json(&cmd));
    assert_eq!(sim.organisms.len(), before + 1);
    assert_eq!(sim.organisms[before].lineage_id, lineage);
}

#[test]
fn bless_and_inspire_change_people_in_range() {
    let mut sim = Simulation::new(1);
    let target = sim.organisms.iter().position(|o| o.alive).unwrap();
    let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
    sim.organisms[target].health = 0.3;
    sim.organisms[target].hope = 0.1;
    assert!(sim.apply_command_json(&format!(r#"{{"cmd":"bless","x":{x},"y":{y},"radius":1.0}}"#)));
    assert_eq!(sim.organisms[target].health, 1.0);
    assert!(sim.organisms[target].hope > 0.4);

    let known = sim.organisms[target].discoveries.len();
    let literacy = sim.organisms[target].literacy;
    assert!(sim.apply_command_json(&format!(r#"{{"cmd":"inspire","x":{x},"y":{y},"radius":1.0}}"#)));
    assert!(sim.organisms[target].literacy > literacy);
    assert_eq!(sim.organisms[target].discoveries.len(), known + 1);
}

#[test]
fn earthquake_cracks_land_and_hurts_people() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(1);
    for dx in -6..=6 {
        for dy in -6..=6 {
            sim.grid.set(100 + dx, 100 + dy, Tile::Grass);
        }
    }
    let target = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[target].x = 100.0;
    sim.organisms[target].y = 100.0;
    sim.organisms[target].health = 1.0;
    assert!(sim.apply_command_json(r#"{"cmd":"earthquake","x":100,"y":100,"radius":5}"#));
    assert!(sim.organisms[target].health < 0.5);
    let cracked = (-5..=5)
        .flat_map(|dx| (-5..=5).map(move |dy| (dx, dy)))
        .filter(|&(dx, dy)| sim.grid.get(100 + dx, 100 + dy) != Tile::Grass)
        .count();
    assert!(cracked > 5, "the ground cracked ({cracked} tiles)");
}

#[test]
fn war_and_peace_set_attitudes_between_the_nearest_tribes() {
    let mut sim = Simulation::new(1);
    let a = sim.organisms[0].lineage_id.clone();
    let other = sim
        .organisms
        .iter()
        .position(|o| o.alive && o.lineage_id != a)
        .unwrap();
    let b = sim.organisms[other].lineage_id.clone();
    for o in sim.organisms.iter_mut() {
        if o.lineage_id == a || o.lineage_id == b {
            o.x = 50.0;
            o.y = 50.0;
        } else {
            o.x = 300.0;
            o.y = 200.0;
        }
    }
    assert!(sim.apply_command_json(r#"{"cmd":"war","x":50.0,"y":50.0}"#));
    assert_eq!(sim.organisms[0].lineage_attitudes.get(&b).copied(), Some(-1.0));
    assert!(sim.apply_command_json(r#"{"cmd":"peace","x":50.0,"y":50.0}"#));
    assert_eq!(sim.organisms[other].lineage_attitudes.get(&a).copied(), Some(1.0));
}

#[test]
fn every_animal_kind_can_be_spawned_by_name() {
    use crate::organism::animal::AnimalKind;
    let mut sim = Simulation::new(1);
    for kind in AnimalKind::ALL {
        let cmd = format!(
            r#"{{"cmd":"spawn_animal","x":120.0,"y":90.0,"kind":"{}"}}"#,
            kind.name()
        );
        assert!(sim.apply_command_json(&cmd), "{}", kind.name());
        assert!(
            sim.animals.last().unwrap().kind == kind,
            "{} spawned as itself",
            kind.name()
        );
    }
}

#[test]
fn bad_command_rejected() {
    let mut sim = Simulation::new(1);
    assert!(!sim.apply_command_json(r#"{"cmd":"definitely_not_a_command"}"#));
    assert!(!sim.apply_command_json("not even json"));
}

#[test]
fn weather_and_drought_apply() {
    let mut sim = Simulation::new(1);
    assert!(sim.apply_command_json(r#"{"cmd":"weather","kind":"storm"}"#));
    assert_eq!(sim.weather.kind, 2);
    assert!(sim.apply_command_json(r#"{"cmd":"drought","active":true}"#));
    assert!(sim.drought.active);
}

#[test]
fn spawn_animal_adds_one() {
    let mut sim = Simulation::new(1);
    let before = sim.animals.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"wolf"}"#));
    assert_eq!(sim.animals.len(), before + 1);
}

#[test]
fn spawn_animal_still_works_in_a_crowded_mature_world() {
    let mut sim = Simulation::new(1);
    while sim.animals.iter().filter(|a| a.alive).count() < 700 {
        assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"deer"}"#));
    }
    assert!(sim.apply_command_json(r#"{"cmd":"spawn_animal","x":80.0,"y":80.0,"kind":"wolf"}"#));
}

#[test]
fn sandbox_can_place_shelter_and_campfire() {
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(1);
    sim.grid.set(100, 100, Tile::Fire);
    *sim.grid.fire_intensity_mut(100, 100) = 0.8;
    sim.physics.register_fire(100, 100);
    assert!(sim.apply_command_json(r#"{"cmd":"paint","x":100,"y":100,"tile":"hut","radius":0}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Hut);
    assert_eq!(sim.grid.fire_intensity(100, 100), 0.0);

    assert!(sim.apply_command_json(r#"{"cmd":"paint","x":102,"y":100,"tile":"campfire","radius":0}"#));
    assert_eq!(sim.grid.get(102, 100), Tile::Campfire);
    assert_eq!(sim.grid.fire_intensity(102, 100), 1.0);
}

#[test]
fn sandbox_ignite_registers_fire_with_physics() {
    use crate::world::tiles::Tile;

    let mut sim = Simulation::new(2);
    for dx in -1..=1 {
        for dy in -1..=1 {
            sim.grid.set(100 + dx, 100 + dy, Tile::Grass);
        }
    }
    assert!(sim.apply_command_json(r#"{"cmd":"ignite","x":100,"y":100,"radius":0}"#));
    assert_eq!(sim.grid.fire_intensity(100, 100), 1.0);

    sim.physics.tick(&mut sim.grid, &mut ZeroRng, 0, false);
    assert!(sim.grid.fire_intensity(100, 100) < 1.0);
    assert_eq!(sim.grid.get(101, 100), Tile::Fire);
}

#[test]
fn guide_accepts_only_living_lineages_allowed_strategies_and_bounded_duration() {
    let mut sim = Simulation::new(3);
    sim.tick_count = 500;
    let lineage = sim
        .organisms
        .iter()
        .find(|organism| organism.alive)
        .unwrap()
        .lineage_id
        .clone();

    let guide =
        format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"explore","duration_ticks":600}}"#);
    let guided_index = sim
        .organisms
        .iter()
        .position(|organism| organism.alive && organism.lineage_id == lineage)
        .unwrap();
    let protected_index = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(index, organism)| *index != guided_index && organism.alive && organism.lineage_id == lineage)
        .map(|(index, _)| index);
    if let Some(index) = protected_index {
        sim.organisms[index].directive = "flee".to_string();
        sim.organisms[index].directive_until = 550;
    }
    assert!(sim.apply_command_json(&guide));
    assert_eq!(
        sim.lineage_strategies.get(&lineage),
        Some(&("explore".to_string(), 1100))
    );
    let objective = sim.lineage_strategy_objectives.get(&lineage).unwrap();
    assert_eq!(objective.strategy, "explore");
    assert_eq!(objective.started_tick, 500);
    assert_eq!(objective.expires_tick, 1100);
    assert_eq!(objective.progress, 0);
    assert_eq!(objective.target, 300);
    assert_eq!(objective.completed_tick, None);
    assert_eq!(sim.organisms[guided_index].directive, "explore");
    assert_eq!(sim.organisms[guided_index].directive_until, 1100);
    if let Some(index) = protected_index {
        assert_eq!(sim.organisms[index].directive, "flee");
        assert_eq!(sim.organisms[index].directive_until, 550);
    }

    let alias =
        format!(r#"{{"cmd":"set_strategy","lineage":"{lineage}","strategy":"defend","duration":60}}"#);
    assert!(sim.apply_command_json(&alias));
    assert_eq!(
        sim.lineage_strategies.get(&lineage),
        Some(&("defend".to_string(), 560))
    );
    let objective = sim.lineage_strategy_objectives.get(&lineage).unwrap();
    assert_eq!(objective.strategy, "defend");
    assert_eq!(objective.started_tick, 500);
    assert_eq!(objective.expires_tick, 560);
    assert_eq!(objective.target, 30);
    assert_eq!(sim.lineage_strategy_history.len(), 1);
    let redirected = sim.lineage_strategy_history.back().unwrap();
    assert_eq!(redirected.lineage_id, lineage);
    assert_eq!(redirected.strategy, "explore");
    assert_eq!(redirected.outcome, "redirected");
    assert_eq!(sim.organisms[guided_index].directive, "defend");
    assert_eq!(sim.organisms[guided_index].directive_until, 560);
    if let Some(index) = protected_index {
        assert_eq!(sim.organisms[index].directive, "flee");
        assert_eq!(sim.organisms[index].directive_until, 550);
        sim.tick_count = 551;
        sim.refresh_lineage_guidance(index);
        assert_eq!(sim.organisms[index].directive, "defend");
        assert_eq!(sim.organisms[index].directive_until, 560);
    }

    for invalid in [
        format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"conquer","duration_ticks":600}}"#),
        format!(r#"{{"cmd":"guide","lineage":"{lineage}","strategy":"hunt","duration_ticks":59}}"#),
        r#"{"cmd":"guide","lineage":"missing","strategy":"hunt","duration_ticks":600}"#.to_string(),
    ] {
        assert!(!sim.apply_command_json(&invalid));
    }
}

/// A sim with one living adult standing on open grass at (100, 100).
fn sim_with_person_at_100() -> (Simulation, usize) {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(7);
    for dx in -10..=10 {
        for dy in -10..=10 {
            sim.grid.set(100 + dx, 100 + dy, Tile::Grass);
        }
    }
    let target = sim.organisms.iter().position(|o| o.alive).unwrap();
    let o = &mut sim.organisms[target];
    o.x = 100.0;
    o.y = 100.0;
    o.age = 2_000;
    o.health = 1.0;
    o.energy = 1.0;
    (sim, target)
}

#[test]
fn helpful_powers_heal_feed_arm_and_protect() {
    use crate::organism::animal::{Animal, AnimalKind};
    use crate::world::tiles::Tile;
    let (mut sim, target) = sim_with_person_at_100();

    assert!(sim.apply_command_json(r#"{"cmd":"harvest","x":100.0,"y":100.0,"radius":5.0}"#));
    let food = (95..=105)
        .flat_map(|x| (95..=105).map(move |y| (x, y)))
        .filter(|&(x, y)| sim.grid.get(x, y) == Tile::Food)
        .count();
    assert!(food > 10, "harvest grew {food} food tiles");

    sim.organisms[target].infection = 0.9;
    sim.organisms[target].diseases.push(("plague".to_string(), 0));
    assert!(sim.apply_command_json(r#"{"cmd":"cure","x":100.0,"y":100.0}"#));
    assert_eq!(sim.organisms[target].infection, 0.0);
    assert!(sim.organisms[target].diseases.is_empty());
    assert!(
        sim.organisms[target]
            .disease_immunity
            .get("plague")
            .copied()
            .unwrap_or(0)
            > sim.tick_count
    );

    assert!(sim.apply_command_json(r#"{"cmd":"arm","x":100.0,"y":100.0,"radius":1.0}"#));
    assert!(sim.organisms[target].discoveries.contains("spear"));

    sim.organisms[target].inv_food = 0;
    assert!(sim.apply_command_json(r#"{"cmd":"bounty","x":100.0,"y":100.0,"radius":1.0}"#));
    assert!(sim.organisms[target].inv_food >= 5 && sim.organisms[target].inv_wood >= 5);

    sim.grid.set(102, 100, Tile::Fire);
    assert!(sim.apply_command_json(r#"{"cmd":"douse","x":100,"y":100,"radius":4}"#));
    assert_eq!(sim.grid.get(102, 100), Tile::Ash);

    let id = sim.next_animal_id;
    sim.next_animal_id += 1;
    sim.animals
        .push(Animal::new(id, 103.0, 100.0, AnimalKind::Dragon));
    sim.animals
        .push(Animal::new(id + 1, 104.0, 100.0, AnimalKind::Deer));
    assert!(sim.apply_command_json(r#"{"cmd":"banish","x":100.0,"y":100.0,"radius":6.0}"#));
    assert!(!sim
        .animals
        .iter()
        .any(|a| a.alive && a.kind == AnimalKind::Dragon));
    assert!(sim.animals.iter().any(|a| a.alive && a.kind == AnimalKind::Deer));
}

#[test]
fn harmful_powers_spoil_flood_freeze_and_hurt() {
    use crate::world::tiles::Tile;
    let (mut sim, target) = sim_with_person_at_100();

    sim.grid.set(101, 100, Tile::Food);
    sim.organisms[target].inv_food = 6;
    assert!(sim.apply_command_json(r#"{"cmd":"blight","x":100,"y":100,"radius":3}"#));
    assert_ne!(sim.grid.get(101, 100), Tile::Food);
    assert_eq!(sim.organisms[target].inv_food, 0);

    assert!(sim.apply_command_json(r#"{"cmd":"frenzy","x":100.0,"y":100.0,"radius":1.0}"#));
    assert!(sim.organisms[target].health < 1.0);

    let energy = sim.organisms[target].energy;
    assert!(sim.apply_command_json(r#"{"cmd":"blizzard","x":100,"y":100,"radius":4}"#));
    assert_eq!(sim.grid.get(103, 100), Tile::Snow);
    assert!(sim.organisms[target].energy < energy);

    assert!(sim.apply_command_json(r#"{"cmd":"flood","x":100,"y":100,"radius":4}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Water);
    assert_eq!(sim.grid.get(103, 100), Tile::Flooded);
}

#[test]
fn a_meteor_leaves_ore_in_its_crater_but_not_at_the_centre() {
    use crate::world::tiles::Tile;
    let mut sim = Simulation::new(3);
    for y in 80..120 {
        for x in 80..120 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.events.clear();
    assert!(sim.apply_command_json(r#"{"cmd":"meteor","x":100,"y":100,"radius":8}"#));
    let ore: Vec<(i32, i32)> = (80..120)
        .flat_map(|y| (80..120).map(move |x| (x, y)))
        .filter(|&(x, y)| sim.grid.get(x, y) == Tile::Mineral)
        .collect();
    assert!(!ore.is_empty(), "the crater has no ore");
    assert!(ore
        .iter()
        .all(|&(x, y)| (x - 100) * (x - 100) + (y - 100) * (y - 100) <= 8 * 8 / 4 + 1));
    assert_ne!(sim.grid.get(100, 100), Tile::Mineral);
    assert!(sim
        .events
        .iter()
        .any(|e| e.detail.contains("tiles of ore in its crater")));
}

#[test]
fn thunder_strikes_someone_in_range() {
    let (mut sim, target) = sim_with_person_at_100();
    // Pack everyone else far away so the strikes have one target.
    for (i, o) in sim.organisms.iter_mut().enumerate() {
        if i != target {
            o.x = 10.0;
            o.y = 10.0;
        }
    }
    sim.animals.clear();
    let mut struck = false;
    for _ in 0..20 {
        sim.apply_command_json(r#"{"cmd":"thunder","x":100.0,"y":100.0,"radius":1.0}"#);
        if sim.organisms[target].health < 0.0 {
            struck = true;
            break;
        }
    }
    assert!(struck);
}

#[test]
fn zombies_turn_their_victims() {
    use crate::organism::animal::{Animal, AnimalKind};
    let (mut sim, target) = sim_with_person_at_100();
    sim.animals.clear();
    let mut risen = false;
    for _ in 0..400 {
        if !sim
            .animals
            .iter()
            .any(|a| a.alive && a.kind == AnimalKind::Zombie)
        {
            let id = sim.next_animal_id;
            sim.next_animal_id += 1;
            let (x, y) = (sim.organisms[target].x, sim.organisms[target].y);
            sim.animals.push(Animal::new(id, x, y, AnimalKind::Zombie));
        }
        if sim.organisms[target].alive {
            sim.organisms[target].health = sim.organisms[target].health.min(0.05);
        }
        sim.tick();
        if sim.events.iter().any(|e| e.detail.contains("rose as a zombie")) {
            risen = true;
            break;
        }
    }
    assert!(risen);
}

#[test]
fn biome_brush_volcano_love_and_tame() {
    use crate::organism::animal::{Animal, AnimalKind};
    use crate::world::tiles::{Biome, Tile};
    let (mut sim, target) = sim_with_person_at_100();

    assert!(sim.apply_command_json(r#"{"cmd":"paint_biome","x":100,"y":100,"radius":3,"biome":"badlands"}"#));
    assert_eq!(sim.grid.biome_at(101, 100), Biome::Badlands);
    assert_eq!(sim.grid.get(101, 100), Tile::Sand);
    assert!(!sim.apply_command_json(r#"{"cmd":"paint_biome","x":100,"y":100,"biome":"candy"}"#));

    sim.animals.clear();
    sim.animals.push(Animal::new(1, 101.0, 100.0, AnimalKind::Wolf));
    assert!(sim.apply_command_json(r#"{"cmd":"tame","x":100.0,"y":100.0,"radius":4.0}"#));
    assert!(sim.animals[0].kind == AnimalKind::Dog);
    assert!(sim.animals[0].bonded_org.is_some());

    sim.organisms[target].last_reproduced = 999;
    assert!(sim.apply_command_json(r#"{"cmd":"love","x":100.0,"y":100.0,"radius":2.0}"#));
    assert_eq!(sim.organisms[target].last_reproduced, 0);

    assert!(sim.apply_command_json(r#"{"cmd":"volcano","x":100,"y":100,"radius":6}"#));
    assert_eq!(sim.grid.get(100, 100), Tile::Lava);
    assert_eq!(sim.grid.get(102, 100), Tile::Rock);
    assert_eq!(sim.grid.biome_at(105, 100), Biome::Volcanic);
    assert!(sim.organisms[target].health < 0.0);

    assert!(sim.apply_command_json(r#"{"cmd":"meteor_shower","x":150.0,"y":150.0,"radius":8.0}"#));
}

#[test]
fn a_zombie_outbreak_grows_only_by_its_victims() {
    use crate::organism::animal::{Animal, AnimalKind};
    let mut sim = Simulation::new(42);
    for _ in 0..300 {
        sim.tick();
    }
    let (x, y) = sim
        .organisms
        .iter()
        .find(|o| o.alive)
        .map(|o| (o.x, o.y))
        .unwrap();
    let id = sim.next_animal_id;
    sim.next_animal_id += 1;
    sim.animals.push(Animal::new(id, x, y, AnimalKind::Zombie));
    let mut risen = 0usize;
    for _ in 0..400 {
        sim.tick();
        risen += sim
            .events
            .iter()
            .filter(|e| e.tick == sim.tick_count && e.detail == "rose as a zombie")
            .count();
        let zombies = sim
            .animals
            .iter()
            .filter(|a| a.alive && a.kind == AnimalKind::Zombie)
            .count();
        // The first zombie plus one per victim who rose, never a runaway.
        assert!(
            zombies <= risen + 1,
            "{zombies} zombies but only {risen} victims rose"
        );
    }
}

#[test]
fn monsters_are_never_born_or_hunted_for_meat() {
    use crate::organism::animal::{Animal, AnimalKind};
    let mut sim = Simulation::new(3);
    sim.animals.clear();
    for (i, kind) in AnimalKind::MONSTERS.into_iter().enumerate() {
        let mut a = Animal::new(i, 60.0 + i as f32 * 20.0, 60.0, kind);
        a.energy = 1.0;
        sim.animals.push(a);
    }
    sim.next_animal_id = 100;
    for _ in 0..1_000 {
        sim.tick();
    }
    for kind in AnimalKind::MONSTERS {
        let count = sim.animals.iter().filter(|a| a.alive && a.kind == kind).count();
        assert!(
            count <= 1 || kind == AnimalKind::Zombie,
            "{} multiplied to {count}",
            kind.name()
        );
    }
}
