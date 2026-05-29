use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("celebrating alone");
        return 0.002;
    }
    let kin = ctx.kin.clone();
    for ki in kin {
        ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.06).min(1.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.06).min(1.0);
    ctx.think("cheering with the group");
    ctx.event(
        "culture",
        "celebrated a shared victory, raising everyone's spirits",
    );
    0.010
}
