use super::super::ctx::ActionCtx;
use crate::world::tiles::Tile;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().inv_wood < 1 || !matches!(ctx.tile, Tile::Grass | Tile::Sand | Tile::Snow) {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    let (ix, iy) = (ctx.ix, ctx.iy);
    ctx.sim.grid.set(ix, iy, Tile::Hut);
    ctx.sim.grid.add_structure(ix, iy, 1.0);
    ctx.sim.active_structure_tiles.insert((ix, iy));

    // Reward scales with environmental need: storm exposure and poor health
    let weather_kind = ctx.sim.weather.kind;
    let health = ctx.sim.organisms[ctx.idx].health;
    let storm_bonus = if weather_kind >= 2 {
        0.12
    } else if weather_kind == 1 {
        0.04
    } else {
        0.0
    };
    let health_bonus = if health < 0.5 { (0.5 - health) * 0.08 } else { 0.0 };

    ctx.think("building shelter");
    ctx.discover("shelter", "built a hut");
    0.04 + storm_bonus + health_bonus
}
