
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("no kin to share with");
        return 0.0;
    }
    let food = ctx.sim.organisms[ctx.idx].inv_food;
    if food == 0 {
        ctx.think("nothing to distribute");
        return 0.0;
    }
    let denom = (ctx.kin.len() + 1).max(1) as u8;
    let share = food / denom;
    if share == 0 {
        ctx.think("too little to share fairly");
        return 0.0;
    }
    let count = ctx.kin.len().min(5);
    for i in 0..count {
        let ki = ctx.kin[i];
        ctx.sim.organisms[ki].inv_food += share;
    }
    ctx.sim.organisms[ctx.idx].inv_food =
        food.saturating_sub(share * count as u8);
    ctx.think("distributing wealth among kin");
    ctx.event("social", "shared food equally with all kin");
    0.01
}
