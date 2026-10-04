use super::*;

/// A finished house on open grass, with nobody near enough to be the
/// nearest living thing for lightning.
fn house_world() -> (Simulation, u32) {
    let mut sim = Simulation::new(3);
    for y in 85..120 {
        for x in 85..120 {
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    sim.organisms.retain(|o| (o.x - 102.0).hypot(o.y - 102.0) > 40.0);
    sim.animals.clear();
    let mut house = Building::new(900, BuildingKind::House, 101, 101, None, 1);
    house.condition = 1.0;
    sim.buildings.push(house);
    (sim, 900)
}

fn damage(sim: &Simulation, id: u32) -> f32 {
    sim.buildings
        .iter()
        .find(|b| b.id == id)
        .map_or(1.0, |b| b.damage_fraction())
}

#[test]
fn every_disaster_that_lands_on_a_home_damages_it() {
    for (cmd, at_least) in [
        (r#"{"cmd":"meteor","x":102,"y":102,"radius":4}"#, 0.99),
        (r#"{"cmd":"volcano","x":102,"y":102,"radius":5}"#, 0.99),
        (r#"{"cmd":"earthquake","x":102,"y":102,"radius":6}"#, 0.5),
        (r#"{"cmd":"smite","x":102,"y":102,"radius":2}"#, 0.3),
        (r#"{"cmd":"flood","x":102,"y":102,"radius":6}"#, 0.25),
        (r#"{"cmd":"blizzard","x":102,"y":102,"radius":6}"#, 0.1),
        (
            r#"{"cmd":"paint","x":102,"y":102,"tile":"water","radius":2}"#,
            0.99,
        ),
        (
            r#"{"cmd":"paint","x":102,"y":102,"tile":"rock","radius":2}"#,
            0.99,
        ),
    ] {
        let (mut sim, id) = house_world();
        assert!(sim.apply_command_json(cmd), "{cmd} had no effect");
        assert!(damage(&sim, id) >= at_least, "{cmd}: damage {}", damage(&sim, id));
    }
}

#[test]
fn a_home_standing_in_a_lake_keeps_flooding() {
    let (mut sim, id) = house_world();
    for y in 99..105 {
        for x in 99..105 {
            sim.grid.set(x, y, Tile::Water);
        }
    }
    for _ in 0..10 {
        sim.tick_count += DAMAGE_TICK_INTERVAL;
        tick_building_damage(&mut sim);
    }
    assert!(damage(&sim, id) > 0.02);
}

#[test]
fn a_ruined_home_hurts_who_is_inside_and_is_announced() {
    let (mut sim, id) = house_world();
    let person = sim.organisms.iter_mut().find(|o| o.alive).expect("someone");
    person.x = 101.0;
    person.y = 101.0;
    person.health = 1.0;
    let pid = person.id.clone();
    let hit = strike_buildings(&mut sim, 101, 101, 2.0, 1.0, 1.0, DamageCause::Meteor);
    assert_eq!(hit, 1);
    assert!(damage(&sim, id) >= 1.0);
    let p = sim.organisms.iter().find(|o| o.id == pid).unwrap();
    assert!(p.health < 0.7);
    assert!(sim
        .events
        .iter()
        .any(|e| e.etype == "building_ruined" && e.detail.contains("a falling star")));
}

#[test]
fn distant_disasters_spare_the_home() {
    let (mut sim, id) = house_world();
    sim.apply_command_json(r#"{"cmd":"meteor","x":140,"y":140,"radius":4}"#);
    assert_eq!(damage(&sim, id), 0.0);
}
