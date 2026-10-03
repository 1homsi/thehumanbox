//! Registered actions: add an action with one file and one line.
//!
//! The older actions are described by large tables (`base_bands.rs`,
//! `band_table.rs`) and dispatched by id ranges in `mod.rs`. A registered
//! action carries all of that in one `ActionDef` constant next to its code:
//! when it can be chosen, what it does, and whether it counts as an
//! experiment. `registered/mod.rs` lists them; everything else (candidate
//! selection, eligibility, dispatch) already consults this registry.
//!
//! To add one, see `docs/ADDING_ACTIONS.md`.

use super::*;

/// Ids reserved for registered actions. Nothing else uses this range.
pub const FIRST_REGISTERED_ID: usize = 5930;
pub const LAST_REGISTERED_ID: usize = crate::organism::organism::ACTION_ID_SPACE - 1;

/// Everything the simulation needs to know about one action.
/// An extra check an action can add on top of its band: (sim, organism index, tile x, tile y).
pub type PossibleFn = fn(&Simulation, usize, i32, i32) -> bool;

pub struct ActionDef {
    /// Unique id in `FIRST_REGISTERED_ID..=LAST_REGISTERED_ID`.
    pub id: usize,
    /// Short snake_case name, for logs and tooling.
    pub name: &'static str,
    /// Counted under this name in the action statistics.
    pub category: &'static str,
    /// When the action may be chosen: era, age, company, place, resources,
    /// qualification. Build it with `band!(id, id, ...)`.
    pub band: ActionBand,
    /// An extra check beyond the band, evaluated at the organism's tile.
    pub possible: Option<PossibleFn>,
    /// Whether doing it counts as an experiment (feeds research).
    pub records_experiment: bool,
    /// What it does. Returns the reward.
    pub apply: fn(&mut ActionCtx) -> f32,
}

pub(super) fn all() -> &'static [&'static ActionDef] {
    registered::ALL
}

/// Every registered action as `(id, name)`, for tooling and docs.
pub fn registered_actions() -> impl Iterator<Item = (usize, &'static str)> {
    all().iter().map(|def| (def.id, def.name))
}

pub(super) fn find(action: usize) -> Option<&'static ActionDef> {
    if !(FIRST_REGISTERED_ID..=LAST_REGISTERED_ID).contains(&action) {
        return None;
    }
    all().iter().copied().find(|def| def.id == action)
}

/// The gates of every registered action, for the same eligibility pass the
/// table-driven bands go through.
pub(super) fn bands() -> impl Iterator<Item = ActionBand> {
    all().iter().map(|def| def.band)
}

/// False only for a registered action whose own check fails.
pub(super) fn is_possible(sim: &Simulation, idx: usize, action: usize, ix: i32, iy: i32) -> bool {
    match find(action) {
        Some(def) => def.possible.is_none_or(|check| check(sim, idx, ix, iy)),
        None => true,
    }
}

pub(super) fn records_experiment(action: usize) -> bool {
    find(action).is_some_and(|def| def.records_experiment)
}

pub(super) fn category(action: usize) -> Option<&'static str> {
    find(action).map(|def| def.category)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::spatial::SpatialIndex;

    #[test]
    fn every_registered_action_is_well_formed_and_unique() {
        let mut seen = std::collections::HashSet::new();
        for def in all() {
            assert!(
                (FIRST_REGISTERED_ID..=LAST_REGISTERED_ID).contains(&def.id),
                "{} has id {} outside the registered range",
                def.name,
                def.id
            );
            assert!(seen.insert(def.id), "{} reuses id {}", def.name, def.id);
            assert_eq!(
                (def.band.start, def.band.end),
                (def.id, def.id),
                "{}'s band must cover exactly its own id",
                def.name
            );
            assert!(!def.name.is_empty() && !def.category.is_empty());
        }
    }

    #[test]
    fn a_registered_action_is_offered_chosen_and_applied_like_any_other() {
        let mut sim = Simulation::new(7);
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].age = 9_000;
        let (ix, iy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        let offered = available_actions(&sim, idx, ix, iy, &spatial);
        assert!(
            offered.contains(&registered::sample::ID),
            "the sample action was not offered"
        );

        let reward = try_apply(&mut sim, idx, registered::sample::ID, ix, iy, &spatial)
            .expect("the sample action was not applied");
        assert!((reward - registered::sample::REWARD).abs() < 1e-6);
        assert_eq!(sim.organisms[idx].thought, "practising a registered action");
        assert_eq!(sim.action_counts.get("sample"), Some(&1));
        assert!(records_experiment(registered::sample::ID));
    }

    #[test]
    fn a_registered_actions_own_check_can_veto_it() {
        let mut sim = Simulation::new(7);
        let idx = sim.organisms.iter().position(|o| o.alive).unwrap();
        sim.organisms[idx].age = 9_000;
        sim.organisms[idx].health = 0.1;
        let (ix, iy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(!available_actions(&sim, idx, ix, iy, &spatial).contains(&registered::sample::ID));
    }
}
