

use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("seeking a rock face");
        return 0.0;
    }

    let disc = &ctx.sim.organisms[ctx.idx].discoveries;
    // Masonry and stone tools dramatically improve quarrying yield and speed
    let (yield_amount, reward): (u8, f32) = if disc.contains("masonry") {
        (2, 0.016)   // masonry: efficient extraction, 2 stone
    } else if disc.contains("stone_tools") || disc.contains("toolmaking") {
        (1, 0.012)   // basic tools: improved yield
    } else {
        (1, 0.008)   // bare hands: slow baseline
    };

    let o = ctx.org_mut();
    o.inv_stone = o.inv_stone.saturating_add(yield_amount);
    ctx.think(if yield_amount >= 2 { "mining efficiently" } else { "quarrying stone" });
    ctx.discover("quarrying", "opened a quarry");
    reward
}
