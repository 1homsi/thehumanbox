use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    let young = ctx.kin.iter().copied().find(|&k| ctx.sim.organisms[k].age < 400);
    let Some(yi) = young else {
        return 0.0;
    };
    ctx.sim.organisms[yi].boredom = (ctx.sim.organisms[yi].boredom - 0.10).max(0.0);
    ctx.think("guiding the young with the patience of years");
    ctx.discover(
        "apprenticeship",
        "took on an apprentice to pass on a craft or skill",
    );
    0.012
}
