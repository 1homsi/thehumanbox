use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        return 0.0;
    }
    ctx.think("letting grief flow freely so healing can begin");
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort - 0.02).max(0.0);
        o.comfort = (o.comfort + 0.06).min(1.0);
    }
    let o = ctx.org_mut();
    o.comfort = (o.comfort - 0.02).max(0.0);
    o.comfort = (o.comfort + 0.06).min(1.0);
    ctx.event("death", "a mourning ceremony helps the tribe process their grief");
    0.008
}
