//! Action 98: pillage. Damage a nearby structure + salvage wood.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    let mut hit = false;
    'pl: for dx in -3..=3 {
        for dy in -3..=3 {
            let (px, py) = (ix + dx, iy + dy);
            if ctx.sim.grid.structure_at(px, py) > 0.2 {
                ctx.sim.grid.add_structure(px, py, -0.10);
                ctx.sim.organisms[ctx.idx].inv_wood =
                    ctx.sim.organisms[ctx.idx].inv_wood.saturating_add(1);
                hit = true;
                break 'pl;
            }
        }
    }
    if hit {
        ctx.think("pillaging");
        ctx.discover("pillage", "pillaged a rival camp");
        0.012
    } else {
        ctx.think("scouting for plunder");
        0.0
    }
}
