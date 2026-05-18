//! Action 230: redistribute inv items with nearby kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() {
        ctx.think("bearing burdens alone");
        return 0.0;
    }
    let my_food  = ctx.sim.organisms[ctx.idx].inv_food;
    let my_wood  = ctx.sim.organisms[ctx.idx].inv_wood;
    let my_stone = ctx.sim.organisms[ctx.idx].inv_stone;

    if my_food == 0 && my_wood == 0 && my_stone == 0 {
        ctx.think("nothing to share");
        return 0.0;
    }

    // Give one of whatever we have most to first kin
    let ki = ctx.kin[0];
    if my_food > 0 {
        ctx.sim.organisms[ctx.idx].inv_food -= 1;
        ctx.sim.organisms[ki].inv_food = ctx.sim.organisms[ki].inv_food.saturating_add(1);
    } else if my_wood > 0 {
        ctx.sim.organisms[ctx.idx].inv_wood -= 1;
        ctx.sim.organisms[ki].inv_wood = ctx.sim.organisms[ki].inv_wood.saturating_add(1);
    } else if my_stone > 0 {
        ctx.sim.organisms[ctx.idx].inv_stone -= 1;
        ctx.sim.organisms[ki].inv_stone = ctx.sim.organisms[ki].inv_stone.saturating_add(1);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.04).min(1.0);
    ctx.think("sharing the burden with kin");
    ctx.event("social", "redistributed supplies among kin");
    0.006
}
