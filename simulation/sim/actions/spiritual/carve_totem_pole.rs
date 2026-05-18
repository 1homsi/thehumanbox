
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 {
        ctx.think("no wood for a pole");
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.add_structure(ix, iy, 0.04);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.think("carving a totem pole");
    ctx.discover("totem-pole", "raised a totem pole");
    0.010
}
