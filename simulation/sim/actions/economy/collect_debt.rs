//! Action 281: reclaim lent goods from a stranger; inv_wood += 1 if chance(0.4).
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let has_stranger = ctx.near.iter().copied()
        .any(|k| ctx.sim.organisms[k].lineage_id != lid);
    if !has_stranger {
        ctx.think("no debtor in sight");
        return 0.0;
    }
    if ctx.chance(0.4) {
        ctx.sim.organisms[ctx.idx].inv_wood += 1;
        ctx.think("collected the debt");
        0.008
    } else {
        ctx.think("debt still unpaid");
        0.002
    }
}
