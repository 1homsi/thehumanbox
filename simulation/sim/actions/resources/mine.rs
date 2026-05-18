//! Action 26: mine stone from an adjacent rock/mineral tile.

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.rock_near && ctx.org().carry_room() > 0 {
        let o = ctx.org_mut();
        o.inv_stone = o.inv_stone.saturating_add(1);
        ctx.think("mining stone");
        ctx.discover("mining", "learned to mine");
        0.012
    } else {
        ctx.think("looking for ore");
        0.0
    }
}
