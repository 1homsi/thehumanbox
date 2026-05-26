use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx
        .kin
        .iter()
        .copied()
        .find(|&k| !ctx.sim.organisms[k].is_elder && ctx.sim.organisms[k].health > 0.5);
    let Some(ki) = pick else {
        ctx.think("no suitable warriors among kin");
        return 0.0;
    };
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort - 0.02).max(0.0);
    ctx.think("conscripting a warrior");
    ctx.event("warfare", "conscripted a young kin member for tribal defense");
    0.008
}
