//! Action 28: fish. Requires water within 2 tiles. 30% catch rate.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near {
        ctx.think("looking for water to fish");
        return 0.0;
    }
    if ctx.chance(0.30) {
        let o = ctx.org_mut();
        o.inv_food = o.inv_food.saturating_add(1);
        ctx.think("caught a fish");
        ctx.discover("fishing", "learned to fish");
        0.02
    } else {
        ctx.think("fishing the shallows");
        0.0
    }
}
