//! Wolves the player summons: they hunt as a pack at night, raid livestock and send people to shelter.
//! Wild wolves keep their old behaviour; these tests pin both sides.

use super::*;
use crate::sim::simulation::animals::SUMMONED_ALARM;

/// Midnight-ish on the day clock, when `is_night` is true.
fn night_tick() -> u64 {
    (DAY_LENGTH as f64 * 0.85) as u64
}

/// Noon on the day clock.
fn day_tick() -> u64 {
    DAY_LENGTH / 2
}

/// Only the listed people are alive, placed and sheltered at home; the rest of the world is cleared.
fn only_people(sim: &mut Simulation, at: &[(f32, f32)]) {
    for o in sim.organisms.iter_mut() {
        o.alive = false;
    }
    sim.animals.clear();
    for (i, &(x, y)) in at.iter().enumerate() {
        let o = &mut sim.organisms[i];
        o.alive = true;
        o.x = x;
        o.y = y;
        o.health = 1.0;
        o.infection = 0.0;
        o.energy = 1.0;
        o.home_x = x;
        o.home_y = y;
    }
}

fn wolf(sim: &Simulation, x: f32, y: f32, summoned: bool, energy: f32) -> Animal {
    let mut a = Animal::new(sim.animals.len() + 1000, x, y, AnimalKind::Wolf);
    a.energy = energy;
    a.summoned = summoned;
    a
}

/// Ticks the animals (not the people) `ticks` times, the way the world does each tick.
fn run_animals(sim: &mut Simulation, ticks: usize) {
    let index = crate::hashing::FxHashMap::default();
    for _ in 0..ticks {
        sim.tick_animals(&index);
    }
}

#[test]
fn a_summoned_wolf_hunts_at_night_even_when_fed_and_a_wild_one_does_not() {
    let mut sim = Simulation::new(31);
    only_people(&mut sim, &[(60.0, 60.0)]);
    sim.tick_count = night_tick();
    sim.animals.push(wolf(&sim, 90.0, 90.0, true, 1.0));
    sim.animals.push(wolf(&sim, 30.0, 30.0, false, 1.0));
    run_animals(&mut sim, 1);
    assert!(sim.animals[0].hunting, "a summoned wolf hunts through the night");
    assert!(
        !sim.animals[1].hunting,
        "a wild wolf does not hunt just because it is night"
    );

    sim.tick_count = day_tick();
    run_animals(&mut sim, 1);
    assert!(
        !sim.animals[0].hunting,
        "by day the summoned wolf goes back to resting when fed"
    );
}

#[test]
fn a_summoned_pack_bites_people_at_night_and_a_fed_wild_wolf_does_not() {
    let mut sim = Simulation::new(32);
    flatten_test_area(&mut sim, 60, 60);
    only_people(&mut sim, &[(60.0, 60.0)]);
    sim.tick_count = night_tick();
    sim.animals.push(wolf(&sim, 60.0, 61.0, true, 1.0));
    sim.animals.push(wolf(&sim, 60.0, 61.0, true, 1.0));
    run_animals(&mut sim, 60);
    assert!(
        sim.organisms[0].health < 1.0,
        "a summoned pack at night bites the person beside it"
    );

    let mut wild = Simulation::new(32);
    only_people(&mut wild, &[(60.0, 60.0)]);
    wild.tick_count = night_tick();
    wild.animals.push(wolf(&wild, 60.0, 61.0, false, 1.0));
    run_animals(&mut wild, 60);
    assert_eq!(
        wild.organisms[0].health, 1.0,
        "a wild wolf that is not hungry leaves the person alone"
    );
}

#[test]
fn a_summoned_pack_raids_the_pen_at_night_and_a_wild_wolf_does_not() {
    let sheep_at = (80.0, 80.0);
    let raid = |summoned: bool| {
        let mut sim = Simulation::new(33);
        flatten_test_area(&mut sim, 80, 80);
        only_people(&mut sim, &[(10.0, 10.0)]);
        sim.tick_count = night_tick();
        let mut sheep = Animal::new(7, sheep_at.0, sheep_at.1, AnimalKind::Sheep);
        sheep.keeper = Some("L-keep".to_string());
        sheep.pen = Some((80, 80));
        sim.animals.push(sheep);
        sim.animals.push(wolf(&sim, 80.0, 84.0, summoned, 1.0));
        run_animals(&mut sim, 80);
        // Dead animals are cleared from the list, so the sheep is alive only if it is still there.
        sim.animals.iter().any(|a| a.kind == AnimalKind::Sheep && a.alive)
    };
    assert!(
        !raid(true),
        "the summoned pack goes over the rails and takes the sheep"
    );
    assert!(raid(false), "a fed wild wolf leaves penned livestock alone");
}

