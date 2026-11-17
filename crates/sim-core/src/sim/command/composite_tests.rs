use super::composite::MAX_COMPOSITE_STEPS;
use crate::sim::simulation::Simulation;
use serde_json::{json, Value};

fn save(sim: &Simulation) -> Vec<u8> {
    serde_json::to_vec(&sim.to_save_state()).expect("save serializes")
}

fn lived_in() -> (Simulation, f32, f32) {
    let mut sim = Simulation::new(23);
    for _ in 0..200 {
        sim.tick();
    }
    let person = sim.organisms.iter().find(|o| o.alive).expect("someone lives");
    let (x, y) = (person.x, person.y);
    (sim, x, y)
}

fn copy(sim: &Simulation) -> Simulation {
    Simulation::from_save(7, sim.to_save_state())
}

fn firestorm(x: f32, y: f32) -> Vec<Value> {
    vec![
        json!({"cmd": "ignite", "x": x.round() as i32, "y": y.round() as i32, "radius": 4}),
        json!({"cmd": "thunder", "x": x, "y": y, "radius": 6.0}),
        json!({"cmd": "gale"}),
    ]
}

#[test]
fn a_composite_makes_the_same_world_as_its_steps_sent_one_by_one() {
    let (base, x, y) = lived_in();
    let steps = firestorm(x, y);

    let mut by_hand = copy(&base);
    for step in &steps {
        by_hand.apply_command_json(&step.to_string());
    }
    let mut composite = copy(&base);
    let outcome =
        composite.apply_command_json_reported(&json!({"cmd": "composite", "steps": steps}).to_string());

    assert!(outcome.applied);
    assert_eq!(save(&composite), save(&by_hand));
}

#[test]
fn a_composite_reports_its_last_step_that_landed() {
    let (base, x, y) = lived_in();
    let heal = json!({"cmd": "heal", "x": x, "y": y, "radius": 4.0});
    let mut alone = copy(&base);
    let expected = alone.apply_command_json_reported(&heal.to_string());
    let mut composite = copy(&base);
    let missed = json!({"cmd": "paint", "x": 1, "y": 1, "tile": "no_such_tile"});
    let outcome = composite
        .apply_command_json_reported(&json!({"cmd": "composite", "steps": [heal, missed]}).to_string());
    assert_eq!(outcome, expected);
}

#[test]
fn a_composite_with_no_steps_too_many_or_a_nested_one_changes_nothing() {
    let (base, x, y) = lived_in();
    let step = json!({"cmd": "gale"});
    let nested = json!({"cmd": "composite", "steps": [step]});
    let rejected = [
        json!({"cmd": "composite", "steps": []}),
        json!({"cmd": "composite", "steps": vec![step.clone(); MAX_COMPOSITE_STEPS + 1]}),
        json!({"cmd": "composite", "steps": [step, nested]}),
        json!({"cmd": "composite", "steps": [{"cmd": "paint", "x": x as i32, "y": y as i32, "tile": "no_such_tile"}]}),
        json!({"cmd": "composite"}),
    ];
    for cmd in rejected {
        let mut sim = copy(&base);
        let before = save(&sim);
        let outcome = sim.apply_command_json_reported(&cmd.to_string());
        assert!(!outcome.applied, "{cmd}");
        assert_eq!(save(&sim), before, "{cmd}");
    }
}

#[test]
fn a_full_composite_runs_every_step() {
    let (base, _, _) = lived_in();
    let steps = vec![json!({"cmd": "gale"}); MAX_COMPOSITE_STEPS];
    let mut by_hand = copy(&base);
    for step in &steps {
        by_hand.apply_command_json(&step.to_string());
    }
    let mut composite = copy(&base);
    assert!(composite.apply_command_json(&json!({"cmd": "composite", "steps": steps}).to_string()));
    assert_eq!(save(&composite), save(&by_hand));
}
