
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_near = ctx.near.iter().any(|&i| ctx.sim.organisms[i].lineage_id != ctx.lid);
    if !stranger_near { return 0.0; }
    ctx.event("warfare", "executing a flanking maneuver on the enemy");
    ctx.discover("flanking_maneuver", "first successful flanking attack");
    0.040
}
