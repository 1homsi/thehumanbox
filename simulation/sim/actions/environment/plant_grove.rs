use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood == 0 || !matches!(ctx.tile, Tile::Grass) {
        ctx.think("no saplings or unsuitable ground");
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.think("planting young trees in rows");
    ctx.discover(
        "grove_planting",
        "established a managed grove for future harvests",
    );
    ctx.event("build", "planted a grove of trees for food and timber");
    0.007
}
