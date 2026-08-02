use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::world::{grid::TrailKind, tiles::Tile};

pub(crate) fn has_survey_subject(sim: &Simulation, ix: i32, iy: i32) -> bool {
    (-10..=10).any(|dx| {
        (-10..=10).any(|dy| {
            matches!(
                sim.grid.get(ix + dx, iy + dy),
                Tile::Food | Tile::Water | Tile::Rock | Tile::Mineral
            )
        })
    })
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let (ix, iy) = (ctx.ix, ctx.iy);
    let ms = ctx.org().traits.memory_strength;
    let mut mapped = 0usize;
    for dx in -10..=10 {
        for dy in -10..=10 {
            let (x, y) = (ix + dx, iy + dy);
            let strength = (0.60 - (dx.abs() + dy.abs()) as f32 * 0.018).max(0.16);
            match ctx.sim.grid.get(x, y) {
                Tile::Food => {
                    Organism::remember(&mut ctx.sim.organisms[ctx.idx].food_memory, x, y, strength, ms);
                    mapped += 1;
                }
                Tile::Water => {
                    Organism::remember(&mut ctx.sim.organisms[ctx.idx].water_memory, x, y, strength, ms);
                    mapped += 1;
                }
                _ => {}
            }
        }
    }
    if mapped == 0 && !has_survey_subject(ctx.sim, ix, iy) {
        return 0.0;
    }
    ctx.sim.grid.add_structure(ix, iy, 0.10);
    ctx.sim.active_structure_tiles.insert((ix, iy));
    ctx.sim.grid.leave_trail(ix, iy, TrailKind::Path, 2.2);
    ctx.think("mapping a useful landmark");
    ctx.discover("landmarks", "mapped a useful landmark");
    0.005 + mapped.min(8) as f32 * 0.001
}
