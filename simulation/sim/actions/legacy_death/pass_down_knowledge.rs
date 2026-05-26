use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder {
        return 0.0;
    }
    let young = ctx.kin.iter().copied().find(|&k| ctx.sim.organisms[k].age < 400);
    if young.is_none() {
        return 0.0;
    }
    ctx.think("passing my knowledge to the next generation");
    ctx.discover(
        "knowledge_inheritance",
        "an elder passed their wisdom to a younger kin",
    );
    ctx.event("culture", "elder shares accumulated knowledge with the young");
    0.012
}
