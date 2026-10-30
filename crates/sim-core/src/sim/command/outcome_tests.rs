use crate::sim::simulation::Simulation;

/// Only the listed people are alive, each placed at the given point, and nobody else.
fn people_at(sim: &mut Simulation, who: &[(f32, f32, f32)]) {
    for o in sim.organisms.iter_mut() {
        o.alive = false;
    }
    for (slot, &(x, y, health)) in who.iter().enumerate() {
        let o = &mut sim.organisms[slot];
        o.alive = true;
        o.x = x;
        o.y = y;
        o.health = health;
        o.infection = 0.0;
    }
}

#[test]
fn healing_a_well_crowd_says_no_one_was_hurt() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 1.0), (61.0, 60.0, 1.0)]);
    sim.animals.clear();
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"heal","x":60.0,"y":60.0,"radius":4.0}"#);
    assert_eq!(outcome.code, "none_hurt", "nobody here needed healing");
    assert_eq!(outcome.count, 0);
}

#[test]
fn healing_counts_only_the_people_who_were_hurt() {
    let mut sim = Simulation::new(21);
    people_at(
        &mut sim,
        &[(60.0, 60.0, 0.3), (61.0, 60.0, 1.0), (62.0, 60.0, 0.5)],
    );
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"heal","x":60.0,"y":60.0,"radius":4.0}"#);
    assert!(outcome.applied);
    assert_eq!(outcome.code, "healed");
    assert_eq!(outcome.count, 2, "two of the three were hurt");
    assert_eq!(outcome.name, None, "a name is sent only for one person");
    assert_eq!(sim.organisms[0].health, 1.0);
}

#[test]
fn healing_one_person_names_them() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 0.3)]);
    let name = sim.organisms[0].name.clone();
    let outcome = sim.apply_command_reported(crate::sim::command::Command::Heal {
        x: 60.0,
        y: 60.0,
        radius: 4.0,
    });
    assert_eq!(outcome.code, "healed");
    assert_eq!(outcome.count, 1);
    assert_eq!(outcome.name.as_deref(), Some(name.as_str()));
}

#[test]
fn healing_only_animals_in_reach_says_they_were_fed() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[]);
    for a in sim.animals.iter_mut() {
        a.alive = false;
    }
    let mut animal =
        crate::organism::animal::Animal::new(9_001, 60.0, 60.0, crate::organism::animal::AnimalKind::Deer);
    animal.energy = 0.2;
    sim.animals.push(animal);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"heal","x":60.0,"y":60.0,"radius":4.0}"#);
    assert!(outcome.applied);
    assert_eq!(
        outcome.code, "healed_animals",
        "the animal was fed, and nobody was in reach"
    );
    assert_eq!(outcome.count, 1);
    assert_eq!(sim.animals.last().unwrap().energy, 1.0);
}

#[test]
fn heal_one_with_nobody_in_reach_says_so() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 0.3)]);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"heal_one","x":150.0,"y":150.0}"#);
    assert!(!outcome.applied);
    assert_eq!(outcome.code, "none_here");
}

#[test]
fn reviving_with_no_one_fallen_says_no_one_to_revive() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 1.0)]);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"revive","x":60.0,"y":60.0}"#);
    assert!(!outcome.applied);
    assert_eq!(outcome.code, "none_dead");
}

#[test]
fn an_unreadable_command_reports_failed() {
    let mut sim = Simulation::new(21);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"no_such_thing"}"#);
    assert!(!outcome.applied);
    assert_eq!(outcome.code, "failed");
}

#[test]
fn a_command_that_does_not_report_keeps_the_generic_code() {
    let mut sim = Simulation::new(21);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"eclipse"}"#);
    assert!(outcome.applied);
    assert_eq!(outcome.code, "applied");
}

#[test]
fn a_report_does_not_leak_into_the_next_command() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 0.3)]);
    let _ = sim.apply_command_json_reported(r#"{"cmd":"heal","x":60.0,"y":60.0,"radius":4.0}"#);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"eclipse"}"#);
    assert_eq!(
        outcome.code, "applied",
        "each command reports only its own result"
    );
}

#[test]
fn the_outcome_is_sent_as_json_with_its_fields() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 0.3)]);
    let json = serde_json::to_value(
        sim.apply_command_json_reported(r#"{"cmd":"heal","x":60.0,"y":60.0,"radius":4.0}"#),
    )
    .expect("an outcome serializes");
    assert_eq!(json["applied"], true);
    assert_eq!(json["code"], "healed");
    assert_eq!(json["count"], 1);
    assert!(json["name"].is_string());
}

#[test]
fn a_well_crowd_with_a_hungry_beast_reports_the_beast_fed() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 1.0)]);
    sim.animals.clear();
    let mut deer =
        crate::organism::animal::Animal::new(9_002, 61.0, 60.0, crate::organism::animal::AnimalKind::Deer);
    deer.energy = 0.2;
    sim.animals.push(deer);
    let outcome = sim.apply_command_json_reported(r#"{"cmd":"heal","x":60.0,"y":60.0,"radius":4.0}"#);
    assert!(outcome.applied);
    assert_eq!(
        outcome.code, "healed_animals",
        "nobody was hurt, but the deer was fed"
    );
}

#[test]
fn a_meteor_on_a_crowd_says_whom_it_killed_or_hurt() {
    let mut sim = Simulation::new(21);
    people_at(
        &mut sim,
        &[(60.0, 60.0, 1.0), (61.0, 60.0, 1.0), (60.0, 61.0, 1.0)],
    );
    let outcome = sim.apply_command_reported(crate::sim::command::Command::Meteor {
        x: 60,
        y: 60,
        radius: 4,
    });
    assert!(outcome.applied);
    assert!(
        matches!(outcome.code, "disaster_killed" | "disaster_hurt"),
        "got {}",
        outcome.code
    );
    assert!(outcome.count >= 1);
}

#[test]
fn a_quake_far_from_everyone_and_everything_says_nobody_was_in_its_way() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(10.0, 10.0, 1.0)]);
    sim.buildings.clear();
    let outcome = sim.apply_command_reported(crate::sim::command::Command::Earthquake {
        x: 300,
        y: 200,
        radius: 3,
    });
    if outcome.applied {
        assert_eq!(outcome.code, "disaster_none");
        assert_eq!(outcome.count, 0);
    }
}

#[test]
fn a_disaster_that_takes_time_counts_the_people_in_its_reach() {
    let mut sim = Simulation::new(21);
    people_at(&mut sim, &[(60.0, 60.0, 1.0), (62.0, 60.0, 1.0)]);
    let before = sim.disaster_before(&crate::sim::command::Command::Blight {
        x: 60,
        y: 60,
        radius: 5,
    });
    let before = before.expect("blight is a disaster");
    // Nothing changed yet (as with a blight on fields, or a fire still spreading): the report counts reach.
    sim.report_disaster(before);
    let report = sim.command_report.take().expect("a report");
    assert_eq!(report.code, "disaster_in_reach");
    assert_eq!(report.count, 2);
}

#[test]
fn a_helpful_tool_is_not_judged_as_a_disaster() {
    let sim = Simulation::new(21);
    assert!(sim
        .disaster_before(&crate::sim::command::Command::Heal {
            x: 1.0,
            y: 1.0,
            radius: 2.0
        })
        .is_none());
}
