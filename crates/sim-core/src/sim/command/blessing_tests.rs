//! Long life and courage: the two blessings that extend days and drain fear.

use super::*;

/// Put every person far away, then the first one at (100, 100).
fn one_person_at_100(sim: &mut Simulation) {
    for o in sim.organisms.iter_mut() {
        o.x = 10.0;
        o.y = 10.0;
        o.alive = false;
    }
    let o = &mut sim.organisms[0];
    o.alive = true;
    o.x = 100.0;
    o.y = 100.0;
}

#[test]
fn long_life_adds_years_to_the_people_it_reaches() {
    let mut sim = Simulation::new(3);
    one_person_at_100(&mut sim);
    sim.organisms[0].max_age = 12_000;
    assert!(sim.apply_command_json(r#"{"cmd":"long_life","x":100,"y":100,"radius":4}"#));
    assert_eq!(sim.organisms[0].max_age, 12_900);
}

#[test]
fn long_life_stops_at_its_ceiling() {
    let mut sim = Simulation::new(3);
    one_person_at_100(&mut sim);
    sim.organisms[0].max_age = 24_000;
    assert!(!sim.apply_command_json(r#"{"cmd":"long_life","x":100,"y":100,"radius":4}"#));
    assert_eq!(sim.organisms[0].max_age, 24_000);
}

#[test]
fn courage_drains_fear_and_leaves_calm_people_alone() {
    let mut sim = Simulation::new(3);
    one_person_at_100(&mut sim);
    sim.organisms[0].fear_level = 0.8;
    assert!(sim.apply_command_json(r#"{"cmd":"courage","x":100,"y":100,"radius":4}"#));
    assert!((sim.organisms[0].fear_level - 0.2).abs() < 1e-5);
    sim.organisms[0].fear_level = 0.0;
    assert!(!sim.apply_command_json(r#"{"cmd":"courage","x":100,"y":100,"radius":4}"#));
}
