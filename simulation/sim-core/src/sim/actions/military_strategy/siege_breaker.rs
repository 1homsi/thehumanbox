use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let stranger_near = ctx
        .near
        .iter()
        .any(|&i| ctx.sim.organisms[i].lineage_id != ctx.lid);
    if !stranger_near || !ctx.rock_near {
        return 0.0;
    }
    ctx.event("warfare", "smashing through a siege line with concentrated force");
    ctx.discover("siege_breaking", "successfully broke a siege");
    0.045
}
