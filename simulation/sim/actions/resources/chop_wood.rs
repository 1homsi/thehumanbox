

use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) || ctx.org().carry_room() == 0 {
        return 0.0;
    }

    let disc = &ctx.sim.organisms[ctx.idx].discoveries;
    // Axe/stone tools improve wood yield and success rate
    let (success_p, yield_bonus): (f32, u8) = if disc.contains("axe") {
        (0.80, 1)   // axe: high success, 2 wood
    } else if disc.contains("stone_tools") || disc.contains("toolmaking") {
        (0.65, 0)   // stone tools: better success, 1 wood
    } else {
        (0.50, 0)   // bare hands: baseline
    };

    if ctx.chance(success_p) {
        let o = ctx.org_mut();
        o.inv_wood = o.inv_wood.saturating_add(1 + yield_bonus);
        ctx.think("chopping wood");
        ctx.discover("woodcutting", "learned to fell wood");
        0.010 + yield_bonus as f32 * 0.005
    } else {
        ctx.think("gathering timber");
        0.0
    }
}
