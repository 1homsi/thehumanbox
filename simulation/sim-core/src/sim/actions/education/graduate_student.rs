use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let young = ctx.kin.iter().copied().find(|&k| ctx.sim.organisms[k].age < 400);
    if young.is_none() {
        return 0.0;
    }
    ctx.think("celebrating the completion of a student's learning");
    ctx.discover("graduation", "held the first graduation ceremony");
    ctx.event("culture", "a young member of the tribe completes their studies");
    0.010
}
