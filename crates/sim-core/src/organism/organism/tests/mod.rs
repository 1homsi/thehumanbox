//! Organism tests, grouped by what they cover.

use super::*;
use rand::rngs::StdRng;
use rand::RngExt;
use rand::SeedableRng;

pub(super) fn learning_test_org(
    memory_strength: f32,
    curiosity: f32,
    fear: f32,
    resilience: f32,
) -> Organism {
    let mut org = Organism::new(
        "id".into(),
        "Learner".into(),
        0.0,
        0.0,
        0,
        "".into(),
        "lin".into(),
        5000,
        Traits {
            memory_strength,
            curiosity,
            fear,
            resilience,
            ..Traits::default()
        },
    );
    org.q_table.insert("next".into(), vec![(2, 1.0)]);
    org
}

mod archive_and_json;
mod choice;
mod learning;
mod movement;
mod perception;
