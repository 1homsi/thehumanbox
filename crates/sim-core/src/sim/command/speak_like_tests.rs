//! `spawn` with `speak_like`: newcomers take the words of a people already there.

use super::*;

fn living_near(sim: &Simulation, x: f32, y: f32) -> &crate::organism::organism::Organism {
    sim.organisms
        .iter()
        .filter(|o| o.alive)
        .min_by(|a, b| {
            let da = (a.x - x).powi(2) + (a.y - y).powi(2);
            let db = (b.x - x).powi(2) + (b.y - y).powi(2);
            da.total_cmp(&db)
        })
        .expect("someone is alive")
}

#[test]
fn newcomers_who_speak_like_a_nearby_people_take_their_words() {
    let mut sim = Simulation::new(9);
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":5}"#));
    let west_words = living_near(&sim, 100.0, 100.0).vocabulary.words();
    assert!(!west_words.is_empty(), "the first people know some words");

    let before = sim.organisms.len();
    assert!(
        sim.apply_command_json(r#"{"cmd":"spawn","x":112.0,"y":100.0,"count":5,"speak_like":[100.0,100.0]}"#)
    );

    let newcomers = &sim.organisms[before..];
    assert_eq!(newcomers.len(), 5);
    for person in newcomers {
        assert_eq!(person.vocabulary.words(), west_words);
    }
    // They are their own tribe, so their words drift on their own from here.
    let west_lineage = living_near(&sim, 100.0, 100.0).lineage_id.clone();
    assert!(newcomers.iter().all(|p| p.lineage_id != west_lineage));
}

#[test]
fn without_speak_like_each_newcomer_keeps_their_own_words() {
    let mut sim = Simulation::new(9);
    let before = sim.organisms.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":5}"#));
    let newcomers = &sim.organisms[before..];
    let first = newcomers[0].vocabulary.words();
    assert!(newcomers.iter().any(|p| p.vocabulary.words() != first));
}

#[test]
fn speak_like_with_nobody_near_leaves_newcomers_with_their_own_words() {
    let mut sim = Simulation::new(9);
    let before = sim.organisms.len();
    assert!(sim.apply_command_json(r#"{"cmd":"spawn","x":100.0,"y":100.0,"count":5,"speak_like":[2.0,2.0]}"#));
    let newcomers = &sim.organisms[before..];
    assert_eq!(newcomers.len(), 5);
    let first = newcomers[0].vocabulary.words();
    assert!(newcomers.iter().any(|p| p.vocabulary.words() != first));
}
