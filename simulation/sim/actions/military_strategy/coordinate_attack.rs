//! Action 448: coordinate a multi-unit attack on an enemy.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_near = ctx.near.iter().any(|&i| ctx.sim.organisms[i].lineage_id != ctx.lid);
    if ctx.kin.len() < 2 || !stranger_near { return 0.0; }
    ctx.event("warfare", "coordinating a simultaneous assault from multiple directions");
    ctx.discover("coordinated_assault", "executed the first coordinated attack");
    0.018
}
