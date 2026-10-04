//! Civilisation tick tests, grouped by what they cover. `test_org` is shared by
//! every group.

use super::*;
use crate::organism::organism::Organism;
use crate::organism::traits::Traits;

pub(super) fn test_org(id: &str, name: &str, lineage: &str, x: f32, y: f32) -> Organism {
    let mut org = Organism::new(
        id.to_string(),
        name.to_string(),
        x,
        y,
        0,
        String::new(),
        lineage.to_string(),
        20_000,
        Traits::default(),
    );
    org.alive = true;
    org.age = 1500;
    org.energy = 0.8;
    org.loneliness = 0.85;
    org
}

mod building_budget;
mod construction;
mod people;
mod politics_and_faith;
mod scenery_and_homes;
