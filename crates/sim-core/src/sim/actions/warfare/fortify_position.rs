use super::super::ctx::ActionCtx;
use crate::sim::warfare::FieldFortification;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_stone == 0 && ctx.org().inv_wood == 0 {
        return 0.0;
    }
    let (ix, iy) = (ctx.ix, ctx.iy);
    let lineage_id = ctx.lid.to_string();
    ctx.consume_material();
    ctx.sim.grid.add_structure(ix, iy, 0.12);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    if let Some(fortification) = ctx
        .sim
        .field_fortifications
        .iter_mut()
        .find(|fortification| fortification.x == ix && fortification.y == iy)
    {
        fortification.lineage_id = lineage_id;
    } else {
        ctx.sim.field_fortifications.push(FieldFortification {
            x: ix,
            y: iy,
            lineage_id,
        });
    }
    ctx.think("digging in");
    0.005
}
