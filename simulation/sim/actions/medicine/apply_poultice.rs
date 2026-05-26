use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx
        .kin
        .iter()
        .copied()
        .find(|&ki| ctx.sim.organisms[ki].infection > 0.0);
    let Some(ki) = pick else {
        let fallback = ctx.kin.first().copied();
        let Some(ki2) = fallback else {
            ctx.think("no kin to treat");
            return 0.0;
        };
        ctx.sim.organisms[ki2].infection = (ctx.sim.organisms[ki2].infection - 0.1).max(0.0);
        ctx.think("applying a poultice");
        ctx.event("medicine", "applied a poultice to reduce infection");
        return 0.007;
    };
    ctx.sim.organisms[ki].infection = (ctx.sim.organisms[ki].infection - 0.1).max(0.0);
    ctx.think("applying a poultice");
    ctx.event("medicine", "applied a poultice to reduce infection");
    0.007
}
