use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx
        .kin
        .iter()
        .copied()
        .find(|&ki| ctx.sim.organisms[ki].age < 300);
    let Some(_ki) = pick else {
        ctx.think("no young kin to name");
        return 0.0;
    };
    ctx.think("naming a child");
    ctx.event("birth", "gave a name to a newborn kin member");
    ctx.discover("naming", "established the tradition of naming children");
    0.012
}
