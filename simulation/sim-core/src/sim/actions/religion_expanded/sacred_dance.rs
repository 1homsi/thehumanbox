use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.len() < 2 {
        return 0.0;
    }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.06).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.06).min(1.0);
    ctx.event(
        "culture",
        "performing a sacred dance that fills all hearts with joy",
    );
    0.012
}
