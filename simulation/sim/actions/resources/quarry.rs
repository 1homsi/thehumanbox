//! Action 29: quarry stone. Like mine but a separate discovery -
//! organising a "quarry" is a small step up from one-off mining.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.rock_near {
        let o = ctx.org_mut();
        o.inv_stone = o.inv_stone.saturating_add(1);
        ctx.think("quarrying");
        ctx.discover("quarrying", "opened a quarry");
        0.008
    } else {
        ctx.think("seeking a rock face");
        0.0
    }
}
