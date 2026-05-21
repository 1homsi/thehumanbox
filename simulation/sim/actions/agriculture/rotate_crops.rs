
use crate::world::tiles::Tile;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Food | Tile::Grass) { return 0.0; }

    // Crop rotation restores significant fertility - the highest-impact tending action.
    // Requires knowing crop_rotation; organisms learn it by doing this enough times.
    let has_rotation = ctx.sim.organisms[ctx.idx].discoveries.contains("crop_rotation");
    let fertility_gain = if has_rotation { 0.10 } else { 0.04 };
    ctx.sim.grid.restore_fertility(ctx.ix, ctx.iy, fertility_gain);

    ctx.think("rotating the crops");
    ctx.discover("crop_rotation", "learned to rotate crops to restore the soil");
    ctx.event("build", "applied crop rotation to the fields");
    0.012
}