#[test]
fn people_run_for_home_from_a_summoned_pack_further_off_than_from_a_wild_wolf() {
    let run_away = |summoned: bool| {
        let mut sim = Simulation::new(34);
        flatten_test_area(&mut sim, 60, 60);
        only_people(&mut sim, &[(60.0, 60.0)]);
        // Home lies 8 tiles north, away from the wolf: not where they already are.
        sim.organisms[0].home_y = 52.0;
        sim.tick_count = day_tick();
        // Eight tiles off: beyond the 2.5 tiles a wild wolf must reach before anyone runs.
        sim.animals.push(wolf(&sim, 60.0, 68.0, summoned, 1.0));
        sim.tick();
        sim.organisms[0]
            .thought_history
            .iter()
            .any(|t| t.text.contains("run!"))
    };
    assert!(
        run_away(true),
        "a summoned pack is heard from {} tiles",
        SUMMONED_ALARM
    );
    assert!(
        !run_away(false),
        "a wild wolf eight tiles off does not start a flight"
    );
}

#[test]
fn a_summoned_wolf_is_saved_and_a_wild_one_is_not_marked() {
    let mut sim = Simulation::new(35);
    only_people(&mut sim, &[(60.0, 60.0)]);
    sim.animals.push(wolf(&sim, 70.0, 70.0, true, 1.0));
    sim.animals.push(wolf(&sim, 75.0, 75.0, false, 1.0));
    let json = serde_json::to_string(&sim.to_save_state()).unwrap();
    assert_eq!(
        json.matches("\"summoned\":true").count(),
        1,
        "only the summoned wolf is marked in the save"
    );
    assert!(
        !json.contains("\"summoned\":false"),
        "a wild animal writes no summoned field"
    );
}

#[test]
fn a_summoned_pack_bite_finishes_a_person_already_hurt() {
    let mut sim = Simulation::new(36);
    flatten_test_area(&mut sim, 60, 60);
    only_people(&mut sim, &[(60.0, 60.0)]);
    // Already hurt: a bite from the pack takes them to zero health, where the death is then recorded.
    sim.organisms[0].health = 0.25;
    sim.tick_count = night_tick();
    sim.animals.push(wolf(&sim, 60.0, 61.0, true, 1.0));
    sim.animals.push(wolf(&sim, 60.0, 61.0, true, 1.0));
    run_animals(&mut sim, 60);
    assert!(
        sim.organisms[0].health <= 0.0,
        "a bite from a summoned pack takes a hurt person to zero (health {})",
        sim.organisms[0].health
    );
    assert_eq!(
        sim.organisms[0].fatal_harm(sim.tick_count),
        Some(crate::organism::organism::Harm::Beast),
        "the wound is recorded as a beast attack"
    );
}

#[test]
fn people_do_not_run_home_across_water_from_a_summoned_pack() {
    let mut sim = Simulation::new(37);
    flatten_test_area(&mut sim, 60, 60);
    only_people(&mut sim, &[(60.0, 60.0)]);
    // A lake lies between the person and home, which is 20 tiles north.
    for x in 55..=65 {
        for y in 48..=54 {
            sim.grid.set(x, y, Tile::Water);
        }
    }
    sim.organisms[0].home_x = 60.0;
    sim.organisms[0].home_y = 40.0;
    sim.tick_count = day_tick();
    sim.animals.push(wolf(&sim, 60.0, 68.0, true, 1.0));
    sim.tick();
    assert_ne!(
        sim.organisms[0].wander_target,
        Some((60, 40)),
        "home lies across the lake, so the flight does not aim for it"
    );
}

#[test]
fn a_wild_wolf_too_far_to_act_on_does_not_hide_a_summoned_pack() {
    let mut sim = Simulation::new(38);
    flatten_test_area(&mut sim, 60, 60);
    only_people(&mut sim, &[(60.0, 60.0)]);
    sim.organisms[0].home_y = 52.0;
    sim.tick_count = day_tick();
    // A wild wolf three tiles off is nearer than the pack, but beyond the 2.5 tiles a wild wolf can drive off.
    sim.animals.push(wolf(&sim, 60.0, 63.0, false, 1.0));
    sim.animals.push(wolf(&sim, 60.0, 68.0, true, 1.0));
    sim.tick();
    assert!(
        sim.organisms[0]
            .thought_history
            .iter()
            .any(|t| t.text.contains("run!")),
        "the person runs from the pack even with a wild wolf nearer"
    );
}
