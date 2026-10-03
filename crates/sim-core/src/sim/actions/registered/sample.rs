//! A worked example, compiled only in tests: the smallest complete action.

use super::*;

pub const ID: usize = LAST_REGISTERED_ID;
pub const REWARD: f32 = 0.0123;

pub const DEF: ActionDef = ActionDef {
    id: ID,
    name: "sample",
    category: "sample",
    // Any adult, anywhere, any era, no resources, no qualification.
    band: band!(6143, 6143, PreStone, AdultOrElder, None, PlaceGate::Anywhere, None, Q_NONE),
    // A tired organism has no energy for it.
    possible: Some(|sim, idx, _ix, _iy| sim.organisms[idx].health > 0.3),
    records_experiment: true,
    apply,
};

fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("practising a registered action");
    REWARD
}
