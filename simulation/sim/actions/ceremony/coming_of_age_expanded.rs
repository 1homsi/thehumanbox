
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let young = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].age >= 300 && ctx.sim.organisms[k].age <= 500);
    if young.is_none() { return 0.0; }
    ctx.think("marking the passage from youth to adulthood");
    ctx.discover("rites_of_passage", "held the first coming of age ceremony");
    ctx.event("ritual", "a young tribesman is celebrated as they reach adulthood");
    0.010
}
