use super::super::ctx::ActionCtx;
use crate::world::{
    grid::TrailKind,
    tiles::{Biome, Tile},
};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().inv_food -= 1;
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.08).max(0.0);
    let mut restored = 0;
    for dy in -1i32..=1 {
        for dx in -1i32..=1 {
            if dx.abs() + dy.abs() > 1 {
                continue;
            }
            let (x, y) = (ctx.ix + dx, ctx.iy + dy);
            if !matches!(ctx.sim.grid.get(x, y), Tile::Grass | Tile::Ash | Tile::Scorched) {
                continue;
            }
            let water_distance =
                (-2i32..=2).any(|wx| (-2i32..=2).any(|wy| ctx.sim.grid.get(x + wx, y + wy) == Tile::Water));
            if !water_distance {
                continue;
            }
            ctx.sim.grid.set_biome(x, y, Biome::Wetland);
            if matches!(ctx.sim.grid.get(x, y), Tile::Ash | Tile::Scorched) {
                ctx.sim.grid.set(x, y, Tile::Grass);
            }
            ctx.sim.grid.restore_fertility(x, y, 0.20);
            ctx.sim.grid.relieve_hazard(x, y, 0.16);
            ctx.sim.grid.leave_trail(x, y, TrailKind::Food, 0.55);
            restored += 1;
        }
    }
    ctx.think("reopening wet ground and planting reeds");
    ctx.discover(
        "wetland_restoration",
        "restored wetland habitat beside open water",
    );
    ctx.event("build", &format!("restored {restored} wetland habitat tiles"));
    0.020 + restored as f32 * 0.006
}
